/**
 * Agent Runtime Engine
 *
 * Lifecycle management for agents:
 * - Initialization
 * - Scheduling
 * - Execution with timeout
 * - Retry with exponential backoff
 * - Cancellation
 * - History tracking
 * - Metrics
 */

import { smartCompletion, type AICapability } from "./ai-router";
import { recordAIMetric } from "./observability";
import { EventBus, emitAgentEvent } from "./event-bus";
import { getAgent } from "./agents/definitions";
import type { Agent, AgentRole } from "./agents/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentState = "idle" | "scheduled" | "running" | "waiting" | "completed" | "failed" | "cancelled";

export type AgentPriority = "low" | "normal" | "high" | "critical";

export interface AgentTask {
  id: string;
  agentRole: AgentRole;
  query: string;
  context?: Record<string, unknown>;
  priority: AgentPriority;
  state: AgentState;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  timeoutMs: number;
  maxRetries: number;
  retryCount: number;
  result?: string;
  error?: string;
  correlationId: string;
  dependencies?: string[]; // task IDs that must complete first
}

export interface AgentExecution {
  taskId: string;
  startTime: Date;
  endTime?: Date;
  durationMs?: number;
  success: boolean;
  modelUsed?: string;
  tokensUsed?: number;
  error?: string;
}

// ─── Runtime State ────────────────────────────────────────────────────────────

class AgentRuntimeClass {
  private taskQueue: AgentTask[] = [];
  private activeTasks: Map<string, AgentTask> = new Map();
  private executionHistory: AgentExecution[] = [];
  private maxConcurrent = 3;
  private taskCounter = 0;
  private metrics = {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    cancelledTasks: 0,
    totalExecutionTimeMs: 0,
    currentQueueSize: 0,
    maxQueueSize: 100,
  };

  // ─── Task Creation ──────────────────────────────────────────────────────────

  createTask(
    agentRole: AgentRole,
    query: string,
    options: {
      context?: Record<string, unknown>;
      priority?: AgentPriority;
      timeoutMs?: number;
      maxRetries?: number;
      dependencies?: string[];
    } = {}
  ): string {
    const taskId = `task_${++this.taskCounter}_${Date.now()}`;

    const task: AgentTask = {
      id: taskId,
      agentRole,
      query,
      context: options.context,
      priority: options.priority || "normal",
      state: "scheduled",
      createdAt: new Date(),
      timeoutMs: options.timeoutMs || 30000,
      maxRetries: options.maxRetries ?? 2,
      retryCount: 0,
      correlationId: `corr_${taskId}`,
      dependencies: options.dependencies,
    };

    // Check queue capacity
    if (this.taskQueue.length >= this.metrics.maxQueueSize) {
      // Remove lowest priority task
      this.taskQueue.sort(this.comparePriority);
      this.taskQueue.pop();
    }

    this.taskQueue.push(task);
    this.taskQueue.sort(this.comparePriority);
    this.metrics.totalTasks++;
    this.metrics.currentQueueSize = this.taskQueue.length;

    emitAgentEvent("runtime", "scheduled", { taskId, agentRole, priority: task.priority });

    this.processQueue();

    return taskId;
  }

  private comparePriority(a: AgentTask, b: AgentTask): number {
    const priorityWeight: Record<AgentPriority, number> = {
      critical: 4,
      high: 3,
      normal: 2,
      low: 1,
    };
    return priorityWeight[b.priority] - priorityWeight[a.priority];
  }

  // ─── Task Execution ──────────────────────────────────────────────────────────

  private async processQueue(): Promise<void> {
    while (this.activeTasks.size < this.maxConcurrent && this.taskQueue.length > 0) {
      const task = this.taskQueue.shift();
      if (!task) break;

      // Check dependencies
      if (task.dependencies) {
        const depsComplete = task.dependencies.every(depId =>
          this.executionHistory.some(h => h.taskId === depId && h.success)
        );
        if (!depsComplete) {
          // Re-queue with delay
          this.taskQueue.push(task);
          continue;
        }
      }

      this.activeTasks.set(task.id, task);
      this.metrics.currentQueueSize = this.taskQueue.length;

      // Execute asynchronously
      this.executeTask(task).finally(() => {
        this.activeTasks.delete(task.id);
        this.processQueue();
      });
    }
  }

