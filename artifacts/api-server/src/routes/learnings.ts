import { Router, type IRouter } from "express";
import { db, learningsTable } from "@workspace/db";
import {
  CreateLearningBody,
  DeleteLearningParams,
  ListLearningsQueryParams,
} from "@workspace/api-zod";
import { eq, and, ilike, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/learnings", async (req, res): Promise<void> => {
  const q = ListLearningsQueryParams.safeParse(req.query);
  let query = db.select().from(learningsTable).$dynamic();

  if (q.success) {
    const conditions = [];
    if (q.data.category) conditions.push(eq(learningsTable.category, q.data.category));
    if (q.data.search) conditions.push(ilike(learningsTable.subject, `%${q.data.search}%`));
    if (conditions.length > 0) query = query.where(and(...conditions));
  }

  const items = await query.orderBy(desc(learningsTable.createdAt));
  res.json(items);
});

router.post("/learnings", async (req, res): Promise<void> => {
  const parsed = CreateLearningBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [learning] = await db.insert(learningsTable).values({
    subject: parsed.data.subject,
    content: parsed.data.content,
    category: parsed.data.category ?? "personal",
    captureId: parsed.data.captureId ?? null,
  }).returning();

  res.status(201).json(learning);
});

router.delete("/learnings/:id", async (req, res): Promise<void> => {
  const params = DeleteLearningParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  await db.delete(learningsTable).where(eq(learningsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
