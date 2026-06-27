export type MessageRole = "user" | "assistant" | "system";
export type ConversationStatus = "active" | "archived";

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  model: string | null;
  system_prompt: string | null;
  status: ConversationStatus;
  message_count: number;
  last_message_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  user_id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  created_at: string;
}
