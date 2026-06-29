import { supabase } from "./supabase";
import type { Conversation, Message, MessageRole } from "./chat-types";

export type { Conversation, Message, MessageRole };

export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("status", "active")
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Conversation[];
}

export async function createConversation(
  input?: Partial<Pick<Conversation, "title" | "model" | "system_prompt">>,
): Promise<Conversation> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      title: input?.title ?? "Nouvelle conversation",
      model: input?.model ?? "gemini-2.0-flash",
      system_prompt: input?.system_prompt ?? null,
      user_id: user.id,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Conversation;
}

export async function updateConversation(id: string, patch: Partial<Conversation>): Promise<void> {
  const { error } = await supabase.from("conversations").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function archiveConversation(id: string): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .update({ status: "archived" })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Message[];
}

export async function addMessage(
  input: Pick<Message, "conversation_id" | "role" | "content" | "model">,
): Promise<Message> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("messages")
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Message;
}
