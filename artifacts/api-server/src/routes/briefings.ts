import { Router, type IRouter } from "express";
import { db, tasksTable, eventsTable, eveningReviewsTable, energyLogsTable } from "@workspace/db";
import { SubmitEveningReviewBody } from "@workspace/api-zod";
import { eq, and, gte, lte, avg, count, desc } from "drizzle-orm";
import { generateMorningKoreMessage, generateEveningResponse } from "../lib/ai";

const router: IRouter = Router();

let briefingCache: { date: string; data: unknown; cachedAt: number } | null = null;
const BRIEFING_CACHE_TTL = 3600_000;

router.get("/briefings/morning", async (_req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];

  if (briefingCache && briefingCache.date === today && Date.now() - briefingCache.cachedAt < BRIEFING_CACHE_TTL) {
    res.json(briefingCache.data);
    return;
  }

  const todayEvents = await db.select().from(eventsTable).where(eq(eventsTable.eventDate, today));

  const pendingHighPriorityTasks = await db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.status, "pending"), eq(tasksTable.priority, "high")))
    .orderBy(tasksTable.dueDate)
    .limit(5);

  const threeDaysLater = new Date();
  threeDaysLater.setDate(threeDaysLater.getDate() + 3);
  const threeDaysStr = threeDaysLater.toISOString().split("T")[0];

  const upcomingDeadlines = await db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.status, "pending"), gte(tasksTable.dueDate, today), lte(tasksTable.dueDate, threeDaysStr)))
    .orderBy(tasksTable.dueDate)
    .limit(5);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysStr = sevenDaysAgo.toISOString().split("T")[0];

  const [energyResult] = await db
    .select({ avg: avg(energyLogsTable.level) })
    .from(energyLogsTable)
    .where(gte(energyLogsTable.logDate, sevenDaysStr));
  const recentEnergyAvg = energyResult?.avg ? parseFloat(String(energyResult.avg)) : null;

  const [activeTasksResult] = await db
    .select({ count: count() })
    .from(tasksTable)
    .where(eq(tasksTable.status, "pending"));
  const activeTasks = activeTasksResult.count;

  const consecutiveWorkDays = 0;

  let estimatedLoad: "light" | "moderate" | "heavy" | "critical" = "light";
  const totalLoad = todayEvents.length + pendingHighPriorityTasks.length + upcomingDeadlines.length;
  if (totalLoad > 10) estimatedLoad = "critical";
  else if (totalLoad > 6) estimatedLoad = "heavy";
  else if (totalLoad > 3) estimatedLoad = "moderate";

  const koreMessage = await generateMorningKoreMessage({
    pendingTasks: activeTasks,
    highPriorityTasks: pendingHighPriorityTasks.length,
    overdueTasks: 0,
    todayEvents: todayEvents.length,
    recentEnergyAvg,
    consecutiveWorkDays,
  });

  const topPriorities = [
    ...pendingHighPriorityTasks.slice(0, 2).map(t => t.title),
    ...todayEvents.slice(0, 1).map(e => e.title),
  ].slice(0, 3);

  const briefingData = {
    date: today,
    topPriorities,
    todayEvents,
    pendingHighPriorityTasks,
    upcomingDeadlines,
    estimatedLoad,
    koreMessage,
    overloadAlert: null,
  };

  briefingCache = { date: today, data: briefingData, cachedAt: Date.now() };
  res.json(briefingData);
});

router.post("/briefings/evening", async (req, res): Promise<void> => {
  const parsed = SubmitEveningReviewBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

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

  res.status(201).json(review);
});

router.get("/briefings/evening/history", async (_req, res): Promise<void> => {
  const reviews = await db.select().from(eveningReviewsTable).orderBy(desc(eveningReviewsTable.createdAt)).limit(30);
  res.json(reviews);
});

export default router;
