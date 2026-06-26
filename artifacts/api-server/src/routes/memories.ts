import { Router } from "express";
import { db } from "@workspace/db";
import { memoriesTable, memoryEdgesTable } from "@workspace/db";
import { eq, and, or, sql } from "drizzle-orm";
import {
  CreateMemoryBody,
  UpdateMemoryBody,
  ListMemoriesQueryParams,
} from "@workspace/api-zod";

const router = Router();

// LIST memories with pagination
router.get("/memories", async (req, res) => {
  try {
    const parsedQuery = ListMemoriesQueryParams.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({ error: "Invalid query parameters", details: parsedQuery.error.issues });
    }
    const { type, q } = parsedQuery.data;

    // Pagination
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    let query = db.select().from(memoriesTable);

    // Apply type filter
    if (type) {
      query = query.where(eq(memoriesTable.type, type)) as any;
    }

    const memories = await query
      .orderBy(memoriesTable.updatedAt)
      .limit(limit)
      .offset(offset);

    // Apply text search (in-memory for now, could be improved with full-text search)
    let filtered = memories;
    if (q) {
      const search = q.toLowerCase();
      filtered = memories.filter(m =>
        m.title.toLowerCase().includes(search) ||
        (m.content ?? "").toLowerCase().includes(search)
      );
    }

    // Get total count
    const [{ total }] = await db
      .select({ total: sql<number>`COUNT(*)` })
      .from(memoriesTable)
      .where(type ? eq(memoriesTable.type, type) : undefined);

    return res.json({ data: filtered, total, limit, offset });
  } catch (err) {
    req.log.error({ err }, "Error listing memories");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET graph — nodes + edges for visualization
router.get("/memories/graph", async (req, res) => {
  try {
    const nodes = await db.select().from(memoriesTable).orderBy(memoriesTable.updatedAt);
    const edges = await db.select().from(memoryEdgesTable);

    return res.json({
      nodes: nodes.map(n => ({
        id: n.id,
        title: n.title,
        type: n.type,
        content: n.content,
        tags: n.tags,
      })),
      edges: edges.map(e => ({
        id: e.id,
        source: e.sourceId,
        target: e.targetId,
        type: e.type,
        note: e.note,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error getting memory graph");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// CREATE memory with Zod validation
router.post("/memories", async (req, res) => {
  try {
    const parsed = CreateMemoryBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { title, type, content, tags, relatedIds } = parsed.data;

    const [created] = await db.insert(memoriesTable).values({
      title,
      type,
      content: content ?? null,
      tags: tags ?? [],
      relatedIds: relatedIds ?? [],
    }).returning();

    return res.status(201).json({ data: created });
  } catch (err) {
    req.log.error({ err }, "Error creating memory");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// UPDATE memory with Zod validation
router.patch("/memories/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const parsed = UpdateMemoryBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { title, content, tags, relatedIds } = parsed.data;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (tags !== undefined) updates.tags = tags;
    if (relatedIds !== undefined) updates.relatedIds = relatedIds;

    const [updated] = await db.update(memoriesTable).set(updates).where(eq(memoriesTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

    return res.json({ data: updated });
  } catch (err) {
    req.log.error({ err }, "Error updating memory");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE memory (cascade edges)
router.delete("/memories/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    // Delete edges first
    await db.delete(memoryEdgesTable).where(
      or(eq(memoryEdgesTable.sourceId, id), eq(memoryEdgesTable.targetId, id))
    );

    await db.delete(memoriesTable).where(eq(memoriesTable.id, id));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting memory");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ============ EDGES ============

// LIST edges for a memory
router.get("/memories/:id/edges", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const edges = await db
      .select()
      .from(memoryEdgesTable)
      .where(
        or(eq(memoryEdgesTable.sourceId, id), eq(memoryEdgesTable.targetId, id))
      );

    return res.json({ data: edges });
  } catch (err) {
    req.log.error({ err }, "Error listing edges");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// CREATE edge with validation
router.post("/memories/:id/edges", async (req, res) => {
  try {
    const sourceId = parseInt(req.params.id, 10);
    if (isNaN(sourceId) || sourceId <= 0) {
      return res.status(400).json({ error: "Invalid source ID" });
    }

    const { targetId, type, note } = req.body;
    if (!targetId) return res.status(400).json({ error: "targetId is required" });
    if (!type) return res.status(400).json({ error: "type is required" });
    if (sourceId === Number(targetId)) return res.status(400).json({ error: "Cannot link a memory to itself" });

    // Verify both memories exist
    const [sourceMemory] = await db.select().from(memoriesTable).where(eq(memoriesTable.id, sourceId)).limit(1);
    if (!sourceMemory) return res.status(404).json({ error: "Source memory not found" });

    const [targetMemory] = await db.select().from(memoriesTable).where(eq(memoriesTable.id, Number(targetId))).limit(1);
    if (!targetMemory) return res.status(404).json({ error: "Target memory not found" });

    const [created] = await db.insert(memoryEdgesTable).values({
      sourceId,
      targetId: Number(targetId),
      type,
      note: note ?? null,
    }).returning();

    return res.status(201).json({ data: created });
  } catch (err) {
    req.log.error({ err }, "Error creating edge");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE edge
router.delete("/memories/edges/:edgeId", async (req, res) => {
  try {
    const edgeId = parseInt(req.params.edgeId, 10);
    if (isNaN(edgeId) || edgeId <= 0) {
      return res.status(400).json({ error: "Invalid edge ID" });
    }
    await db.delete(memoryEdgesTable).where(eq(memoryEdgesTable.id, edgeId));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting edge");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
