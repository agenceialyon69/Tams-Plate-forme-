import { Router, type IRouter } from "express";
import { db, tasksTable, eventsTable, eveningReviewsTable, energyLogsTable } from "@workspace/db";
import { SubmitEveningReviewBody } from "@workspace/api-zod";
import { eq, and, gte, lte, lt, avg, count, desc, min, max } from "drizzle-orm";
import { generateMorningKoreMessage, generateEveningResponse, generateWeeklySummary } from "../lib/ai";
import { capturesTable, decisionsTable } from "@workspace/db";
import { checkAndIncrementAiCalls } from "./quotas";
import { logger } from "../lib/logger";
import type { Request, Response } from "express";

const router: IRouter = Router();

let briefingCache: { date: string; data: unknown; cachedAt: number } | null = null;
const BRIEFING_CACHE_TTL = 3600_000;

let weeklyCache: { weekStart: string; data: unknown; cachedAt: number } | null = null;
const WEEKLY_CACHE_TTL = 3600_000;

export function invalidateBriefingCache(): void {
  briefingCache = null;
}

/** Shared AI quota guard. Returns false and sends 429 if quota is exhausted. */
async function checkQuota(req: Request, res: Response): Promise<boolean> {
  const tenantId = req.tenantId;
  if (!tenantId) return true; // legacy / no-tenant mode: allow
  const guard = await checkAndIncrementAiCalls(tenantId);
  if (!guard.allowed) {
    logger.warn({ tenantId, path: req.path }, `AI quota exceeded on briefings: ${guard.reason}`);
    res.status(429).json({
      error: "Quota IA dépassé.",
      detail: guard.reason,
      code: "AI_QUOTA_EXCEEDED",
    });
    return false;
  }
  return true;
}

router.get("/briefings/morning", async (req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];

  // Return from cache without consuming quota — LLM was already called earlier.
  if (briefingCache && briefingCache.date === today && Date.now() - briefingCache.cachedAt < BRIEFING_CACHE_TTL) {
    res.json(briefingCache.data);
    return;
  }

  // ── Cost guardrail — only checked when cache miss forces a real LLM call ──
  if (!await checkQuota(req, res)) return;
  // ─────────────────────────────────────────────────────────────────────────

  const [todayEvents, pendingHighPriorityTasks, upcomingDeadlines, overdueTasks] = await Promise.all([
    db.select().from(eventsTable).where(eq(eventsTable.eventDate, today)),

    db.select().from(tasksTable)
      .where(and(eq(tasksTable.status, "pending"), eq(tasksTable.priority, "high")))
      .orderBy(tasksTable.dueDate)
      .limit(5),

    db.select().from(tasksTable)
      .where(and(
        eq(tasksTable.status, "pending"),
        gte(tasksTable.dueDate, today),
        lte(tasksTable.dueDate, (() => {
          const d = new Date(); d.setDate(d.getDate() + 3); return d.toISOString().split("T")[0];
        })()),
      ))
      .orderBy(tasksTable.dueDate)
      .limit(5),

    db.select().from(tasksTable)
      .where(and(eq(tasksTable.status, "pending"), lt(tasksTable.dueDate, today)))
      .orderBy(tasksTable.dueDate)
      .limit(10),
  ]);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [energyResult, activeTasksResult] = await Promise.all([
    db.select({ avg: avg(energyLogsTable.level) })
      .from(energyLogsTable)
      .where(gte(energyLogsTable.logDate, sevenDaysAgo.toISOString().split("T")[0])),
    db.select({ count: count() }).from(tasksTable).where(eq(tasksTable.status, "pending")),
  ]);

  const recentEnergyAvg = energyResult[0]?.avg ? parseFloat(String(energyResult[0].avg)) : null;
  const activeTasks = activeTasksResult[0].count;

  let estimatedLoad: "light" | "moderate" | "heavy" | "critical" = "light";
  const totalLoad = todayEvents.length + pendingHighPriorityTasks.length + upcomingDeadlines.length + overdueTasks.length;
  if (totalLoad > 10) estimatedLoad = "critical";
  else if (totalLoad > 6) estimatedLoad = "heavy";
  else if (totalLoad > 3) estimatedLoad = "moderate";

  const koreMessage = await generateMorningKoreMessage({
    pendingTasks: activeTasks,
    highPriorityTasks: pendingHighPriorityTasks.length,
    overdueTasks: overdueTasks.length,
    todayEvents: todayEvents.length,
    recentEnergyAvg,
    consecutiveWorkDays: 0,
  });

  const overloadAlert = overdueTasks.length >= 3
    ? `Tu as ${overdueTasks.length} tâches en retard. Prends un moment pour décider : faire, déléguer ou abandonner.`
    : null;

  const topPriorities = [
    ...overdueTasks.slice(0, 1).map(t => `[EN RETARD] ${t.title}`),
    ...pendingHighPriorityTasks.filter(t => !overdueTasks.find(o => o.id === t.id)).slice(0, 2).map(t => t.title),
    ...todayEvents.slice(0, 1).map(e => e.title),
  ].slice(0, 3);

  const briefingData = {
    date: today,
    topPriorities,
    todayEvents,
    pendingHighPriorityTasks,
    upcomingDeadlines,
    overdueTasks,
    estimatedLoad,
    koreMessage,
    overloadAlert,
  };

  briefingCache = { date: today, data: briefingData, cachedAt: Date.now() };
  res.json(briefingData);
});

