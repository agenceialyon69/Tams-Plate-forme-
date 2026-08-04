/**
 * Persistent cache using PostgreSQL instead of in-memory Node.js cache.
 * Survives server restarts and works across multiple instances.
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const CACHE_TABLE = "cache";

/**
 * Le cache est une OPTIMISATION, jamais une source de vérité. Si la table
 * n'existe pas encore (base fraîche avant ensureSchema) ou si Postgres est
 * momentanément indisponible, une opération de cache ne doit JAMAIS faire
 * échouer la requête métier appelante (création de tâche, décision, mémoire…).
 * On journalise et on dégrade proprement au lieu de propager l'erreur.
 */
function warnCache(op: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(`[cache] ${op} ignoré (dégradation propre): ${msg}`);
}

export interface CacheEntry {
  key: string;
  value: unknown;
  expiresAt: Date | null;
}

/**
 * Ensure the cache table exists. Called once at startup.
 */
export async function initCacheTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(CACHE_TABLE)} (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      expires_at TIMESTAMP
    )
  `);
}

/**
 * Get a value from the persistent cache if not expired.
 */
export async function dbGet<T>(key: string): Promise<T | null> {
  try {
    const rows = await db.execute<{
      key: string;
      value: string;
      expires_at: string | null;
    }>(sql`
      SELECT key, value, expires_at
      FROM ${sql.identifier(CACHE_TABLE)}
      WHERE key = ${key}
        AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1
    `);

    // db.execute returns QueryResult which has .rows array
    const row = (rows as any).rows?.[0] ?? (rows as any)[0];
    if (!row) return null;

    try {
      return typeof row.value === "string" ? (JSON.parse(row.value) as T) : (row.value as T);
    } catch {
      return null;
    }
  } catch (err) {
    warnCache("dbGet", err);
    return null; // cache miss propre → l'appelant recalcule
  }
}

/**
 * Set a value in the persistent cache with optional TTL in seconds.
 */
export async function dbSet<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
  const expiresAt = ttlSeconds
    ? new Date(Date.now() + ttlSeconds * 1000)
    : null;

  try {
    await db.execute(sql`
      INSERT INTO ${sql.identifier(CACHE_TABLE)} (key, value, expires_at)
      VALUES (${key}, ${JSON.stringify(value)}::jsonb, ${expiresAt})
      ON CONFLICT (key)
      DO UPDATE SET
        value = EXCLUDED.value,
        expires_at = EXCLUDED.expires_at
    `);
  } catch (err) {
    warnCache("dbSet", err); // écriture cache non critique
  }
}

/**
 * Invalidate cache entries matching a SQL LIKE pattern.
 * Use % as wildcard. Example: 'briefing:%' or 'dashboard:%'.
 */
export async function dbInvalidate(pattern: string): Promise<number> {
  try {
    const result = await db.execute<{ count: string }>(sql`
      DELETE FROM ${sql.identifier(CACHE_TABLE)}
      WHERE key LIKE ${pattern}
      RETURNING 1
    `);
    const rows = (result as any).rows ?? (result as any);
    return Array.isArray(rows) ? rows.length : 0;
  } catch (err) {
    warnCache("dbInvalidate", err); // invalidation ratée → au pire une lecture périmée, jamais un 500
    return 0;
  }
}

/**
 * Delete a single cache entry by key.
 */
export async function dbDelete(key: string): Promise<void> {
  try {
    await db.execute(sql`
      DELETE FROM ${sql.identifier(CACHE_TABLE)}
      WHERE key = ${key}
    `);
  } catch (err) {
    warnCache("dbDelete", err);
  }
}
