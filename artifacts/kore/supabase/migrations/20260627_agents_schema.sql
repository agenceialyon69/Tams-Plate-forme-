-- ============================================================
-- LOT 1 — Agent System
-- Apply on Supabase project tyqgwqgydrqluumefsjn
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  conversation_id UUID,
  title TEXT NOT NULL DEFAULT 'Session agent',
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('active','idle','busy','disabled')),
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  last_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_sessions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_sessions TO authenticated;
GRANT ALL ON public.agent_sessions TO service_role;
CREATE POLICY "own agent_sessions" ON public.agent_sessions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'agent_sessions_updated_at') THEN
    CREATE TRIGGER agent_sessions_updated_at
    BEFORE UPDATE ON public.agent_sessions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS agent_sessions_user_agent ON public.agent_sessions (user_id, agent_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.agent_sessions(id) ON DELETE SET NULL,
  agent_id TEXT NOT NULL,
  model_used TEXT,
  user_message TEXT NOT NULL,
  agent_response TEXT NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_agent_runs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_runs TO authenticated;
GRANT ALL ON public.ai_agent_runs TO service_role;
CREATE POLICY "own ai_agent_runs" ON public.ai_agent_runs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS ai_agent_runs_user_agent ON public.ai_agent_runs (user_id, agent_id, created_at DESC);
