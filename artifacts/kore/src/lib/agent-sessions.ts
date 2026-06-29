import { supabase } from "./supabase";
import type { AgentId, AgentMessage } from "./agents/types";

export interface AgentSession {
  id: string;
  user_id: string;
  agent_id: AgentId;
  conversation_id: string | null;
  title: string;
  status: "active" | "idle" | "busy" | "disabled";
  context: Record<string, unknown>;
  messages: AgentMessage[];
  total_tokens: number;
  last_model: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiAgentRun {
  id: string;
  user_id: string;
  session_id: string | null;
  agent_id: AgentId;
  model_used: string | null;
  user_message: string;
  agent_response: string;
  tokens_used: number;
  latency_ms: number;
  created_at: string;
}

export async function listAgentSessions(agentId?: AgentId): Promise<AgentSession[]> {
  let q = supabase.from("agent_sessions").select("*");
  if (agentId) q = q.eq("agent_id", agentId);
  const { data, error } = await q.order("updated_at", { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AgentSession[];
}

export async function createAgentSession(
  agentId: AgentId,
  title?: string,
): Promise<AgentSession> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("agent_sessions")
    .insert({
      agent_id: agentId,
      user_id: user.id,
      title: title ?? `Session ${agentId}`,
      status: "active",
      context: {},
      messages: [],
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as AgentSession;
}

export async function appendSessionMessage(
  sessionId: string,
  messages: AgentMessage[],
  tokenDelta: number,
  model: string,
): Promise<void> {
  const { error } = await supabase
    .from("agent_sessions")
    .update({
      messages,
      total_tokens: tokenDelta,
      last_model: model,
      status: "idle",
    })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}

export async function logAgentRun(run: Omit<AiAgentRun, "id" | "user_id" | "created_at">): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("ai_agent_runs").insert({ ...run, user_id: user.id });
}

export async function listAgentRuns(agentId?: AgentId, limit = 20): Promise<AiAgentRun[]> {
  let q = supabase.from("ai_agent_runs").select("*");
  if (agentId) q = q.eq("agent_id", agentId);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AiAgentRun[];
}