  private async executeTask(task: AgentTask): Promise<void> {
    const agent = getAgent(task.agentRole);
    if (!agent) {
      this.markTaskFailed(task, "Agent not found");
      return;
    }

    task.state = "running";
    task.startedAt = new Date();

    emitAgentEvent("runtime", "started", { taskId: task.id, agentRole: task.agentRole });

    const execution: AgentExecution = {
      taskId: task.id,
      startTime: task.startedAt,
      success: false,
    };

    try {
      const result = await this.runWithTimeout(
        this.executeAgentLogic(agent, task),
        task.timeoutMs
      );

      task.result = result.content;
      task.state = "completed";
      task.completedAt = new Date();
      execution.endTime = task.completedAt;
      execution.durationMs = task.completedAt.getTime() - task.startedAt.getTime();
      execution.success = true;
      execution.modelUsed = result.model;

      this.metrics.completedTasks++;
      this.metrics.totalExecutionTimeMs += execution.durationMs;


      emitAgentEvent("runtime", "completed", {
        taskId: task.id,
        agentRole: task.agentRole,
        durationMs: execution.durationMs,
        model: result.model,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";

      if (task.retryCount < task.maxRetries && !this.isCancellationError(err)) {
        task.retryCount++;
        task.state = "scheduled";

        // Exponential backoff
        const backoffMs = Math.min(1000 * Math.pow(2, task.retryCount), 10000);
        await new Promise(r => setTimeout(r, backoffMs));

        // Re-run
        this.activeTasks.delete(task.id);
        this.executeTask(task);
        return;
      }

      this.markTaskFailed(task, errorMessage);
      execution.endTime = new Date();
      execution.durationMs = execution.endTime.getTime() - task.startedAt.getTime();
      execution.error = errorMessage;
    }

    this.executionHistory.push(execution);
    if (this.executionHistory.length > 1000) {
      this.executionHistory.shift();
    }
  }

  private async executeAgentLogic(
    agent: Agent,
    task: AgentTask
  ): Promise<{ content: string; model: string }> {
    const taskType = this.getTaskTypeForAgent(agent.role);
    const startTime = Date.now();

    const messages = [
      { role: "system" as const, content: agent.systemPrompt },
      { role: "user" as const, content: task.query },
    ];

    const result = await smartCompletion(taskType, messages, {
      maxTokens: 800,
    });

    recordAIMetric({
      timestamp: new Date(),
      model: result.model,
      provider: "replit",
      taskType: agent.role,
      latencyMs: Date.now() - startTime,
      success: true,
    });

    return { content: result.content, model: result.model };
  }

  private getTaskTypeForAgent(role: AgentRole): AICapability {
    const mapping: Partial<Record<AgentRole, AICapability>> = {
      chief_of_staff: "analysis",
      engineering: "code",
      product: "reasoning",
      business: "reasoning",
      marketing: "creative",
      research: "analysis",
      memory: "analysis",
      decision: "reasoning",
      studio: "creative",
      devops: "code",
      red_team: "analysis",
      planning: "reasoning",
    };
    return mapping[role] || "fast_chat";
  }

  private runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout")), timeoutMs);
      promise.then(resolve).catch(reject).finally(() => clearTimeout(timer));
    });
  }

  private isCancellationError(err: unknown): boolean {
    return err instanceof Error && err.message === "Cancelled";
  }

  private markTaskFailed(task: AgentTask, error: string): void {
    task.state = "failed";
    task.error = error;
    task.completedAt = new Date();
    this.metrics.failedTasks++;

    emitAgentEvent("runtime", "failed", {
      taskId: task.id,
      agentRole: task.agentRole,
      error,
      retryCount: task.retryCount,
    });
  }

  // ─── Task Management ────────────────────────────────────────────────────────

  cancelTask(taskId: string): boolean {
    const task = this.activeTasks.get(taskId);
    if (task && task.state === "running") {
      task.state = "cancelled";
      task.completedAt = new Date();
      this.metrics.cancelledTasks++;

      emitAgentEvent("runtime", "cancelled", { taskId, agentRole: task.agentRole });
      return true;
    }

    // Check queue
    const idx = this.taskQueue.findIndex(t => t.id === taskId);
    if (idx >= 0) {
      const [removed] = this.taskQueue.splice(idx, 1);
      removed.state = "cancelled";
      this.metrics.cancelledTasks++;
      this.metrics.currentQueueSize = this.taskQueue.length;

      emitAgentEvent("runtime", "cancelled", { taskId, agentRole: removed.agentRole });
      return true;
    }

    return false;
  }

  getTaskStatus(taskId: string): AgentTask | null {
    const active = this.activeTasks.get(taskId);
    if (active) return active;

    return this.taskQueue.find(t => t.id === taskId) || null;
  }

  getExecutionHistory(limit = 50): AgentExecution[] {
    return this.executionHistory.slice(-limit);
  }

  getMetrics() {
    const avgExecutionTimeMs = this.metrics.completedTasks > 0
      ? this.metrics.totalExecutionTimeMs / this.metrics.completedTasks
      : 0;
    return { ...this.metrics, avgExecutionTimeMs, activeTasks: this.activeTasks.size };
  }

  // ─── Bulk Operations ────────────────────────────────────────────────────────

  cancelAllTasks(): number {
    let count = this.activeTasks.size;
    for (const task of this.activeTasks.values()) {
      this.cancelTask(task.id);
    }
    count += this.taskQueue.length;
    this.taskQueue = [];
    this.metrics.currentQueueSize = 0;
    return count;
  }

  prioritizeTask(taskId: string, priority: AgentPriority): boolean {
    const task = this.taskQueue.find(t => t.id === taskId);
    if (task) {
      task.priority = priority;
      this.taskQueue.sort(this.comparePriority);
      return true;
    }
    return false;
  }
}

export const AgentRuntime = new AgentRuntimeClass();
