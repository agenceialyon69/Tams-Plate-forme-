import { Router, type IRouter } from "express";
import { db, tasksTable } from "@workspace/db";
import {
  CreateTaskBody,
  UpdateTaskParams,
  UpdateTaskBody,
  DeleteTaskParams,
  ListTasksQueryParams,
} from "@workspace/api-zod";
import { eq, and, count, lt, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/tasks", async (req, res): Promise<void> => {
  const q = ListTasksQueryParams.safeParse(req.query);
  let query = db.select().from(tasksTable).$dynamic();

  if (q.success) {
    const conditions = [];
    if (q.data.status) conditions.push(eq(tasksTable.status, q.data.status));
    if (q.data.priority) conditions.push(eq(tasksTable.priority, q.data.priority));
    if (conditions.length > 0) query = query.where(and(...conditions));
  }

  const tasks = await query.orderBy(desc(tasksTable.createdAt));
  res.json(tasks);
});

router.get("/tasks/summary", async (_req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];

  const [total] = await db.select({ count: count() }).from(tasksTable);
  const [pending] = await db.select({ count: count() }).from(tasksTable).where(eq(tasksTable.status, "pending"));
  const [done] = await db.select({ count: count() }).from(tasksTable).where(eq(tasksTable.status, "done"));
  const [highPriority] = await db.select({ count: count() }).from(tasksTable).where(and(eq(tasksTable.priority, "high"), eq(tasksTable.status, "pending")));
  const [overdue] = await db.select({ count: count() }).from(tasksTable).where(and(eq(tasksTable.status, "pending"), lt(tasksTable.dueDate, today)));

  res.json({
    total: total.count,
    pending: pending.count,
    done: done.count,
    highPriority: highPriority.count,
    overdue: overdue.count,
  });
});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [task] = await db.insert(tasksTable).values({
    title: parsed.data.title,
    dueDate: parsed.data.dueDate ?? null,
    priority: parsed.data.priority ?? "medium",
    priorityDomain: parsed.data.priorityDomain ?? null,
    captureId: parsed.data.captureId ?? null,
  }).returning();

  res.status(201).json(task);
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updates: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.dueDate !== undefined) updates.dueDate = parsed.data.dueDate;
  if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.priorityDomain !== undefined) updates.priorityDomain = parsed.data.priorityDomain;

  const [task] = await db.update(tasksTable).set(updates).where(eq(tasksTable.id, params.data.id)).returning();
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  res.json(task);
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  await db.delete(tasksTable).where(eq(tasksTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
