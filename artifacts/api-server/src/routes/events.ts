import { Router, type IRouter } from "express";
import { db, eventsTable } from "@workspace/db";
import {
  CreateEventBody,
  UpdateEventParams,
  UpdateEventBody,
  DeleteEventParams,
  ListEventsQueryParams,
} from "@workspace/api-zod";
import { eq, and, gte, lte, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/events", async (req, res): Promise<void> => {
  const q = ListEventsQueryParams.safeParse(req.query);
  let query = db.select().from(eventsTable).$dynamic();

  if (q.success) {
    const conditions = [];
    if (q.data.from) conditions.push(gte(eventsTable.eventDate, q.data.from));
    if (q.data.to) conditions.push(lte(eventsTable.eventDate, q.data.to));
    if (conditions.length > 0) query = query.where(and(...conditions));
  }

  const events = await query.orderBy(eventsTable.eventDate);
  res.json(events);
});

router.post("/events", async (req, res): Promise<void> => {
  const parsed = CreateEventBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [event] = await db.insert(eventsTable).values({
    title: parsed.data.title,
    eventDate: parsed.data.eventDate,
    eventTime: parsed.data.eventTime ?? null,
    category: parsed.data.category ?? "personal",
    captureId: parsed.data.captureId ?? null,
  }).returning();

  res.status(201).json(event);
});

router.patch("/events/:id", async (req, res): Promise<void> => {
  const params = UpdateEventParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateEventBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updates: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.eventDate !== undefined) updates.eventDate = parsed.data.eventDate;
  if (parsed.data.eventTime !== undefined) updates.eventTime = parsed.data.eventTime;
  if (parsed.data.category !== undefined) updates.category = parsed.data.category;

  const [event] = await db.update(eventsTable).set(updates).where(eq(eventsTable.id, params.data.id)).returning();
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }
  res.json(event);
});

router.delete("/events/:id", async (req, res): Promise<void> => {
  const params = DeleteEventParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  await db.delete(eventsTable).where(eq(eventsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
