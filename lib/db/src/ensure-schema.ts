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
];

export async function ensureSchema(): Promise<void> {
  for (const sql of STATEMENTS) {
    await pool.query(sql);
  }
}
