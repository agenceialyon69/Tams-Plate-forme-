import { Router } from "express";
import { db } from "@workspace/db";
import { memoriesTable, memoryEdgesTable } from "@workspace/db";
import { eq, or, sql } from "drizzle-orm";
import {
  CreateMemoryBody,
  UpdateMemoryBody,
  ListMemoriesQueryParams,
} from "@workspace/api-zod";
import { dbGet, dbSet, dbInvalidate } from "../lib/cache-db";
import { emitMemoryCreated } from "../lib/workflows";
import {
  generateEmbedding,
  searchMemoriesSemantic,
  updateMemoryEmbedding,
  batchGenerateEmbeddings,
} from "../lib/embedding";

const router = Router();

const GRAPH_TTL_S = 10 * 60; // 10 minutes in seconds

function getGraphCacheKey(params: { center?: number; depth?: number }): string {
  return "graph:" + JSON.stringify({ center: params.center ?? "all", depth: params.depth ?? 1 });
}

async function getCachedGraph(params: { center?: number; depth?: number }): Promise<unknown | null> {
  return dbGet(getGraphCacheKey(params));
}

async function setCachedGraph(params: { center?: number; depth?: number }, data: unknown): Promise<void> {
  await dbSet(getGraphCacheKey(params), data, GRAPH_TTL_S);
}

export async function clearMemoryGraphCache(): Promise<void> {
  await dbInvalidate("graph:%");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9àâäéèêëîïôöùûüç\s]/gi, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function getTags(memory: typeof memoriesTable.$inferSelect): string[] {
  const tags = memory.tags as string[] | null | undefined;
  return tags ?? [];
}

