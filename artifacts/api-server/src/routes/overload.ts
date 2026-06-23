import { Router, type IRouter } from "express";
import { db, tasksTable, energyLogsTable } from "@workspace/db";
import { LogEnergyLevelBody } from "@workspace/api-zod";
import { eq, count, avg, gte, desc } from "drizzle-orm";
import { detectOverload } from "../lib/ai";
import { getConsecutiveActiveDays } from "../lib/signals";
import { invalidateBriefingCache } from "./briefings";

const router: IRouter = Router();

let overloadCache: { data: unknown; cachedAt: number } | null = null;
const OVERLOAD_CACHE_TTL = 1800_000;

router.get("/overload/status", async (_req, res): Promise<void> => {
  if (overloadCache && Date.now() - overloadCache.cachedAt < OVERLOAD_CACHE_TTL) {
    res.json(overloadCache.data);
    return;
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysStr = sevenDaysAgo.toISOString().split("T")[0];

  const [activeTasksResult, doneTasksResult, energyResult] = await Promise.all([
    db.select({ count: count() }).from(tasksTable).where(eq(tasksTable.status, "pending")),
    db.select({ count: count() }).from(tasksTable).where(eq(tasksTable.status, "done")),
    db.select({ avg: avg(energyLogsTable.level) }).from(energyLogsTable).where(gte(energyLogsTable.logDate, sevenDaysStr)),
  ]);

  const activeTasks = activeTasksResult[0].count;
  const doneTasks = doneTasksResult[0].count;
  const recentEnergyAvg = energyResult[0]?.avg ? parseFloat(String(energyResult[0].avg)) : null;
  const ratio = doneTasks > 0 ? activeTasks / doneTasks : activeTasks > 0 ? 3 : 1;
  const consecutiveWorkDays = await getConsecutiveActiveDays();

  const overload = await detectOverload({
    activeTasks,
    consecutiveWorkDays,
    recentEnergyAvg,
    taskAddedVsCompletedRatio: ratio,
  });

  const data = {
    riskLevel: overload.riskLevel,
    consecutiveWorkDays,
    activeTasks,
    averageEnergyLastWeek: recentEnergyAvg,
    alerts: overload.alerts,
    suggestion: overload.suggestion,
  };

  overloadCache = { data, cachedAt: Date.now() };
  res.json(data);
});

router.post("/overload/energy", async (req, res): Promise<void> => {
  const parsed = LogEnergyLevelBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const today = new Date().toISOString().split("T")[0];

  const [log] = await db.insert(energyLogsTable).values({
    level: parsed.data.level,
    note: parsed.data.note ?? null,
    logDate: today,
  }).returning();

  overloadCache = null;
  invalidateBriefingCache();

  res.status(201).json(log);
});

router.get("/overload/energy/history", async (_req, res): Promise<void> => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysStr = thirtyDaysAgo.toISOString().split("T")[0];

  const logs = await db
    .select()
    .from(energyLogsTable)
    .where(gte(energyLogsTable.logDate, thirtyDaysStr))
    .orderBy(desc(energyLogsTable.logDate));

  res.json(logs);
});

export default router;
