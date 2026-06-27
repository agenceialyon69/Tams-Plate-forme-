-- ============================================================
-- ÉTAPE 6 — Action Hub
-- Apply on Supabase project tyqgwqgydrqluumefsjn
-- ============================================================

CREATE TABLE IF NOT EXISTS public.actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'custom',
  endpoint TEXT,
  method TEXT NOT NULL DEFAULT 'POST' CHECK (method IN ('GET','POST','PUT','PATCH','DELETE')),
  headers JSONB DEFAULT '{}'::jsonb,
  body_template TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('active','draft','disabled')),
  run_count INTEGER NOT NULL DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.actions TO authenticated;
GRANT ALL ON public.actions TO service_role;
CREATE POLICY "own actions" ON public.actions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'actions_updated_at') THEN
    CREATE TRIGGER actions_updated_at BEFORE UPDATE ON public.actions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_id UUID NOT NULL REFERENCES public.actions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','success','failed','timeout')),
  request_body TEXT,
  response_body TEXT,
  status_code INTEGER,
  latency_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.action_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.action_logs TO authenticated;
GRANT ALL ON public.action_logs TO service_role;
CREATE POLICY "own action_logs" ON public.action_logs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS action_logs_action_id ON public.action_logs (action_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  direction TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound','outbound')),
  url TEXT,
  secret TEXT,
  events TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','draft','disabled')),
  received_count INTEGER NOT NULL DEFAULT 0,
  last_received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhooks TO authenticated;
GRANT ALL ON public.webhooks TO service_role;
CREATE POLICY "own webhooks" ON public.webhooks FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