router.post("/briefings/evening", async (req, res): Promise<void> => {
  const parsed = SubmitEveningReviewBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  // ── Cost guardrail ──────────────────────────────────────────────────────────
  if (!await checkQuota(req, res)) return;
  // ───────────────────────────────────────────────────────────────────────────

  const today = new Date().toISOString().split("T")[0];

  const koreResponse = await generateEveningResponse({
    mostImportantThing: parsed.data.mostImportantThing,
    energyLevel: parsed.data.energyLevel,
    deferredItems: parsed.data.deferredItems ?? null,
    abandonedItems: parsed.data.abandonedItems ?? null,
    freeReflection: parsed.data.freeReflection ?? null,
  });

  const [review] = await db.insert(eveningReviewsTable).values({
    mostImportantThing: parsed.data.mostImportantThing,
    energyLevel: parsed.data.energyLevel,
    deferredItems: parsed.data.deferredItems ?? null,
    abandonedItems: parsed.data.abandonedItems ?? null,
    freeReflection: parsed.data.freeReflection ?? null,
    koreResponse,
    reviewDate: today,
  }).returning();

  await db.insert(energyLogsTable).values({
    level: parsed.data.energyLevel,
    note: parsed.data.freeReflection ?? null,
    logDate: today,
  });

  invalidateBriefingCache();
  res.status(201).json(review);
});

router.get("/briefings/weekly", async (req, res): Promise<void> => {
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - 6);
  const weekStartStr = weekStart.toISOString().split("T")[0];

  // Return from cache without consuming quota.
  if (weeklyCache && weeklyCache.weekStart === weekStartStr && Date.now() - weeklyCache.cachedAt < WEEKLY_CACHE_TTL) {
    res.json(weeklyCache.data);
    return;
  }

  // ── Cost guardrail — only on cache miss ─────────────────────────────────────
  if (!await checkQuota(req, res)) return;
  // ───────────────────────────────────────────────────────────────────────────

  const weekEndStr = today.toISOString().split("T")[0];

  const [
    energyResult,
    tasksCompleted,
    tasksPending,
    tasksOverdue,
    decisionsResult,
    capturesResult,
    reviewsResult,
    topDomainResult,
  ] = await Promise.all([
    db.select({ avg: avg(energyLogsTable.level), min: min(energyLogsTable.level), max: max(energyLogsTable.level) })
      .from(energyLogsTable)
      .where(gte(energyLogsTable.logDate, weekStartStr)),

    db.select({ count: count() }).from(tasksTable)
      .where(and(eq(tasksTable.status, "done"), gte(tasksTable.updatedAt, weekStart))),

    db.select({ count: count() }).from(tasksTable)
      .where(eq(tasksTable.status, "pending")),

    db.select({ count: count() }).from(tasksTable)
      .where(and(eq(tasksTable.status, "pending"), lt(tasksTable.dueDate, weekEndStr))),

    db.select({ count: count() }).from(decisionsTable)
      .where(gte(decisionsTable.createdAt, weekStart)),

    db.select({ count: count() }).from(capturesTable)
      .where(gte(capturesTable.createdAt, weekStart)),

    db.select({ count: count() }).from(eveningReviewsTable)
      .where(gte(eveningReviewsTable.reviewDate, weekStartStr)),

    db.select({ domain: tasksTable.priorityDomain, count: count() })
      .from(tasksTable)
      .where(and(eq(tasksTable.status, "done"), gte(tasksTable.updatedAt, weekStart)))
      .groupBy(tasksTable.priorityDomain)
      .orderBy(desc(count()))
      .limit(3),
  ]);

  const summary = await generateWeeklySummary({
    energyAvg: energyResult[0]?.avg ? parseFloat(String(energyResult[0].avg)) : null,
    energyMin: energyResult[0]?.min ?? null,
    energyMax: energyResult[0]?.max ?? null,
    tasksCompleted: tasksCompleted[0].count,
    tasksPending: tasksPending[0].count,
    tasksOverdue: tasksOverdue[0].count,
    decisionsCount: decisionsResult[0].count,
    capturesCount: capturesResult[0].count,
    reviewsCount: reviewsResult[0].count,
    topDomains: topDomainResult.map(r => r.domain ?? "").filter(Boolean),
    weekDates: { start: weekStartStr, end: weekEndStr },
  });

  const weeklyData = {
    ...summary,
    tasksCompleted: tasksCompleted[0].count,
    tasksPending: tasksPending[0].count,
    tasksOverdue: tasksOverdue[0].count,
    decisionsCount: decisionsResult[0].count,
    capturesCount: capturesResult[0].count,
    reviewsCount: reviewsResult[0].count,
    energyAvg: energyResult[0]?.avg ? parseFloat(String(energyResult[0].avg)) : null,
    weekDates: { start: weekStartStr, end: weekEndStr },
  };

  weeklyCache = { weekStart: weekStartStr, data: weeklyData, cachedAt: Date.now() };
  res.json(weeklyData);
});

router.get("/briefings/evening/history", async (_req, res): Promise<void> => {
  const reviews = await db.select().from(eveningReviewsTable).orderBy(desc(eveningReviewsTable.createdAt)).limit(30);
  res.json(reviews);
});

export default router;
