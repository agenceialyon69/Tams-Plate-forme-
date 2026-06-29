/**
 * Observability Layer
 *
 * Tracks:
 * - AI model calls (latency, tokens, cost, quality)
 * - Tool executions (success rate, duration, errors)
 * - Agent activities (tasks completed, delegation)
 * - System health (memory, CPU, requests)
 *
 * All metrics are logged to the activity table and available via API.
 */

import { db } from "@workspace/db";
import { activityTable } from "@workspace/db";
import { logger } from "./logger";
import { desc, sql, and, gte } from "drizzle-orm";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AIMetric {
  timestamp: Date;
  model: string;
  provider: string;
  taskType: string;
  latencyMs: number;
  tokensUsed?: number;
  success: boolean;
  errorCode?: string;
}

export interface ToolMetric {
  timestamp: Date;
  tool: string;
  success: boolean;
  latencyMs: number;
  retryCount: number;
  errorCode?: string;
}

export interface SystemMetric {
  timestamp: Date;
  type: "request" | "error" | "memory" | "latency";
  value: number;
  metadata?: Record<string, unknown>;
}

// ─── In-Memory Buffers (flushed periodically) ────────────────────────────────

const aiMetricsBuffer: AIMetric[] = [];
const toolMetricsBuffer: ToolMetric[] = [];
const systemMetricsBuffer: SystemMetric[] = [];

const FLUSH_INTERVAL = 60000; // 1 minute
let flushTimer: ReturnType<typeof setInterval> | null = null;

// ─── Metrics Recording ────────────────────────────────────────────────────────

export function recordAIMetric(metric: AIMetric): void {
  aiMetricsBuffer.push(metric);

  // Log to console for real-time debugging
  logger.info({
    type: "ai_metric",
    model: metric.model,
    latency: metric.latencyMs,
    success: metric.success,
  });
}

export function recordToolMetric(metric: ToolMetric): void {
  toolMetricsBuffer.push(metric);

  logger.info({
    type: "tool_metric",
    tool: metric.tool,
    latency: metric.latencyMs,
    success: metric.success,
    retries: metric.retryCount,
  });
}

export function recordSystemMetric(metric: SystemMetric): void {
  systemMetricsBuffer.push(metric);
}

// ─── Aggregation Queries ─────────────────────────────────────────────────────

export async function getAIMetricsSummary(since: Date = new Date(Date.now() - 24 * 60 * 60 * 1000)): Promise<{
  totalCalls: number;
  successRate: number;
  avgLatencyMs: number;
  byModel: Record<string, { calls: number; avgLatency: number }>;
}> {
  const filteredMetrics = aiMetricsBuffer.filter(m => m.timestamp >= since);

  const totalCalls = filteredMetrics.length;
  const successCount = filteredMetrics.filter(m => m.success).length;
  const avgLatencyMs = totalCalls > 0
    ? filteredMetrics.reduce((sum, m) => sum + m.latencyMs, 0) / totalCalls
    : 0;

  const byModelAgg: Record<string, { calls: number; totalLatency: number }> = {};
  for (const m of filteredMetrics) {
    if (!byModelAgg[m.model]) {
      byModelAgg[m.model] = { calls: 0, totalLatency: 0 };
    }
    byModelAgg[m.model].calls++;
    byModelAgg[m.model].totalLatency += m.latencyMs;
  }

  const byModel: Record<string, { calls: number; avgLatency: number }> = {};
  for (const model of Object.keys(byModelAgg)) {
    byModel[model] = {
      calls: byModelAgg[model].calls,
      avgLatency: byModelAgg[model].totalLatency / byModelAgg[model].calls,
    };
  }

  return {
    totalCalls,
    successRate: totalCalls > 0 ? successCount / totalCalls : 1,
    avgLatencyMs,
    byModel,
  };
}

export async function getToolMetricsSummary(since: Date = new Date(Date.now() - 24 * 60 * 60 * 1000)): Promise<{
  totalCalls: number;
  successRate: number;
  avgLatencyMs: number;
  byTool: Record<string, { calls: number; successRate: number; avgLatency: number }>;
}> {
  const filteredMetrics = toolMetricsBuffer.filter(m => m.timestamp >= since);

  const totalCalls = filteredMetrics.length;
  const successCount = filteredMetrics.filter(m => m.success).length;
  const avgLatencyMs = totalCalls > 0
    ? filteredMetrics.reduce((sum, m) => sum + m.latencyMs, 0) / totalCalls
    : 0;

  const byTool: Record<string, { calls: number; successes: number; totalLatency: number }> = {};
  for (const m of filteredMetrics) {
    if (!byTool[m.tool]) {
      byTool[m.tool] = { calls: 0, successes: 0, totalLatency: 0 };
    }
    byTool[m.tool].calls++;
    if (m.success) byTool[m.tool].successes++;
    byTool[m.tool].totalLatency += m.latencyMs;
  }

  const result: Record<string, { calls: number; successRate: number; avgLatency: number }> = {};
  for (const tool of Object.keys(byTool)) {
    result[tool] = {
      calls: byTool[tool].calls,
      successRate: byTool[tool].successes / byTool[tool].calls,
      avgLatency: byTool[tool].totalLatency / byTool[tool].calls,
    };
  }

  return {
    totalCalls,
    successRate: totalCalls > 0 ? successCount / totalCalls : 1,
    avgLatencyMs,
    byTool: result,
  };
}

