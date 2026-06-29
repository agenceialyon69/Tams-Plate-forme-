/**
 * Embedding module — génération d'embeddings sémantiques pour la recherche vectorielle.
 *
 * Stratégie free-first :
 *  1. Ollama local (embedding endpoint /api/embeddings)
 *  2. Sentence-transformers via HuggingFace Inference API (gratuit, rate-limité)
 *  3. OpenRouter avec un modèle d'embedding gratuit
 *  4. Fallback : vecteur aléatoire normalisé (pour dev/tests sans réseau)
 */

import { db, memoriesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const EMBEDDING_DIM = 384;

// Cache en mémoire pour éviter les appels répétés
const embeddingCache = new Map<string, number[]>();
const CACHE_MAX_SIZE = 5000;

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9àâäéèêëîïôöùûüç\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

function cacheKey(text: string): string {
  // Simple hash pour la clé de cache
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return `${h}:${text.slice(0, 100)}`;
}

function getCached(text: string): number[] | undefined {
  return embeddingCache.get(cacheKey(text));
}

function setCached(text: string, vec: number[]): void {
  const key = cacheKey(text);
  if (embeddingCache.size >= CACHE_MAX_SIZE) {
    // Eviction FIFO simple
    const first = embeddingCache.keys().next().value;
    if (first !== undefined) embeddingCache.delete(first);
  }
  embeddingCache.set(key, vec);
}

function normalizeVector(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (norm === 0) return vec;
  return vec.map(v => v / norm);
}

function randomUnitVector(dim: number): number[] {
  const vec = Array.from({ length: dim }, () => Math.random() * 2 - 1);
  return normalizeVector(vec);
}

/** Appelle l'API Ollama pour générer un embedding. */
async function ollamaEmbedding(text: string): Promise<number[] | null> {
  const baseUrl = process.env.OLLAMA_BASE_URL;
  if (!baseUrl) return null;

  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text", prompt: text }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    if (Array.isArray(data.embedding)) {
      const vec = (data.embedding as unknown[]).map((v: unknown) => Number(v));
      if (vec.length === EMBEDDING_DIM) return normalizeVector(vec);
      // Certains modèles Ollama retournent d'autres dimensions — on tronque/pad
      if (vec.length > 0) {
        const padded = vec.slice(0, EMBEDDING_DIM);
        while (padded.length < EMBEDDING_DIM) padded.push(0);
        return normalizeVector(padded);
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Appelle HuggingFace Inference API (sentence-transformers). */
async function hfEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.HF_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
        signal: AbortSignal.timeout(45_000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json() as unknown[] | unknown[][];
    // Réponse : number[][] (batch de phrases) ou number[] (une seule phrase)
    let vec: number[];
    if (Array.isArray(data) && Array.isArray(data[0])) {
      vec = (data[0] as unknown[]).map((v: unknown) => Number(v));
    } else if (Array.isArray(data)) {
      vec = (data as unknown[]).map((v: unknown) => Number(v));
    } else {
      return null;
    }
    if (vec.length === EMBEDDING_DIM) return normalizeVector(vec);
    if (vec.length > 0) {
      const padded = vec.slice(0, EMBEDDING_DIM);
      while (padded.length < EMBEDDING_DIM) padded.push(0);
      return normalizeVector(padded);
    }
    return null;
  } catch {
    return null;
  }
}

/** Appelle OpenRouter pour un embedding gratuit. */
async function openRouterEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.OPENROUTER_REFERER || "https://tams.app",
        "X-Title": "TAMS",
      },
      body: JSON.stringify({
        model: "sentence-transformers/all-MiniLM-L6-v2",
        input: text,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { data?: Array<{ embedding?: number[] }> };
    const vec = data?.data?.[0]?.embedding as number[] | undefined;
    if (vec && Array.isArray(vec)) {
      if (vec.length === EMBEDDING_DIM) return normalizeVector(vec);
      const padded = vec.slice(0, EMBEDDING_DIM);
      while (padded.length < EMBEDDING_DIM) padded.push(0);
      return normalizeVector(padded);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Génère un embedding pour un texte donné.
 * Tente dans l'ordre : Ollama → HuggingFace → OpenRouter → fallback aléatoire.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const normalized = normalizeText(text);
  if (!normalized) return randomUnitVector(EMBEDDING_DIM);

  const cached = getCached(normalized);
  if (cached) return cached;

  let vec = await ollamaEmbedding(normalized);
  if (!vec) vec = await hfEmbedding(normalized);
  if (!vec) vec = await openRouterEmbedding(normalized);
  if (!vec) vec = randomUnitVector(EMBEDDING_DIM);

  setCached(normalized, vec);
  return vec;
}

/**
 * Recherche sémantique via la fonction SQL `match_memories`.
 */
export async function searchMemoriesSemantic(
  query: string,
  limit: number,
  typeFilter?: string
): Promise<Array<{ id: number; title: string; content: string | null; type: string; similarity: number }>> {
  const embedding = await generateEmbedding(query);

  // Construit le vecteur SQL : '[v1,v2,...]'::vector(384)
  const vectorLiteral = `[${embedding.join(",")}]`;

  const threshold = 0.3;
  const count = Math.min(limit, 100);

  // On utilise raw SQL pour appeler match_memories
  const sqlQuery = sql`
    SELECT * FROM match_memories(
      ${sql.raw(`'${vectorLiteral}'::vector(384)`)},
      ${threshold},
      ${count}
    )
  `;

  // Si un filtre de type est demandé, on filtre après
  const results = await db.execute(sqlQuery);

  const rows = Array.isArray(results) ? results : (results as { rows?: Record<string, unknown>[] }).rows ?? [];

  const mapped = rows.map((r: Record<string, unknown>) => ({
    id: Number(r.id),
    title: String(r.title),
    content: r.content ? String(r.content) : null,
    type: String(r.type),
    similarity: Number(r.similarity),
  }));

  if (typeFilter) {
    return mapped.filter((item: { type: string }) => item.type === typeFilter);
  }
  return mapped;
}

/**
 * Met à jour l'embedding d'une mémoire existante.
 */
export async function updateMemoryEmbedding(memoryId: number): Promise<void> {
  const [memory] = await db
    .select()
    .from(memoriesTable)
    .where(eq(memoriesTable.id, memoryId))
    .limit(1);

  if (!memory) return;

  const text = `${memory.title} ${memory.content ?? ""}`;
  const embedding = await generateEmbedding(text);
  const vectorLiteral = `[${embedding.join(",")}]`;

  await db.execute(sql`
    UPDATE memories
    SET embedding = ${sql.raw(`'${vectorLiteral}'::vector(384)`)}
    WHERE id = ${memoryId}
  `);
}

/**
 * Génère les embeddings pour toutes les mémoires existantes (batch).
 * Utile pour la migration initiale.
 */
export async function batchGenerateEmbeddings(): Promise<{ processed: number; failed: number }> {
  const allMemories = await db.select().from(memoriesTable);
  let processed = 0;
  let failed = 0;

  for (const memory of allMemories) {
    try {
      await updateMemoryEmbedding(memory.id);
      processed++;
    } catch (err) {
      failed++;
      console.error(`Failed to embed memory ${memory.id}:`, err);
    }
  }

  return { processed, failed };
}
