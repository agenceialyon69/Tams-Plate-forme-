export type PromptCategory =
  | "system"
  | "user"
  | "assistant"
  | "chain"
  | "red_team"
  | "evaluation"
  | "other";

export type PromptStatus = "draft" | "active" | "archived";

export interface Prompt {
  id: string;
  user_id: string;
  title: string;
  content: string;
  category: PromptCategory;
  model_hint: string | null;
  temperature: number | null;
  max_tokens: number | null;
  tags: string[] | null;
  status: PromptStatus;
  use_count: number;
  created_at: string;
  updated_at: string;
}

export interface PromptTemplate {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  template: string;
  variables: TemplateVariable[];
  category: PromptCategory;
  created_at: string;
}

export interface TemplateVariable {
  key: string;
  label: string;
  type: "text" | "number" | "select";
  options?: string[];
  default_value?: string;
}

export interface ToolDefinition {
  id: string;
  user_id: string;
  name: string;
  description: string;
  schema: Record<string, unknown>;
  endpoint: string | null;
  method: string | null;
  status: "active" | "draft" | "disabled";
  created_at: string;
}
