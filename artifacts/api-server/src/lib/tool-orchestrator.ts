/**
 * Tool Orchestrator
 *
 * All tools pass through a single orchestrator:
 * - Validation (Zod schemas)
 * - Permission checks
 * - Audit logging
 * - Metrics collection
 * - Rollback capability
 * - Rate limiting
 * - Timeout enforcement
 *
 * No direct tool calls - everything goes through here.
 */

import { z } from "zod";
import { db } from "@workspace/db";
import { logActivity } from "./activity";
import { recordToolMetric } from "./observability";
import { emitToolEvent } from "./event-bus";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToolPermission = "read" | "write" | "delete" | "external" | "admin";

export interface ToolDefinition {
  name: string;
  description: string;
  permission: ToolPermission;
  parameters: z.ZodObject<any>;
  timeout: number;
  maxRetries: number;
  rateLimit?: number;
  rollback?: (params: Record<string, unknown>, result: unknown) => Promise<void>;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
}

export interface OrchestratedExecution {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  permission: ToolPermission;
  success: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
  retryCount: number;
  rolledBack: boolean;
  timestamp: Date;
}

// ─── Orchestrator Core ─────────────────────────────────────────────────────────

class ToolOrchestratorClass {
  private tools: Map<string, ToolDefinition> = new Map();
  private callLog: Map<string, number[]> = new Map();
  private recentExecutions: OrchestratedExecution[] = [];
  private maxExecutionsLog = 200;

