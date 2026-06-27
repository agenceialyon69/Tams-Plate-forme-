-- ============================================================
-- ÉTAPE 5 — Studio (Prompt Library + Tool Definitions)
-- Apply on Supabase project tyqgwqgydrqluumefsjn
-- ============================================================

CREATE TABLE IF NOT EXISTS public.prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN (
    'system','user','assistant','chain','red_team','evaluation','other'
  )),
  model_hint TEXT,
  temperature NUMERIC(4,2) CHECK (temperature >= 0 AND temperature <= 2),
  max_tokens INTEGER CHECK (max_tokens > 0),
  tags TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prompts TO authenticated;
GRANT ALL ON public.prompts TO service_role;
CREATE POLICY "own prompts" ON public.prompts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'prompts_updated_at') THEN
    CREATE TRIGGER prompts_updated_at BEFORE UPDATE ON public.prompts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  template TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN (
    'system','user','assistant','chain','red_team','evaluation','other'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prompt_templates TO authenticated;
GRANT ALL ON public.prompt_templates TO service_role;
CREATE POLICY "own templates" ON public.prompt_templates FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.tool_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  endpoint TEXT,
  method TEXT DEFAULT 'POST',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('active','draft','disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tool_definitions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tool_definitions TO authenticated;
GRANT ALL ON public.tool_definitions TO service_role;
CREATE POLICY "own tools" ON public.tool_definitions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
