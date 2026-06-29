export type AlertSeverity = "critical" | "high" | "medium" | "info";
export type AlertStatus = "open" | "acknowledged" | "resolved";
export type RunbookStatus = "draft" | "active" | "deprecated";
export type MonitorStatus = "active" | "paused" | "degraded" | "down";

export interface AgentMonitor {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  agent_key: string;
  status: MonitorStatus;
  last_seen_at: string | null;
  success_count: number;
  error_count: number;
  avg_latency_ms: number | null;
  created_at: string;
}

export interface MonitorAlert {
  id: string;
  user_id: string;
  monitor_id: string | null;
  title: string;
  description: string | null;
  severity: AlertSeverity;
  status: AlertStatus;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface Runbook {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  trigger: string | null;
  steps: RunbookStep[];
  status: RunbookStatus;
  created_at: string;
  updated_at: string;
}

export interface RunbookStep {
  order: number;
  title: string;
  description: string;
  automated: boolean;
  command: string | null;
}

export interface OpsSnapshot {
  totalRuns: number;
  runningNow: number;
  errorsToday: number;
  successRate: number;
}
