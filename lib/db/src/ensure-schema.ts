import { pool } from "./index";

/**
 * Crée les types/tables manquants au démarrage (idempotent). Bootstrappe une
 * base Railway vierge sans étape manuelle. Doit rester aligné avec schema/*.
 */
const ENUMS: Array<[string, string[]]> = [
  ["conversation_mode", ["chat", "chief_of_staff", "decision", "red_team", "execution"]],
  ["message_role", ["user", "assistant", "system"]],
  ["task_status", ["todo", "in_progress", "done", "cancelled"]],
  ["task_priority", ["low", "medium", "high", "urgent"]],
  ["project_status", ["active", "paused", "completed", "archived"]],
  ["contact_status", ["prospect", "active", "inactive", "client"]],
  ["memory_type", ["person", "project", "company", "decision", "note", "goal", "event"]],
  ["decision_status", ["pending", "analyzing", "decided", "archived"]],
  ["asset_type", ["image", "video", "audio", "document", "prompt", "template", "result"]],
  ["activity_type", ["task", "project", "contact", "memory", "decision", "conversation", "asset", "ai_call", "tool_call"]],
  ["edge_type", ["works_on", "knows", "related_to", "decided_about", "part_of", "leads_to", "references", "collaborates_with"]],
];
function enumStmt(name: string, values: string[]): string {
  return `DO $$ BEGIN CREATE TYPE ${name} AS ENUM (${values.map(v => `'${v}'`).join(", ")}); EXCEPTION WHEN duplicate_object THEN null; END $$;`;
}
const TABLES = [
  `CREATE TABLE IF NOT EXISTS conversations (id SERIAL PRIMARY KEY, title TEXT NOT NULL, mode conversation_mode NOT NULL DEFAULT 'chat', message_count INTEGER NOT NULL DEFAULT 0, last_message TEXT, created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS messages (id SERIAL PRIMARY KEY, conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, role message_role NOT NULL, content TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT, status project_status NOT NULL DEFAULT 'active', created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS tasks (id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT, status task_status NOT NULL DEFAULT 'todo', priority task_priority NOT NULL DEFAULT 'medium', project_id INTEGER, due_date DATE, created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS contacts (id SERIAL PRIMARY KEY, name TEXT NOT NULL, company TEXT, email TEXT, phone TEXT, status contact_status NOT NULL DEFAULT 'prospect', notes TEXT, last_contacted_at TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS memories (id SERIAL PRIMARY KEY, title TEXT NOT NULL, type memory_type NOT NULL, content TEXT, tags JSONB NOT NULL DEFAULT '[]'::jsonb, related_ids JSONB NOT NULL DEFAULT '[]'::jsonb, created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS memory_edges (id SERIAL PRIMARY KEY, source_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE, target_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE, type edge_type NOT NULL, note TEXT, created_at TIMESTAMP NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS decisions (id SERIAL PRIMARY KEY, title TEXT NOT NULL, context TEXT, options JSONB NOT NULL DEFAULT '[]'::jsonb, advantages JSONB NOT NULL DEFAULT '[]'::jsonb, risks JSONB NOT NULL DEFAULT '[]'::jsonb, ai_advice TEXT, red_team_advice TEXT, result TEXT, learnings TEXT, status decision_status NOT NULL DEFAULT 'pending', confidence_score INTEGER NOT NULL DEFAULT 50, created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS assets (id SERIAL PRIMARY KEY, name TEXT NOT NULL, type asset_type NOT NULL, url TEXT, content TEXT, mime_type TEXT, size INTEGER, tags JSONB NOT NULL DEFAULT '[]'::jsonb, created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS activity (id SERIAL PRIMARY KEY, type activity_type NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, entity_id INTEGER, created_at TIMESTAMP NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS briefings (id SERIAL PRIMARY KEY, date DATE NOT NULL, greeting TEXT NOT NULL, priorities JSONB NOT NULL DEFAULT '[]'::jsonb, risks JSONB NOT NULL DEFAULT '[]'::jsonb, opportunities JSONB NOT NULL DEFAULT '[]'::jsonb, recommendations JSONB NOT NULL DEFAULT '[]'::jsonb, active_projects_count INTEGER NOT NULL DEFAULT 0, pending_tasks_count INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMP NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS project_contacts (id SERIAL PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE, role TEXT, created_at TIMESTAMP NOT NULL DEFAULT now())`,
];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function waitForDatabase(attempts = 30, delayMs = 2000): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try { await pool.query("SELECT 1"); return; }
    catch (err) {
      console.error(`[db] pas encore joignable (${i}/${attempts}): ${err instanceof Error ? err.message : err}`);
      if (i === attempts) throw err;
      await sleep(delayMs);
    }
  }
}

const PGVECTOR_SQL = [
  `CREATE EXTENSION IF NOT EXISTS vector`,
  `ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding vector(384)`,
  `ALTER TABLE memories ADD COLUMN IF NOT EXISTS search_vector tsvector`,
  `CREATE INDEX IF NOT EXISTS idx_memories_search_vector ON memories USING GIN(search_vector)`,
  `CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memories USING ivfflat (embedding vector_cosine_ops)`,
];

const TRIGGER_SQL = `
  CREATE OR REPLACE FUNCTION update_search_vector()
  RETURNS trigger AS $$
  BEGIN
    NEW.search_vector :=
      setweight(to_tsvector('french', COALESCE(NEW.title, '')), 'A') ||
      setweight(to_tsvector('french', COALESCE(NEW.content, '')), 'B') ||
      setweight(to_tsvector('french', COALESCE(array_to_string(ARRAY(SELECT jsonb_array_elements_text(NEW.tags)), ' '), '')), 'C');
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
`;

const MATCH_MEMORIES_SQL = `
  CREATE OR REPLACE FUNCTION match_memories(
    query_embedding vector(384),
    match_threshold float DEFAULT 0.5,
    match_count int DEFAULT 10
  )
  RETURNS TABLE(
    id int,
    title text,
    content text,
    type text,
    similarity float
  )
  LANGUAGE sql STABLE
  AS $$
    SELECT
      m.id,
      m.title,
      m.content,
      m.type,
      1 - (m.embedding <=> query_embedding) AS similarity
    FROM memories m
    WHERE 1 - (m.embedding <=> query_embedding) > match_threshold
    ORDER BY m.embedding <=> query_embedding
    LIMIT match_count;
  $$;
`;

const ATTACH_TRIGGER_SQL = `
  DROP TRIGGER IF EXISTS memories_search_vector_update ON memories;
  CREATE TRIGGER memories_search_vector_update
    BEFORE INSERT OR UPDATE ON memories
    FOR EACH ROW
    EXECUTE FUNCTION update_search_vector();
`;

/** Garantit le schéma. Ne lève jamais (pas de crash-loop). */
export async function ensureSchema(): Promise<boolean> {
  try {
    await waitForDatabase();
    for (const [n, v] of ENUMS) await pool.query(enumStmt(n, v));
    for (const sql of TABLES) await pool.query(sql);
    for (const sql of PGVECTOR_SQL) {
      try { await pool.query(sql); }
      catch (err) {
        console.error(`[db] pgvector step échoué (non bloquant): ${err instanceof Error ? err.message : err}`);
      }
    }
    await pool.query(TRIGGER_SQL);
    await pool.query(MATCH_MEMORIES_SQL);
    await pool.query(ATTACH_TRIGGER_SQL);
    return true;
  } catch (err) {
    console.error(`[db] ensureSchema a échoué (le serveur continue): ${err instanceof Error ? err.message : err}`);
    return false;
  }
}
