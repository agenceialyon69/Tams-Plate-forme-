/**
 * Persistent cache using PostgreSQL instead of in-memory Node.js cache.
 * Survives server restarts and works across multiple instances.
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const CACHE_TABLE = "cache";

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
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

/**
 * Set a value in the persistent cache with optional TTL in seconds.
 */
export async function dbSet<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
  const expiresAt = ttlSeconds
    ? new Date(Date.now() + ttlSeconds * 1000)
    : null;

  await db.execute(sql`
    INSERT INTO ${sql.identifier(CACHE_TABLE)} (key, value, expires_at)
    VALUES (${key}, ${JSON.stringify(value)}::jsonb, ${expiresAt})
    ON CONFLICT (key)
    DO UPDATE SET
      value = EXCLUDED.value,
      expires_at = EXCLUDED.expires_at
  `);
}

/**
 * Invalidate cache entries matching a SQL LIKE pattern.
 * Use % as wildcard. Example: 'briefing:%' or 'dashboard:%'.
 */
export async function dbInvalidate(pattern: string): Promise<number> {
  const result = await db.execute<{ count: string }>(sql`
    DELETE FROM ${sql.identifier(CACHE_TABLE)}
    WHERE key LIKE ${pattern}
    RETURNING 1
  `);
  const rows = (result as any).rows ?? (result as any);
  return Array.isArray(rows) ? rows.length : 0;
}

/**
 * Delete a single cache entry by key.
 */
export async function dbDelete(key: string): Promise<void> {
  await db.execute(sql`
    DELETE FROM ${sql.identifier(CACHE_TABLE)}
    WHERE key = ${key}
  `);
}
