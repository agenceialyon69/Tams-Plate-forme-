-- Sessions table for multi-device authentication
CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  refresh_token_hash TEXT UNIQUE,
  device_name TEXT,
  user_agent TEXT,
  ip_address TEXT,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Enable RLS on sessions
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies for sessions
CREATE POLICY "sessions_select_own" ON sessions FOR SELECT TO authenticated 
  USING (user_id = (SELECT id FROM users WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "sessions_insert_own" ON sessions FOR INSERT TO authenticated 
  WITH CHECK (true);
CREATE POLICY "sessions_delete_own" ON sessions FOR DELETE TO authenticated 
  USING (true);

-- Add lead_activities table if it doesn't exist
CREATE TABLE IF NOT EXISTS lead_activities (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON lead_activities(lead_id);

-- Enable RLS
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_activities_select" ON lead_activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "lead_activities_insert" ON lead_activities FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "lead_activities_delete" ON lead_activities FOR DELETE TO authenticated USING (true);