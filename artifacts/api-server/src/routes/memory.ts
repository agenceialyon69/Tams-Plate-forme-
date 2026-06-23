import { Router, type IRouter } from "express";
import { db, memoryTable } from "@workspace/db";
import {
  CreateMemoryEntryBody,
  DeleteMemoryEntryParams,
  ListMemoryQueryParams,
} from "@workspace/api-zod";
import { eq, and, ilike, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/memory", async (req, res): Promise<void> => {
  const q = ListMemoryQueryParams.safeParse(req.query);
  let query = db.select().from(memoryTable).$dynamic();

  if (q.success) {
    const conditions = [];
    if (q.data.domain) conditions.push(eq(memoryTable.domain, q.data.domain));
    if (q.data.search) conditions.push(ilike(memoryTable.title, `%${q.data.search}%`));
    if (conditions.length > 0) query = query.where(and(...conditions));
  }

  const entries = await query.orderBy(desc(memoryTable.createdAt));
  res.json(entries);
});

router.post("/memory", async (req, res): Promise<void> => {
  const parsed = CreateMemoryEntryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const [entry] = await db.insert(memoryTable).values({
    domain: parsed.data.domain,
    title: parsed.data.title,
    content: parsed.data.content,
    tags: parsed.data.tags ?? [],
  }).returning();

  res.status(201).json(entry);
});

router.delete("/memory/:id", async (req, res): Promise<void> => {
  const params = DeleteMemoryEntryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid request" }); return; }

  await db.delete(memoryTable).where(eq(memoryTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
