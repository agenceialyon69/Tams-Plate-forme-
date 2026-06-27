export type AgentId =
  | "executive"
  | "engineering"
  | "product"
  | "business"
  | "marketing"
  | "research"
  | "memory"
  | "decision"
  | "studio"
  | "devops"
  | "redteam";

export type AgentStatus = "active" | "idle" | "busy" | "disabled";

export interface AgentTool {
  name: string;
  description: string;
  fn: string;
}

export interface AgentDefinition {
  id: AgentId;
  name: string;
  emoji: string;
  role: string;
  description: string;
  responsibilities: string[];
  tools: string[];
  delegatesTo: AgentId[];
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
}

export interface AgentMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  agent?: AgentId;
  tool_name?: string;
  tool_result?: unknown;
  timestamp: string;
}

export interface AgentSession {
  id: string;
  user_id: string;
  agent_id: AgentId;
  conversation_id: string | null;
  status: AgentStatus;
  context: Record<string, unknown>;
  messages: AgentMessage[];
  created_at: string;
  updated_at: string;
}

export interface AgentRunResult {
  agent_id: AgentId;
  response: string;
  delegations: Array<{ agent_id: AgentId; task: string; result: string }>;
  tool_calls: Array<{ tool: string; result: unknown }>;
  tokens_used: number;
  model_used: string;
  latency_ms: number;
}
