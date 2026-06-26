import { Router } from "express";
import { db } from "@workspace/db";
import { assetsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// LIST assets
router.get("/assets", async (req, res) => {
  try {
    const { type } = req.query;
    const all = await db.select().from(assetsTable).orderBy(assetsTable.createdAt);
    const filtered = type ? all.filter(a => a.type === type) : all;
    return res.json(filtered);
  } catch (err) {
    req.log.error({ err }, "Error listing assets");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// CREATE asset
router.post("/assets", async (req, res) => {
  try {
    const { name, type, url, content, mimeType, size, tags } = req.body;
    if (!name || !type) return res.status(400).json({ error: "name and type are required" });

    const [created] = await db.insert(assetsTable).values({
      name,
      type,
      url: url ?? null,
      content: content ?? null,
      mimeType: mimeType ?? null,
      size: size ?? null,
      tags: tags ?? [],
    }).returning();

    return res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Error creating asset");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// UPDATE asset
router.patch("/assets/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, url, content, tags } = req.body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (url !== undefined) updates.url = url;
    if (content !== undefined) updates.content = content;
    if (tags !== undefined) updates.tags = tags;

    const [updated] = await db.update(assetsTable).set(updates).where(eq(assetsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Error updating asset");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE asset
router.delete("/assets/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(assetsTable).where(eq(assetsTable.id, id));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting asset");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
