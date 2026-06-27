export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: "active" | "paused" | "done" | "archived";
  priority: "critical" | "high" | "medium" | "low";
  risk_level: "high" | "medium" | "low" | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Person {
  id: string;
  user_id: string;
  name: string;
  role: string | null;
  email: string | null;
  context: string | null;
  created_at: string;
}

export interface CosTask {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: "todo" | "doing" | "done" | "blocked";
  priority: "critical" | "high" | "medium" | "low";
  due_date: string | null;
  assignee_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Decision {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  context: string | null;
  options: string[] | null;
  chosen: string | null;
  reasoning: string | null;
  status: "open" | "decided" | "reversed";
  decided_at: string | null;
  created_at: string;
}

export interface Risk {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  severity: "critical" | "high" | "medium" | "low";
  probability: "high" | "medium" | "low";
  mitigation: string | null;
  status: "open" | "mitigated" | "accepted" | "closed";
  created_at: string;
}

export interface Objective {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  quarter: string | null;
  progress: number;
  status: "on_track" | "at_risk" | "behind" | "done";
  created_at: string;
}

export type RiskSeverity = Risk["severity"];
export type ProjectStatus = Project["status"];
export type TaskStatus = CosTask["status"];
export type Priority = CosTask["priority"];
