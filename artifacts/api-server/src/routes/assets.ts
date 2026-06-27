import { Router } from "express";
import { db } from "@workspace/db";
import { assetsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CreateAssetBody, UpdateAssetBody } from "@workspace/api-zod";

const router = Router();

// LIST assets with pagination
router.get("/assets", async (req, res) => {
  try {
    // Pagination
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const type = req.query.type as "image" | "video" | "audio" | "document" | "prompt" | "template" | "result" | undefined;

    let query = db.select().from(assetsTable);
    if (type) {
      const assets = await query
        .where(eq(assetsTable.type, type))
        .orderBy(assetsTable.createdAt)
        .limit(limit)
        .offset(offset);

      const [{ total }] = await db
        .select({ total: sql<number>`COUNT(*)` })
        .from(assetsTable)
        .where(eq(assetsTable.type, type));

      return res.json(assets);
    }

    const assets = await query
      .orderBy(assetsTable.createdAt)
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`COUNT(*)` })
      .from(assetsTable);

    return res.json(assets);
  } catch (err) {
    req.log.error({ err }, "Error listing assets");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// CREATE asset with Zod validation
router.post("/assets", async (req, res) => {
  try {
    const parsed = CreateAssetBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { name, type, url, content, mimeType, size, tags } = parsed.data;

    const [created] = await db.insert(assetsTable).values({
      name,
      type,
      url: url ?? null,
      content: content ?? null,
      mimeType: mimeType ?? null,
      size: size ?? null,
      tags: tags ?? [],
    }).returning();

    return res.status(201).json({ data: created });
  } catch (err) {
    req.log.error({ err }, "Error creating asset");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// UPDATE asset with Zod validation
router.patch("/assets/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const parsed = UpdateAssetBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { name, url, content, tags } = parsed.data;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (url !== undefined) updates.url = url;
    if (content !== undefined) updates.content = content;
    if (tags !== undefined) updates.tags = tags;

    const [updated] = await db.update(assetsTable).set(updates).where(eq(assetsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

    return res.json({ data: updated });
  } catch (err) {
    req.log.error({ err }, "Error updating asset");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE asset
router.delete("/assets/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }
    await db.delete(assetsTable).where(eq(assetsTable.id, id));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting asset");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