// ─── Activity Log Queries ────────────────────────────────────────────────────

export async function getRecentActivity(limit: number = 50): Promise<{
  id: number;
  type: string;
  title: string;
  description: string;
  entityId: number | null;
  createdAt: Date;
}[]> {
  const results = await db.select()
    .from(activityTable)
    .orderBy(desc(activityTable.createdAt))
    .limit(limit);

  return results.map(r => ({
    id: r.id,
    type: r.type,
    title: r.title,
    description: r.description,
    entityId: r.entityId,
    createdAt: r.createdAt,
  }));
}

export async function getActivityByType(
  type: string,
  since: Date = new Date(Date.now() - 24 * 60 * 60 * 1000)
): Promise<typeof activityTable.$inferSelect[]> {
  return db.select()
    .from(activityTable)
    .where(and(
      sql`${activityTable.type} = ${type}`,
      gte(activityTable.createdAt, since)
    ))
    .orderBy(desc(activityTable.createdAt));
}

// ─── Flush to Database ───────────────────────────────────────────────────────

async function flushMetrics(): Promise<void> {
  // Flush AI metrics
  if (aiMetricsBuffer.length > 0) {
    const metrics = aiMetricsBuffer.splice(0, aiMetricsBuffer.length);
    for (const m of metrics) {
      try {
        await db.insert(activityTable).values({
          type: "ai_call" as any,
          title: `AI call: ${m.model}`,
          description: `Task: ${m.taskType}, Latency: ${m.latencyMs}ms, Success: ${m.success}`,
          entityId: 0,
        });
      } catch (err) {
        logger.warn({ err }, "Failed to flush AI metric");
      }
    }
  }

  // Flush tool metrics
  if (toolMetricsBuffer.length > 0) {
    const metrics = toolMetricsBuffer.splice(0, toolMetricsBuffer.length);
    for (const m of metrics) {
      try {
        await db.insert(activityTable).values({
          type: "tool_call" as any,
          title: `Tool: ${m.tool}`,
          description: `Latency: ${m.latencyMs}ms, Success: ${m.success}, Retries: ${m.retryCount}`,
          entityId: 0,
        });
      } catch (err) {
        logger.warn({ err }, "Failed to flush tool metric");
      }
    }
  }

  logger.debug("Metrics flushed to database");
}

// ─── Initialize and Cleanup ──────────────────────────────────────────────────

export function startObservability(): void {
  if (flushTimer) return;

  flushTimer = setInterval(flushMetrics, FLUSH_INTERVAL);
  logger.info("Observability layer started");
}

export function stopObservability(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }

  // Final flush
  flushMetrics().catch(err => logger.warn({ err }, "Final flush failed"));
  logger.info("Observability layer stopped");
}

// ─── Health Check ────────────────────────────────────────────────────────────

export async function getSystemHealth(): Promise<{
  status: "healthy" | "degraded" | "unhealthy";
  checks: {
    database: boolean;
    ai_gateway: boolean;
    memory: boolean;
  };
  metrics: {
    requestsLastHour: number;
    avgLatencyLastHour: number;
    errorRateLastHour: number;
  };
}> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  // Check database
  let databaseOk = false;
  try {
    await db.execute(sql`SELECT 1`);
    databaseOk = true;
  } catch {
    // Database unavailable
  }

  // Check AI gateway
  const aiGatewayOk = !!process.env.AI_GATEWAY_URL && !!process.env.REPLIT_AI_API_KEY;

  // Check memory (basic)
  const memUsage = process.memoryUsage();
  const memoryOk = memUsage.heapUsed < memUsage.heapTotal * 0.9;

  // Calculate metrics
  const recentAIMetrics = aiMetricsBuffer.filter(m => m.timestamp >= oneHourAgo);
  const recentToolMetrics = toolMetricsBuffer.filter(m => m.timestamp >= oneHourAgo);

  const requestsLastHour = recentAIMetrics.length + recentToolMetrics.length;
  const avgLatencyLastHour = requestsLastHour > 0
    ? [...recentAIMetrics, ...recentToolMetrics].reduce((sum, m) => sum + m.latencyMs, 0) / requestsLastHour
    : 0;
  const errorsLastHour = [...recentAIMetrics, ...recentToolMetrics].filter(m => !m.success).length;
  const errorRateLastHour = requestsLastHour > 0 ? errorsLastHour / requestsLastHour : 0;

  // Determine status
  const allHealthy = databaseOk && aiGatewayOk && memoryOk;
  const someDegraded = !databaseOk || !memoryOk || errorRateLastHour > 0.1;

  const status = allHealthy && !someDegraded ? "healthy" : someDegraded ? "degraded" : "unhealthy";

  return {
    status,
    checks: {
      database: databaseOk,
      ai_gateway: aiGatewayOk,
      memory: memoryOk,
    },
    metrics: {
      requestsLastHour,
      avgLatencyLastHour,
      errorRateLastHour,
    },
  };
}
