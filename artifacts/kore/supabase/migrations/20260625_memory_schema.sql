-- ============================================================
-- ÉTAPE 3 — Memory Graph OS
-- Apply this migration on your Supabase project:
--   Project: tyqgwqgydrqluumefsjn
--   Dashboard → SQL Editor → paste + run
-- ============================================================

CREATE TABLE IF NOT EXISTS public.memory_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'concept' CHECK (kind IN (
    'person','company','project','concept','resource','event','decision','insight'
  )),
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.memory_nodes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memory_nodes TO authenticated;
GRANT ALL ON public.memory_nodes TO service_role;
CREATE POLICY "own memory_nodes" ON public.memory_nodes FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS memory_nodes_user_kind ON public.memory_nodes (user_id, kind);
CREATE INDEX IF NOT EXISTS memory_nodes_label ON public.memory_nodes USING gin(to_tsvector('simple', label));

CREATE TABLE IF NOT EXISTS public.memory_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.memory_nodes(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES public.memory_nodes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'relates_to' CHECK (kind IN (
    'knows','works_at','owns','relates_to','blocks','enables','references','led_to'
  )),
  label TEXT,
  weight NUMERIC(4,2) DEFAULT 1.0 CHECK (weight >= 0 AND weight <= 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, target_id, kind)
);
ALTER TABLE public.memory_edges ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memory_edges TO authenticated;
GRANT ALL ON public.memory_edges TO service_role;
CREATE POLICY "own memory_edges" ON public.memory_edges FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