function computeRelevanceScore(
  memory: typeof memoriesTable.$inferSelect,
  queryTokens: string[],
  now: number
): number {
  const titleTokens = tokenize(memory.title);
  const contentTokens = tokenize(memory.content ?? "");
  const tagTokens = getTags(memory).map((t: string) => t.toLowerCase());

  let score = 0;
  let matches = 0;

  for (const qt of queryTokens) {
    const inTitle = titleTokens.filter(t => t.includes(qt) || qt.includes(t)).length;
    const inContent = contentTokens.filter(t => t.includes(qt) || qt.includes(t)).length;
    const inTags = tagTokens.filter(t => t.includes(qt) || qt.includes(t)).length;

    if (inTitle) score += inTitle * 3; // title weight = 3
    if (inContent) score += inContent * 1; // content weight = 1
    if (inTags) score += inTags * 2.5; // tags weight = 2.5

    if (inTitle || inContent || inTags) matches++;
  }

  // Position bonus: earlier matches in title/content get tiny boost (simplified)
  if (matches > 0) {
    score *= (matches / queryTokens.length);
  }

  // Freshness bonus: decay over 90 days
  const ageDays = (now - new Date(memory.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
  const freshness = Math.max(0.5, 1 - ageDays / 90);
  score *= freshness;

  return score;
}

function computeSemanticScore(
  memory: typeof memoriesTable.$inferSelect,
  queryTokens: string[]
): number {
  const memTokens = new Set([
    ...tokenize(memory.title),
    ...tokenize(memory.content ?? ""),
    ...getTags(memory).map((t: string) => t.toLowerCase()),
  ]);

  let common = 0;
  for (const qt of queryTokens) {
    for (const mt of memTokens) {
      if (mt.includes(qt) || qt.includes(mt)) {
        common++;
        break;
      }
    }
  }

  const base = queryTokens.length > 0 ? common / queryTokens.length : 0;

  // Freshness bonus
  const ageDays = (Date.now() - new Date(memory.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
  const freshnessBonus = Math.max(0.5, 1 - ageDays / 90);

  return base * freshnessBonus;
}

function getCommonWords(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  let common = 0;
  for (const w of ta) {
    for (const x of tb) {
      if (w.includes(x) || x.includes(w)) {
        common++;
        break;
      }
    }
  }
  return common;
}

function getCommonTags(a: string[], b: string[]): number {
  const sa = new Set(a.map(t => t.toLowerCase()));
  const sb = new Set(b.map(t => t.toLowerCase()));
  let common = 0;
  for (const t of sa) if (sb.has(t)) common++;
  return common;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

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
    const page = Math.max(Number(req.query.page) || 1, 1);
    const offset = Number(req.query.offset) || ((page - 1) * limit);

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

    const hasMore = offset + filtered.length < total;

    return res.json(filtered);
  } catch (err) {
    req.log.error({ err }, "Error listing memories");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/memories/search — enhanced text search with relevance score
router.post("/memories/search", async (req, res) => {
  try {
    const { q, limit: rawLimit, type } = req.body as {
      q?: string;
      limit?: number;
      type?: string;
    };

    if (!q || typeof q !== "string") {
      return res.status(400).json({ error: "q is required" });
    }

    const limit = Math.min(Number(rawLimit) || 10, 100);
    const queryTokens = tokenize(q);
    if (queryTokens.length === 0) {
      return res.json({ data: [] });
    }

    // Fetch all memories (or filter by type first via DB)
    let memories: typeof memoriesTable.$inferSelect[] = [];
    if (type) {
      memories = await db
        .select()
        .from(memoriesTable)
        .where(eq(memoriesTable.type, type as any));
    } else {
      memories = await db.select().from(memoriesTable);
    }

    const now = Date.now();
    const scored = memories
      .map(m => ({
        memory: m,
        score: computeRelevanceScore(m, queryTokens, now),
      }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return res.json({
      data: scored.map(s => ({
        ...s.memory,
        relevanceScore: Number(s.score.toFixed(3)),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error searching memories");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/memories/semantic-search — vector-based semantic search via pgvector
router.post("/memories/semantic-search", async (req, res) => {
  try {
    const { q, limit: rawLimit, type } = req.body as {
      q?: string;
      limit?: number;
      type?: string;
    };

    if (!q || typeof q !== "string") {
      return res.status(400).json({ error: "q is required" });
    }

    const limit = Math.min(Number(rawLimit) || 10, 100);

    const results = await searchMemoriesSemantic(q, limit, type);

    return res.json({
      data: results.map(r => ({
        id: r.id,
        title: r.title,
        content: r.content,
        type: r.type,
        semanticScore: Number(r.similarity.toFixed(4)),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error in semantic search");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/memories/auto-link — detect implicit links and create edges
router.post("/memories/auto-link", async (req, res) => {
  try {
    const { threshold: rawThreshold } = req.body as { threshold?: number };
    const threshold = rawThreshold !== undefined ? Number(rawThreshold) : 0.5;

    const memories = await db.select().from(memoriesTable);
    const existingEdges = await db.select().from(memoryEdgesTable);

    // Build set of existing undirected pairs to avoid duplicates
    const existingPairs = new Set<string>();
    for (const e of existingEdges) {
      const a = Math.min(e.sourceId, e.targetId);
      const b = Math.max(e.sourceId, e.targetId);
      existingPairs.add(`${a}-${b}`);
    }

    const links: { sourceId: number; targetId: number; score: number }[] = [];

    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const a = memories[i];
        const b = memories[j];

        const pairKey = `${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`;
        if (existingPairs.has(pairKey)) continue;

        let score = 0;
        let factors = 0;

        // Common words
        const commonWords = getCommonWords(a.title + " " + (a.content ?? ""), b.title + " " + (b.content ?? ""));
        if (commonWords > 3) {
          score += Math.min(commonWords / 10, 1) * 0.4;
          factors++;
        }

        // Common tags
        const commonTags = getCommonTags(getTags(a), getTags(b));
        if (commonTags > 0) {
          score += Math.min(commonTags / 3, 1) * 0.35;
          factors++;
        }

        // Type compatibility bonus
        const compatibleTypes = a.type === b.type || (a.type === "person" && b.type === "project") || (a.type === "project" && b.type === "person");
        if (compatibleTypes) {
          score += 0.15;
          factors++;
        }

        // Freshness bonus if both recently updated
        const ageA = (Date.now() - new Date(a.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
        const ageB = (Date.now() - new Date(b.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
        if (ageA < 30 && ageB < 30) {
          score += 0.1;
          factors++;
        }

        if (factors > 0) score /= factors;
        if (score >= threshold) {
          links.push({ sourceId: a.id, targetId: b.id, score: Number(score.toFixed(3)) });
        }
      }
    }

    // Insert edges
    const createdEdges: typeof memoryEdgesTable.$inferSelect[] = [];
    for (const link of links) {
      const [edge] = await db
        .insert(memoryEdgesTable)
        .values({
          sourceId: link.sourceId,
          targetId: link.targetId,
          type: "related_to",
          note: `Auto-linked (score: ${link.score})`,
        })
        .returning();
      if (edge) createdEdges.push(edge);
    }

    await clearMemoryGraphCache();
    return res.json({
      created: createdEdges.length,
      links: createdEdges.map(e => ({
        id: e.id,
        sourceId: e.sourceId,
        targetId: e.targetId,
        type: e.type,
        note: e.note,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error auto-linking memories");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET graph — nodes + edges for visualization (with optional center/depth)
router.get("/memories/graph", async (req, res) => {
  try {
    const centerId = req.query.center ? Number(req.query.center) : undefined;
    const depthRaw = req.query.depth ? Number(req.query.depth) : 1;
    const depth = Math.min(Math.max(depthRaw, 1), 2);

    const cacheParams = { center: centerId, depth };
    const cached = await getCachedGraph(cacheParams);
    if (cached) {
      return res.json(cached);
    }

    const allNodes = await db.select().from(memoriesTable).orderBy(memoriesTable.updatedAt);
    const allEdges = await db.select().from(memoryEdgesTable);

    let nodes = allNodes;
    let edges = allEdges;

    if (centerId && !isNaN(centerId)) {
      // BFS to find neighbors up to depth
      const nodeSet = new Set<number>();
      nodeSet.add(centerId);

      const adj = new Map<number, number[]>();
      for (const e of allEdges) {
        if (!adj.has(e.sourceId)) adj.set(e.sourceId, []);
        if (!adj.has(e.targetId)) adj.set(e.targetId, []);
        adj.get(e.sourceId)!.push(e.targetId);
        adj.get(e.targetId)!.push(e.sourceId);
      }

      let current = new Set<number>([centerId]);
      for (let d = 0; d < depth; d++) {
        const next = new Set<number>();
        for (const id of current) {
          const neighbors = adj.get(id) ?? [];
          for (const n of neighbors) {
            if (!nodeSet.has(n)) {
              nodeSet.add(n);
              next.add(n);
            }
          }
        }
        current = next;
      }

      nodes = allNodes.filter(n => nodeSet.has(n.id));
      edges = allEdges.filter(e => nodeSet.has(e.sourceId) && nodeSet.has(e.targetId));
    }

    const result = {
      nodes: nodes.map(n => ({
        id: n.id,
        title: n.title,
        type: n.type,
        content: n.content,
        tags: getTags(n),
      })),
      edges: edges.map(e => ({
        id: e.id,
        source: e.sourceId,
        target: e.targetId,
        type: e.type,
        note: e.note,
      })),
    };

    await setCachedGraph(cacheParams, result);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error getting memory graph");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// CREATE memory with Zod validation + background embedding generation
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

    // Generate embedding in background (don't block response)
    if (created) {
      updateMemoryEmbedding(created.id).catch((err) => {
        req.log.error({ err, memoryId: created.id }, "Background embedding generation failed");
      });
    }

    await clearMemoryGraphCache();
    await emitMemoryCreated(created.id);
    return res.status(201).json({ data: created });
  } catch (err) {
    req.log.error({ err }, "Error creating memory");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// UPDATE memory with Zod validation + regenerate embedding
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

    // Regenerate embedding in background if title or content changed
    if (title !== undefined || content !== undefined) {
      updateMemoryEmbedding(id).catch((err) => {
        req.log.error({ err, memoryId: id }, "Background embedding regeneration failed");
      });
    }

    await clearMemoryGraphCache();
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
    await clearMemoryGraphCache();
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting memory");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/memories/batch-embed — generate embeddings for all existing memories
router.post("/memories/batch-embed", async (req, res) => {
  try {
    const result = await batchGenerateEmbeddings();
    return res.json({
      success: true,
      processed: result.processed,
      failed: result.failed,
    });
  } catch (err) {
    req.log.error({ err }, "Error batch generating embeddings");
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

    await clearMemoryGraphCache();
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
    await clearMemoryGraphCache();
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting edge");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
