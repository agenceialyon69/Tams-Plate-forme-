import { supabase } from "./supabase";
import type {
  Prompt, PromptTemplate, ToolDefinition,
  PromptCategory, PromptStatus,
} from "./studio-types";

export type { Prompt, PromptTemplate, ToolDefinition, PromptCategory, PromptStatus };

// ─── Prompts ─────────────────────────────────────────────────────────────────

export async function listPrompts(filter?: {
  category?: PromptCategory;
  status?: PromptStatus;
  search?: string;
}): Promise<Prompt[]> {
  let q = supabase.from("prompts").select("*");
  if (filter?.category) q = q.eq("category", filter.category);
  if (filter?.status)   q = q.eq("status", filter.status);
  if (filter?.search)   q = q.ilike("title", `%${filter.search}%`);
  const { data, error } = await q.order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Prompt[];
}

export async function getPrompt(id: string): Promise<Prompt | null> {
  const { data, error } = await supabase.from("prompts").select("*").eq("id", id).single();
  if (error) return null;
  return data as Prompt;
}

export async function createPrompt(
  input: Pick<Prompt, "title" | "content" | "category" | "model_hint" | "temperature" | "tags">,
): Promise<Prompt> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("prompts")
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Prompt;
}

export async function updatePrompt(id: string, patch: Partial<Prompt>): Promise<void> {
  const { error } = await supabase.from("prompts").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deletePrompt(id: string): Promise<void> {
  const { error } = await supabase.from("prompts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function incrementPromptUse(id: string, currentCount: number): Promise<void> {
  const { error } = await supabase
    .from("prompts")
    .update({ use_count: currentCount + 1 })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Templates ───────────────────────────────────────────────────────────────

export async function listTemplates(): Promise<PromptTemplate[]> {
  const { data, error } = await supabase
    .from("prompt_templates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PromptTemplate[];
}

export async function createTemplate(
  input: Pick<PromptTemplate, "name" | "description" | "template" | "category">,
): Promise<PromptTemplate> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("prompt_templates")
    .insert({ ...input, user_id: user.id, variables: [] })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as PromptTemplate;
}

// ─── Tool Definitions ─────────────────────────────────────────────────────────

export async function listTools(): Promise<ToolDefinition[]> {
  const { data, error } = await supabase
    .from("tool_definitions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ToolDefinition[];
}

export async function createTool(
  input: Pick<ToolDefinition, "name" | "description" | "endpoint" | "method">,
): Promise<ToolDefinition> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("tool_definitions")
    .insert({ ...input, user_id: user.id, schema: { type: "object", properties: {} } })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as ToolDefinition;
}

export async function updateTool(id: string, patch: Partial<ToolDefinition>): Promise<void> {
  const { error } = await supabase.from("tool_definitions").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}
