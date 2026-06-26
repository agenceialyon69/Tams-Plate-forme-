import { Router } from "express";
import { db } from "@workspace/db";
import { memoriesTable, memoryEdgesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router = Router();

// LIST memories
router.get("/memories", async (req, res) => {
  try {
    const { type, q } = req.query;
    let all = await db.select().from(memoriesTable).orderBy(memoriesTable.updatedAt);

    if (type) all = all.filter(m => m.type === type);
    if (q) {
      const search = String(q).toLowerCase();
      all = all.filter(m =>
        m.title.toLowerCase().includes(search) ||
        (m.content ?? "").toLowerCase().includes(search)
      );
    }

    return res.json(all);
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

// CREATE memory
router.post("/memories", async (req, res) => {
  try {
    const { title, type, content, tags, relatedIds } = req.body;
    if (!title || !type) return res.status(400).json({ error: "title and type are required" });

    const [created] = await db.insert(memoriesTable).values({
      title,
      type,
      content: content ?? null,
      tags: tags ?? [],
      relatedIds: relatedIds ?? [],
    }).returning();

    return res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Error creating memory");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// UPDATE memory
router.patch("/memories/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, content, tags, relatedIds } = req.body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (tags !== undefined) updates.tags = tags;
    if (relatedIds !== undefined) updates.relatedIds = relatedIds;

    const [updated] = await db.update(memoriesTable).set(updates).where(eq(memoriesTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Error updating memory");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE memory
router.delete("/memories/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
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
    const id = Number(req.params.id);
    const edges = await db
      .select()
      .from(memoryEdgesTable)
      .where(
        sql`${memoryEdgesTable.sourceId} = ${id} OR ${memoryEdgesTable.targetId} = ${id}`
      );
    return res.json(edges);
  } catch (err) {
    req.log.error({ err }, "Error listing edges");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// CREATE edge
router.post("/memories/:id/edges", async (req, res) => {
  try {
    const sourceId = Number(req.params.id);
    const { targetId, type, note } = req.body;
    if (!targetId || !type) return res.status(400).json({ error: "targetId and type are required" });
    if (sourceId === Number(targetId)) return res.status(400).json({ error: "Cannot link a memory to itself" });

    const [created] = await db.insert(memoryEdgesTable).values({
      sourceId,
      targetId: Number(targetId),
      type,
      note: note ?? null,
    }).returning();

    return res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Error creating edge");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE edge
router.delete("/memories/edges/:edgeId", async (req, res) => {
  try {
    const edgeId = Number(req.params.edgeId);
    await db.delete(memoryEdgesTable).where(eq(memoryEdgesTable.id, edgeId));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting edge");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
