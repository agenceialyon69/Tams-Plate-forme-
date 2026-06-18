import { pool } from "./index";

/**
 * Create all tables if they don't exist yet. Idempotent and safe to run on
 * every startup — it lets the app bootstrap a fresh database with zero manual
 * steps (no `drizzle-kit push` / terminal needed for first run).
 *
 * Note: this only creates missing tables. For evolving an existing schema,
 * use `pnpm --filter @workspace/db run push`.
 */
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS captures (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'text',
    extracted_tasks INTEGER NOT NULL DEFAULT 0,
    extracted_events INTEGER NOT NULL DEFAULT 0,
    extracted_learnings INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    due_date TEXT,
    priority TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'pending',
    priority_domain TEXT,
    capture_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    event_date TEXT NOT NULL,
    event_time TEXT,
    category TEXT NOT NULL DEFAULT 'personal',
    capture_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS learnings (
    id SERIAL PRIMARY KEY,
    subject TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'personal',
    capture_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS decisions (
    id SERIAL PRIMARY KEY,
    question TEXT NOT NULL,
    context TEXT,
    analysis TEXT,
    priority_conflicts TEXT,
    alternatives TEXT,
    blind_spots TEXT,
    outcome TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS memory (
    id SERIAL PRIMARY KEY,
    domain TEXT NOT NULL DEFAULT 'personal',
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS energy_logs (
    id SERIAL PRIMARY KEY,
    level INTEGER NOT NULL,
    note TEXT,
    log_date TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS evening_reviews (
    id SERIAL PRIMARY KEY,
    most_important_thing TEXT NOT NULL,
    energy_level INTEGER NOT NULL,
    deferred_items TEXT,
    abandoned_items TEXT,
    free_reflection TEXT,
    kore_response TEXT,
    review_date TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS recordings (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    context TEXT,
    meeting_type TEXT NOT NULL DEFAULT 'meeting',
    duration_seconds INTEGER,
    transcript TEXT,
    summary TEXT,
    action_items TEXT,
    commitments TEXT,
    decisions TEXT,
    blind_spots TEXT,
    red_team_critique TEXT,
    tams_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let dbReady = false;
let lastDbError: string | null = null;

// Postgres connection errors often carry the useful detail in code/errno/
// syscall/address rather than message. Surface all of it.
function formatErr(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const parts = [e.code, e.errno, e.syscall, e.address, e.port, e.message]
      .filter((x) => x !== undefined && x !== null && x !== "")
      .map(String);
    if (parts.length) return parts.join(" ");
  }
  return String(err);
}

/** Connection target + status, for diagnostics. Never exposes credentials. */
export function getDbStatus(): {
  dbReady: boolean;
  lastDbError: string | null;
  target: string | null;
  hasDatabaseUrl: boolean;
  databaseUrlLength: number;
  hasPgHost: boolean;
} {
  const cs = process.env.DATABASE_URL;
  let target: string | null = null;
  try {
    if (cs) {
      const u = new URL(cs);
      target = `${u.hostname}:${u.port || "5432"}${u.pathname}`;
    } else if (process.env.PGHOST) {
      target = `${process.env.PGHOST}:${process.env.PGPORT || "5432"}/${process.env.PGDATABASE || ""}`;
    }
  } catch {
    target = "(unparseable DATABASE_URL)";
  }
  return {
    dbReady,
    lastDbError,
    target,
    hasDatabaseUrl: Boolean(cs),
    databaseUrlLength: cs ? cs.length : 0,
    hasPgHost: Boolean(process.env.PGHOST),
  };
}

/**
 * Wait for the database to accept connections, logging progress. On hosts like
 * Railway/Render the Postgres service may start after the app, so we retry.
 */
async function waitForDatabase(attempts = 30, delayMs = 2000): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      lastDbError = formatErr(err);
      console.error(
        `[db] not reachable yet (attempt ${i}/${attempts}): ${lastDbError}`,
      );
      if (i === attempts) throw err;
      await sleep(delayMs);
    }
  }
}

/**
 * Ensure the schema exists. Never throws: the caller keeps the HTTP server
 * running regardless, so a database problem degrades DB-backed routes but does
 * not crash-loop the deploy. Returns true on success.
 */
export async function ensureSchema(): Promise<boolean> {
  try {
    await waitForDatabase();
    for (const sql of STATEMENTS) {
      await pool.query(sql);
    }
    dbReady = true;
    lastDbError = null;
    return true;
  } catch (err) {
    lastDbError = formatErr(err);
    console.error(
      `[db] Could not prepare schema — DB-backed routes will fail until the ` +
        `database is reachable. Check DATABASE_URL. Last error: ${lastDbError}`,
    );
    return false;
  }
}
