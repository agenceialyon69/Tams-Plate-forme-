import { Router, type IRouter } from "express";
import { db, tasksTable, energyLogsTable } from "@workspace/db";
import { LogEnergyLevelBody } from "@workspace/api-zod";
import { eq, count, avg, gte, desc } from "drizzle-orm";
import { detectOverload } from "../lib/ai";

const router: IRouter = Router();

router.get("/overload/status", async (_req, res): Promise<void> => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysStr = sevenDaysAgo.toISOString().split("T")[0];

  const [activeTasksResult] = await db.select({ count: count() }).from(tasksTable).where(eq(tasksTable.status, "pending"));
  const [doneTasksResult] = await db.select({ count: count() }).from(tasksTable).where(eq(tasksTable.status, "done"));
  const [energyResult] = await db.select({ avg: avg(energyLogsTable.level) }).from(energyLogsTable).where(gte(energyLogsTable.logDate, sevenDaysStr));

  const activeTasks = activeTasksResult.count;
  const doneTasks = doneTasksResult.count;
  const recentEnergyAvg = energyResult?.avg ? parseFloat(String(energyResult.avg)) : null;
  const ratio = doneTasks > 0 ? activeTasks / doneTasks : activeTasks > 0 ? 3 : 1;

  const overload = await detectOverload({
    activeTasks,
    consecutiveWorkDays: 0,
    recentEnergyAvg,
    taskAddedVsCompletedRatio: ratio,
  });

  res.json({
    riskLevel: overload.riskLevel,
    consecutiveWorkDays: 0,
    activeTasks,
    averageEnergyLastWeek: recentEnergyAvg,
    alerts: overload.alerts,
    suggestion: overload.suggestion,
  });
});

router.post("/overload/energy", async (req, res): Promise<void> => {
  const parsed = LogEnergyLevelBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const today = new Date().toISOString().split("T")[0];

  const [log] = await db.insert(energyLogsTable).values({
    level: parsed.data.level,
    note: parsed.data.note ?? null,
    logDate: today,
  }).returning();

  res.status(201).json(log);
});

router.get("/overload/energy/history", async (_req, res): Promise<void> => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysStr = thirtyDaysAgo.toISOString().split("T")[0];

  const logs = await db.select().from(energyLogsTable).where(gte(energyLogsTable.logDate, thirtyDaysStr)).orderBy(desc(energyLogsTable.logDate));
  res.json(logs);
});

export default router;
