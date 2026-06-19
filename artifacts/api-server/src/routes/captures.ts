import { Router, type IRouter } from "express";
import { db, capturesTable, tasksTable, eventsTable, learningsTable } from "@workspace/db";
import {
  CreateCaptureBody,
  GetCaptureParams,
  DeleteCaptureParams,
  ListCapturesQueryParams,
} from "@workspace/api-zod";
import { extractFromCapture } from "../lib/ai";
import { rateLimit } from "../middlewares/rate-limit";
import { desc, eq } from "drizzle-orm";

const router: IRouter = Router();

// Dedicated limiter for the LLM-backed capture creation endpoint.
const captureLimiter = rateLimit({ windowMs: 60_000, max: 20 });

router.get("/captures", async (req, res): Promise<void> => {
  const q = ListCapturesQueryParams.safeParse(req.query);
  const limit = q.success ? (q.data.limit ?? 50) : 50;
  const offset = q.success ? (q.data.offset ?? 0) : 0;

  const captures = await db
    .select()
    .from(capturesTable)
    .orderBy(desc(capturesTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(captures);
});

router.get("/captures/:id", async (req, res): Promise<void> => {
  const params = GetCaptureParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const [capture] = await db.select().from(capturesTable).where(eq(capturesTable.id, params.data.id));
  if (!capture) { res.status(404).json({ error: "Capture not found" }); return; }
  res.json(capture);
});

router.post("/captures", captureLimiter, async (req, res): Promise<void> => {
  const parsed = CreateCaptureBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const extracted = await extractFromCapture(parsed.data.content);

  const [capture] = await db.insert(capturesTable).values({
    content: parsed.data.content,
    source: parsed.data.source ?? "text",
    extractedTasks: extracted.tasks.length,
    extractedEvents: extracted.events.length,
    extractedLearnings: extracted.learnings.length,
  }).returning();

  const tasks = extracted.tasks.length > 0
    ? await db.insert(tasksTable).values(
        extracted.tasks.map(t => ({
          title: t.title,
          dueDate: t.dueDate ?? null,
          priority: t.priority,
          priorityDomain: t.priorityDomain ?? null,
          captureId: capture.id,
        }))
      ).returning()
    : [];

  const events = extracted.events.length > 0
    ? await db.insert(eventsTable).values(
        extracted.events.map(e => ({
          title: e.title,
          eventDate: e.eventDate,
          eventTime: e.eventTime ?? null,
          category: e.category,
          captureId: capture.id,
        }))
      ).returning()
    : [];

  const learnings = extracted.learnings.length > 0
    ? await db.insert(learningsTable).values(
        extracted.learnings.map(l => ({
          subject: l.subject,
          content: l.content,
          category: l.category,
          captureId: capture.id,
        }))
      ).returning()
    : [];

  res.status(201).json({
    capture,
    tasks,
    events,
    learnings,
    tamsComment: extracted.tamsComment ?? null,
  });
});

router.delete("/captures/:id", async (req, res): Promise<void> => {
  const params = DeleteCaptureParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid request" }); return; }

  await db.delete(capturesTable).where(eq(capturesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
