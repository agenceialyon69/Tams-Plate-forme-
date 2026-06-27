export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      agent_runs: {
        Row: {
          agent: string;
          ended_at: string | null;
          error: string | null;
          id: string;
          prompt: string | null;
          started_at: string;
          status: string;
          steps: number | null;
          tokens_in: number | null;
          tokens_out: number | null;
          user_id: string;
        };
        Insert: {
          agent: string;
          ended_at?: string | null;
          error?: string | null;
          id?: string;
          prompt?: string | null;
          started_at?: string;
          status?: string;
          steps?: number | null;
          tokens_in?: number | null;
          tokens_out?: number | null;
          user_id: string;
        };
        Update: {
          agent?: string;
          ended_at?: string | null;
          error?: string | null;
          id?: string;
          prompt?: string | null;
          started_at?: string;
          status?: string;
          steps?: number | null;
          tokens_in?: number | null;
          tokens_out?: number | null;
          user_id?: string;
        };
        Relationships: [];
      };
      approvals: {
        Row: {
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          expires_at: string;
          id: string;
          input: Json;
          reason: string | null;
          status: string;
          tool_name: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          expires_at?: string;
          id?: string;
          input?: Json;
          reason?: string | null;
          status?: string;
          tool_name: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          expires_at?: string;
          id?: string;
          input?: Json;
          reason?: string | null;
          status?: string;
          tool_name?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          payload: Json;
          subject: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          payload?: Json;
          subject?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          payload?: Json;
          subject?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      capabilities: {
        Row: {
          created_at: string;
          expires_at: string | null;
          granted_by: string | null;
          id: string;
          reason: string | null;
          resource: string | null;
          revoked_at: string | null;
          scope: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string | null;
          granted_by?: string | null;
          id?: string;
          reason?: string | null;
          resource?: string | null;
          revoked_at?: string | null;
          scope: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string | null;
          granted_by?: string | null;
          id?: string;
          reason?: string | null;
          resource?: string | null;
          revoked_at?: string | null;
          scope?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          id: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
        };
        Relationships: [];
      };
      tool_calls: {
        Row: {
          approval_id: string | null;
          capability_id: string | null;
          created_at: string;
          duration_ms: number | null;
          error: string | null;
          id: string;
          input: Json;
          output: Json | null;
          run_id: string | null;
          status: string;
          tool_name: string;
          user_id: string;
        };
        Insert: {
          approval_id?: string | null;
          capability_id?: string | null;
          created_at?: string;
          duration_ms?: number | null;
          error?: string | null;
          id?: string;
          input?: Json;
          output?: Json | null;
          run_id?: string | null;
          status: string;
          tool_name: string;
          user_id: string;
        };
        Update: {
          approval_id?: string | null;
          capability_id?: string | null;
          created_at?: string;
          duration_ms?: number | null;
          error?: string | null;
          id?: string;
          input?: Json;
          output?: Json | null;
          run_id?: string | null;
          status?: string;
          tool_name?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: "admin" | "user";
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: "admin" | "user";
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: "admin" | "user";
          user_id?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: { id: string; user_id: string; name: string; description: string | null; status: string; priority: string; risk_level: string | null; due_date: string | null; created_at: string; updated_at: string; };
        Insert: { id?: string; user_id: string; name: string; description?: string | null; status?: string; priority?: string; risk_level?: string | null; due_date?: string | null; created_at?: string; updated_at?: string; };
        Update: { id?: string; user_id?: string; name?: string; description?: string | null; status?: string; priority?: string; risk_level?: string | null; due_date?: string | null; created_at?: string; updated_at?: string; };
        Relationships: [];
      };
      people: {
        Row: { id: string; user_id: string; name: string; role: string | null; email: string | null; context: string | null; created_at: string; };
        Insert: { id?: string; user_id: string; name: string; role?: string | null; email?: string | null; context?: string | null; created_at?: string; };
        Update: { id?: string; user_id?: string; name?: string; role?: string | null; email?: string | null; context?: string | null; created_at?: string; };
        Relationships: [];
      };
      cos_tasks: {
        Row: { id: string; user_id: string; project_id: string | null; title: string; description: string | null; status: string; priority: string; due_date: string | null; assignee_id: string | null; created_at: string; updated_at: string; };
        Insert: { id?: string; user_id: string; project_id?: string | null; title: string; description?: string | null; status?: string; priority?: string; due_date?: string | null; assignee_id?: string | null; created_at?: string; updated_at?: string; };
        Update: { id?: string; user_id?: string; project_id?: string | null; title?: string; description?: string | null; status?: string; priority?: string; due_date?: string | null; assignee_id?: string | null; created_at?: string; updated_at?: string; };
        Relationships: [];
      };
      decisions: {
        Row: { id: string; user_id: string; project_id: string | null; title: string; context: string | null; options: string[] | null; chosen: string | null; reasoning: string | null; status: string; decided_at: string | null; created_at: string; };
        Insert: { id?: string; user_id: string; project_id?: string | null; title: string; context?: string | null; options?: string[] | null; chosen?: string | null; reasoning?: string | null; status?: string; decided_at?: string | null; created_at?: string; };
        Update: { id?: string; user_id?: string; project_id?: string | null; title?: string; context?: string | null; options?: string[] | null; chosen?: string | null; reasoning?: string | null; status?: string; decided_at?: string | null; created_at?: string; };
        Relationships: [];
      };
      risks: {
        Row: { id: string; user_id: string; project_id: string | null; title: string; description: string | null; severity: string; probability: string; mitigation: string | null; status: string; created_at: string; };
        Insert: { id?: string; user_id: string; project_id?: string | null; title: string; description?: string | null; severity?: string; probability?: string; mitigation?: string | null; status?: string; created_at?: string; };
        Update: { id?: string; user_id?: string; project_id?: string | null; title?: string; description?: string | null; severity?: string; probability?: string; mitigation?: string | null; status?: string; created_at?: string; };
        Relationships: [];
      };
      objectives: {
        Row: { id: string; user_id: string; title: string; description: string | null; quarter: string | null; progress: number; status: string; created_at: string; };
        Insert: { id?: string; user_id: string; title: string; description?: string | null; quarter?: string | null; progress?: number; status?: string; created_at?: string; };
        Update: { id?: string; user_id?: string; title?: string; description?: string | null; quarter?: string | null; progress?: number; status?: string; created_at?: string; };
        Relationships: [];
      };
      memory_nodes: {
        Row: { id: string; user_id: string; label: string; kind: string; description: string | null; tags: string[] | null; metadata: Record<string, unknown> | null; created_at: string; };
        Insert: { id?: string; user_id: string; label: string; kind?: string; description?: string | null; tags?: string[] | null; metadata?: Record<string, unknown> | null; created_at?: string; };
        Update: { id?: string; user_id?: string; label?: string; kind?: string; description?: string | null; tags?: string[] | null; metadata?: Record<string, unknown> | null; created_at?: string; };
        Relationships: [];
      };
      memory_edges: {
        Row: { id: string; user_id: string; source_id: string; target_id: string; kind: string; label: string | null; weight: number; created_at: string; };
        Insert: { id?: string; user_id: string; source_id: string; target_id: string; kind?: string; label?: string | null; weight?: number; created_at?: string; };
        Update: { id?: string; user_id?: string; source_id?: string; target_id?: string; kind?: string; label?: string | null; weight?: number; created_at?: string; };
        Relationships: [];
      };
      agent_monitors: {
        Row: { id: string; user_id: string; name: string; description: string | null; agent_key: string; status: string; last_seen_at: string | null; success_count: number; error_count: number; avg_latency_ms: number | null; created_at: string; };
        Insert: { id?: string; user_id: string; name: string; description?: string | null; agent_key: string; status?: string; last_seen_at?: string | null; success_count?: number; error_count?: number; avg_latency_ms?: number | null; created_at?: string; };
        Update: { id?: string; user_id?: string; name?: string; description?: string | null; agent_key?: string; status?: string; last_seen_at?: string | null; success_count?: number; error_count?: number; avg_latency_ms?: number | null; created_at?: string; };
        Relationships: [];
      };
      monitor_alerts: {
        Row: { id: string; user_id: string; monitor_id: string | null; title: string; description: string | null; severity: string; status: string; acknowledged_at: string | null; resolved_at: string | null; created_at: string; };
        Insert: { id?: string; user_id: string; monitor_id?: string | null; title: string; description?: string | null; severity?: string; status?: string; acknowledged_at?: string | null; resolved_at?: string | null; created_at?: string; };
        Update: { id?: string; user_id?: string; monitor_id?: string | null; title?: string; description?: string | null; severity?: string; status?: string; acknowledged_at?: string | null; resolved_at?: string | null; created_at?: string; };
        Relationships: [];
      };
      runbooks: {
        Row: { id: string; user_id: string; title: string; description: string | null; trigger: string | null; steps: unknown; status: string; created_at: string; updated_at: string; };
        Insert: { id?: string; user_id: string; title: string; description?: string | null; trigger?: string | null; steps?: unknown; status?: string; created_at?: string; updated_at?: string; };
        Update: { id?: string; user_id?: string; title?: string; description?: string | null; trigger?: string | null; steps?: unknown; status?: string; created_at?: string; updated_at?: string; };
        Relationships: [];
      };
      prompts: {
        Row: { id: string; user_id: string; title: string; content: string; category: string; model_hint: string | null; temperature: number | null; max_tokens: number | null; tags: string[] | null; status: string; use_count: number; created_at: string; updated_at: string; };
        Insert: { id?: string; user_id: string; title: string; content: string; category?: string; model_hint?: string | null; temperature?: number | null; max_tokens?: number | null; tags?: string[] | null; status?: string; use_count?: number; created_at?: string; updated_at?: string; };
        Update: { id?: string; user_id?: string; title?: string; content?: string; category?: string; model_hint?: string | null; temperature?: number | null; max_tokens?: number | null; tags?: string[] | null; status?: string; use_count?: number; created_at?: string; updated_at?: string; };
        Relationships: [];
      };
      prompt_templates: {
        Row: { id: string; user_id: string; name: string; description: string | null; template: string; variables: unknown; category: string; created_at: string; };
        Insert: { id?: string; user_id: string; name: string; description?: string | null; template: string; variables?: unknown; category?: string; created_at?: string; };
        Update: { id?: string; user_id?: string; name?: string; description?: string | null; template?: string; variables?: unknown; category?: string; created_at?: string; };
        Relationships: [];
      };
      tool_definitions: {
        Row: { id: string; user_id: string; name: string; description: string; schema: unknown; endpoint: string | null; method: string | null; status: string; created_at: string; };
        Insert: { id?: string; user_id: string; name: string; description: string; schema?: unknown; endpoint?: string | null; method?: string | null; status?: string; created_at?: string; };
        Update: { id?: string; user_id?: string; name?: string; description?: string; schema?: unknown; endpoint?: string | null; method?: string | null; status?: string; created_at?: string; };
        Relationships: [];
      };
      actions: {
        Row: { id: string; user_id: string; name: string; description: string | null; category: string; endpoint: string | null; method: string; headers: Record<string,string> | null; body_template: string | null; status: string; run_count: number; last_run_at: string | null; created_at: string; updated_at: string; };
        Insert: { id?: string; user_id: string; name: string; description?: string | null; category?: string; endpoint?: string | null; method?: string; headers?: Record<string,string> | null; body_template?: string | null; status?: string; run_count?: number; last_run_at?: string | null; created_at?: string; updated_at?: string; };
        Update: { id?: string; user_id?: string; name?: string; description?: string | null; category?: string; endpoint?: string | null; method?: string; headers?: Record<string,string> | null; body_template?: string | null; status?: string; run_count?: number; last_run_at?: string | null; created_at?: string; updated_at?: string; };
        Relationships: [];
      };
      action_logs: {
        Row: { id: string; user_id: string; action_id: string; status: string; request_body: string | null; response_body: string | null; status_code: number | null; latency_ms: number | null; error: string | null; created_at: string; };
        Insert: { id?: string; user_id: string; action_id: string; status?: string; request_body?: string | null; response_body?: string | null; status_code?: number | null; latency_ms?: number | null; error?: string | null; created_at?: string; };
        Update: { id?: string; user_id?: string; action_id?: string; status?: string; request_body?: string | null; response_body?: string | null; status_code?: number | null; latency_ms?: number | null; error?: string | null; created_at?: string; };
        Relationships: [];
      };
      webhooks: {
        Row: { id: string; user_id: string; name: string; description: string | null; direction: string; url: string | null; secret: string | null; events: string[]; status: string; received_count: number; last_received_at: string | null; created_at: string; };
        Insert: { id?: string; user_id: string; name: string; description?: string | null; direction?: string; url?: string | null; secret?: string | null; events?: string[]; status?: string; received_count?: number; last_received_at?: string | null; created_at?: string; };
        Update: { id?: string; user_id?: string; name?: string; description?: string | null; direction?: string; url?: string | null; secret?: string | null; events?: string[]; status?: string; received_count?: number; last_received_at?: string | null; created_at?: string; };
        Relationships: [];
      };
      conversations: {
        Row: { id: string; user_id: string; title: string; model: string | null; system_prompt: string | null; status: string; message_count: number; last_message_at: string | null; created_at: string; };
        Insert: { id?: string; user_id: string; title?: string; model?: string | null; system_prompt?: string | null; status?: string; message_count?: number; last_message_at?: string | null; created_at?: string; };
        Update: { id?: string; user_id?: string; title?: string; model?: string | null; system_prompt?: string | null; status?: string; message_count?: number; last_message_at?: string | null; created_at?: string; };
        Relationships: [];
      };
      messages: {
        Row: { id: string; user_id: string; conversation_id: string; role: string; content: string; model: string | null; tokens_in: number | null; tokens_out: number | null; latency_ms: number | null; created_at: string; };
        Insert: { id?: string; user_id: string; conversation_id: string; role: string; content: string; model?: string | null; tokens_in?: number | null; tokens_out?: number | null; latency_ms?: number | null; created_at?: string; };
        Update: { id?: string; user_id?: string; conversation_id?: string; role?: string; content?: string; model?: string | null; tokens_in?: number | null; tokens_out?: number | null; latency_ms?: number | null; created_at?: string; };
        Relationships: [];
      };
      agent_sessions: {
        Row: { id: string; user_id: string; agent_id: string; conversation_id: string | null; title: string; status: string; context: unknown; messages: unknown; total_tokens: number; last_model: string | null; created_at: string; updated_at: string; };
        Insert: { id?: string; user_id: string; agent_id: string; conversation_id?: string | null; title?: string; status?: string; context?: unknown; messages?: unknown; total_tokens?: number; last_model?: string | null; created_at?: string; updated_at?: string; };
        Update: { id?: string; user_id?: string; agent_id?: string; conversation_id?: string | null; title?: string; status?: string; context?: unknown; messages?: unknown; total_tokens?: number; last_model?: string | null; created_at?: string; updated_at?: string; };
        Relationships: [];
      };
      ai_agent_runs: {
        Row: { id: string; user_id: string; session_id: string | null; agent_id: string; model_used: string | null; user_message: string; agent_response: string; tokens_used: number; latency_ms: number; created_at: string; };
        Insert: { id?: string; user_id: string; session_id?: string | null; agent_id: string; model_used?: string | null; user_message: string; agent_response: string; tokens_used?: number; latency_ms?: number; created_at?: string; };
        Update: { id?: string; user_id?: string; session_id?: string | null; agent_id?: string; model_used?: string | null; user_message?: string; agent_response?: string; tokens_used?: number; latency_ms?: number; created_at?: string; };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      has_role: {
        Args: { _user_id: string; _role: "admin" | "user" };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "user";
    };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Capability = Tables<"capabilities">;
export type Approval = Tables<"approvals">;
export type AuditEntry = Tables<"audit_log">;
export type ToolCall = Tables<"tool_calls">;
export type AgentRun = Tables<"agent_runs">;
