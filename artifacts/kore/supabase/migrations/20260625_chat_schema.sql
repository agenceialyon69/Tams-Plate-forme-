-- ============================================================
-- ÉTAPE 7 — Chat
-- Apply on Supabase project tyqgwqgydrqluumefsjn
-- ============================================================

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Nouvelle conversation',
  model TEXT DEFAULT 'gemini-2.0-flash',
  system_prompt TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  message_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
CREATE POLICY "own conversations" ON public.conversations FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS conversations_user_id ON public.conversations (user_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  model TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
CREATE POLICY "own messages" ON public.messages FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS messages_conv_id ON public.messages (conversation_id, created_at ASC);

-- Trigger: update conversation stats on new message
CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.conversations
  SET message_count = message_count + 1,
      last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'messages_update_conv') THEN
    CREATE TRIGGER messages_update_conv
    AFTER INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.update_conversation_on_message();
  END IF;
END $$;
