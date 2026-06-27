import { supabase } from "./supabase";
import type { Action, ActionLog, Webhook, ActionStatus } from "./actions-types";

export type { Action, ActionLog, Webhook, ActionStatus };

export async function listActions(): Promise<Action[]> {
  const { data, error } = await supabase
    .from("actions")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Action[];
}

export async function createAction(
  input: Pick<Action, "name" | "description" | "category" | "endpoint" | "method" | "body_template">,
): Promise<Action> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("actions")
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Action;
}

export async function updateAction(id: string, patch: Partial<Action>): Promise<void> {
  const { error } = await supabase.from("actions").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listActionLogs(actionId?: string): Promise<ActionLog[]> {
  let q = supabase.from("action_logs").select("*");
  if (actionId) q = q.eq("action_id", actionId);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as ActionLog[];
}

export async function logAction(
  actionId: string,
  entry: Pick<ActionLog, "status" | "request_body" | "response_body" | "status_code" | "latency_ms" | "error">,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("action_logs")
    .insert({ ...entry, action_id: actionId, user_id: user.id });
  if (error) throw new Error(error.message);
}

export async function listWebhooks(): Promise<Webhook[]> {
  const { data, error } = await supabase
    .from("webhooks")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Webhook[];
}

export async function createWebhook(
  input: Pick<Webhook, "name" | "description" | "direction" | "url" | "events">,
): Promise<Webhook> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("webhooks")
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Webhook;
}

export async function updateWebhook(id: string, patch: Partial<Webhook>): Promise<void> {
  const { error } = await supabase.from("webhooks").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}