  // ─── Tool Registration ──────────────────────────────────────────────────────

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    this.callLog.set(tool.name, []);
    emitToolEvent("orchestrator", "created", { tool: tool.name, permission: tool.permission });
  }

  // ─── Main Execution ──────────────────────────────────────────────────────────

  async execute(
    toolName: string,
    params: Record<string, unknown>,
    context?: {
      userId?: string;
      conversationId?: number;
      skipRateLimit?: boolean;
      skipPermissionCheck?: boolean;
      permissionLevel?: ToolPermission;
    }
  ): Promise<OrchestratedExecution> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const startTime = Date.now();

    const tool = this.tools.get(toolName);

    if (!tool) {
      return this.createExecution(executionId, toolName, params, "admin", false, undefined, "Unknown tool", 0, 0, false);
    }

    // ─── Rate Limiting ──────────────────────────────────────────────────────────
    if (tool.rateLimit && !context?.skipRateLimit) {
      const recent = this.callLog.get(toolName) || [];
      const now = Date.now();
      const recentCalls = recent.filter(t => now - t < 60000);

      if (recentCalls.length >= tool.rateLimit) {
        return this.createExecution(executionId, toolName, params, tool.permission, false, undefined, "Rate limit exceeded", Date.now() - startTime, 0, false);
      }

      recentCalls.push(now);
      this.callLog.set(toolName, recentCalls);
    }

    // ─── Permission Check ───────────────────────────────────────────────────────
    if (!context?.skipPermissionCheck && context?.permissionLevel) {
      const allowed = this.checkPermission(tool.permission, context.permissionLevel);
      if (!allowed) {
        return this.createExecution(executionId, toolName, params, tool.permission, false, undefined, "Permission denied", Date.now() - startTime, 0, false);
      }
    }

    // ─── Validation ─────────────────────────────────────────────────────────────
    const parsed = tool.parameters.safeParse(params);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
      return this.createExecution(executionId, toolName, params, tool.permission, false, undefined, `Validation: ${errorMsg}`, Date.now() - startTime, 0, false);
    }

    // ─── Execute with Retries ───────────────────────────────────────────────────
    let lastError: string | undefined;
    let retryCount = 0;
    let result: unknown;

    for (let attempt = 0; attempt <= tool.maxRetries; attempt++) {
      if (attempt > 0) retryCount++;

      try {
        result = await this.executeWithTimeout(tool, parsed.data);

        // ─── Log Success ────────────────────────────────────────────────────────
        await logActivity("tool", tool.name, `Tool ${toolName} executed`, context?.conversationId || 0);

        recordToolMetric({
          timestamp: new Date(),
          tool: toolName,
          success: true,
          latencyMs: Date.now() - startTime,
          retryCount,
        });

        const execution = this.createExecution(
          executionId, toolName, params, tool.permission, true, result, undefined, Date.now() - startTime, retryCount, false
        );

        emitToolEvent("orchestrator", "completed", { tool: toolName, executionId, durationMs: execution.durationMs });

        return execution;

      } catch (err) {
        lastError = err instanceof Error ? err.message : "Unknown error";

        // Don't retry on validation/permission errors
        if (lastError.includes("Validation") || lastError.includes("Permission")) {
          break;
        }

        // Exponential backoff
        if (attempt < tool.maxRetries) {
          const backoff = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise(r => setTimeout(r, backoff));
        }
      }
    }

    // ─── Handle Failure ─────────────────────────────────────────────────────────
    await logActivity("tool", tool.name, `Tool ${toolName} failed: ${lastError}`, context?.conversationId || 0);

    recordToolMetric({
      timestamp: new Date(),
      tool: toolName,
      success: false,
      latencyMs: Date.now() - startTime,
      retryCount,
      errorCode: lastError,
    });

    // Attempt rollback if available
    let rolledBack = false;
    if (tool.rollback && result) {
      try {
        await tool.rollback(params, result);
        rolledBack = true;
      } catch {
        // Rollback failed
      }
    }

    return this.createExecution(
      executionId, toolName, params, tool.permission, false, undefined, lastError, Date.now() - startTime, retryCount, rolledBack
    );
  }

  private async executeWithTimeout(tool: ToolDefinition, params: Record<string, unknown>): Promise<unknown> {
    const controller = new AbortController();

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        controller.abort();
        reject(new Error("Timeout"));
      }, tool.timeout);
    });

    return Promise.race([
      tool.execute(params),
      timeoutPromise,
    ]);
  }

  private createExecution(
    id: string,
    tool: string,
    params: Record<string, unknown>,
    permission: ToolPermission,
    success: boolean,
    result: unknown | undefined,
    error: string | undefined,
    durationMs: number,
    retryCount: number,
    rolledBack: boolean
  ): OrchestratedExecution {
    const execution: OrchestratedExecution = {
      id,
      tool,
      params,
      permission,
      success,
      result,
      error,
      durationMs,
      retryCount,
      rolledBack,
      timestamp: new Date(),
    };

    this.recentExecutions.push(execution);
    if (this.recentExecutions.length > this.maxExecutionsLog) {
      this.recentExecutions.shift();
    }

    return execution;
  }

  // ─── Permission Logic ─────────────────────────────────────────────────────────

  private permissionHierarchy: Record<ToolPermission, number> = {
    admin: 5,
    external: 4,
    delete: 3,
    write: 2,
    read: 1,
  };

  private checkPermission(required: ToolPermission, provided: ToolPermission): boolean {
    return this.permissionHierarchy[provided] >= this.permissionHierarchy[required];
  }

  // ─── Query Methods ────────────────────────────────────────────────────────────

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  listTools(): string[] {
    return Array.from(this.tools.keys());
  }

  getRecentExecutions(limit = 50): OrchestratedExecution[] {
    return this.recentExecutions.slice(-limit);
  }

  getToolMetrics(): Record<string, { calls: number; successRate: number; avgLatencyMs: number }> {
    const stats: Record<string, { success: number; failed: number; totalLatency: number }> = {};

    for (const exec of this.recentExecutions) {
      if (!stats[exec.tool]) {
        stats[exec.tool] = { success: 0, failed: 0, totalLatency: 0 };
      }
      if (exec.success) {
        stats[exec.tool].success++;
      } else {
        stats[exec.tool].failed++;
      }
      stats[exec.tool].totalLatency += exec.durationMs;
    }

    const result: Record<string, { calls: number; successRate: number; avgLatencyMs: number }> = {};
    for (const [tool, s] of Object.entries(stats)) {
      const total = s.success + s.failed;
      result[tool] = {
        calls: total,
        successRate: total > 0 ? s.success / total : 0,
        avgLatencyMs: total > 0 ? s.totalLatency / total : 0,
      };
    }

    return result;
  }

  getRateLimitStatus(): Record<string, { used: number; limit: number }> {
    const status: Record<string, { used: number; limit: number }> = {};
    const now = Date.now();

    for (const [tool, calls] of this.callLog.entries()) {
      const toolDef = this.tools.get(tool);
      if (toolDef?.rateLimit) {
        const recentCalls = calls.filter(t => now - t < 60000);
        status[tool] = { used: recentCalls.length, limit: toolDef.rateLimit };
      }
    }

    return status;
  }
}

export const ToolOrchestrator = new ToolOrchestratorClass();

// ─── Helper to register existing tools ──────────────────────────────────────────

export function registerBuiltinTools(): void {
  // These would import from the existing tools/index.ts
  // For now, this serves as the orchestrator pattern that wraps existing tools
}
