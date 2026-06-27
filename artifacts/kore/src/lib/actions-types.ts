export type ActionStatus = "active" | "draft" | "disabled";
export type ActionLogStatus = "pending" | "running" | "success" | "failed" | "timeout";
export type WebhookMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type WebhookDirection = "inbound" | "outbound";

export interface Action {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  category: string;
  endpoint: string | null;
  method: WebhookMethod;
  headers: Record<string, string> | null;
  body_template: string | null;
  status: ActionStatus;
  run_count: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActionLog {
  id: string;
  user_id: string;
  action_id: string;
  status: ActionLogStatus;
  request_body: string | null;
  response_body: string | null;
  status_code: number | null;
  latency_ms: number | null;
  error: string | null;
  created_at: string;
}

export interface Webhook {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  direction: WebhookDirection;
  url: string | null;
  secret: string | null;
  events: string[];
  status: ActionStatus;
  received_count: number;
  last_received_at: string | null;
  created_at: string;
}
