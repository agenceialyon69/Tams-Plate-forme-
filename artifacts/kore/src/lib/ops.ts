import { supabase } from "./supabase";
import type {
  AgentMonitor, MonitorAlert, Runbook, OpsSnapshot,
  AlertSeverity, AlertStatus, MonitorStatus, RunbookStep,
} from "./ops-types";

export type { AgentMonitor, MonitorAlert, Runbook, OpsSnapshot, AlertSeverity, AlertStatus, MonitorStatus, RunbookStep };

// ─── Snapshot (from agent_runs) ───────────────────────────────────────────────

export async function getOpsSnapshot(): Promise<OpsSnapshot> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  const [{ count: total }, { count: running }, { count: errorsToday }, { count: successToday }] =
    await Promise.all([
      supabase.from("agent_runs").select("*", { count: "exact", head: true }),
      supabase.from("agent_runs").select("*", { count: "exact", head: true }).eq("status", "running"),
      supabase.from("agent_runs").select("*", { count: "exact", head: true })
        .eq("status", "error").gte("started_at", todayIso),
      supabase.from("agent_runs").select("*", { count: "exact", head: true })
        .eq("status", "done").gte("started_at", todayIso),
    ]);

  const todayTotal = (errorsToday ?? 0) + (successToday ?? 0);
  const successRate = todayTotal > 0 ? ((successToday ?? 0) / todayTotal) * 100 : 100;

  return {
    totalRuns: total ?? 0,
    runningNow: running ?? 0,
    errorsToday: errorsToday ?? 0,
    successRate,
  };
}

// ─── Agent Monitors ───────────────────────────────────────────────────────────

export async function listMonitors(): Promise<AgentMonitor[]> {
  const { data, error } = await supabase
    .from("agent_monitors")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AgentMonitor[];
}

export async function createMonitor(
  input: Pick<AgentMonitor, "name" | "description" | "agent_key">,
): Promise<AgentMonitor> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("agent_monitors")
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as AgentMonitor;
}

export async function updateMonitor(id: string, patch: Partial<AgentMonitor>): Promise<void> {
  const { error } = await supabase.from("agent_monitors").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export async function listAlerts(status?: AlertStatus): Promise<MonitorAlert[]> {
  let q = supabase.from("monitor_alerts").select("*");
  if (status) q = q.eq("status", status);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as MonitorAlert[];
}

export async function createAlert(
  input: Pick<MonitorAlert, "title" | "description" | "severity" | "monitor_id">,
): Promise<MonitorAlert> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("monitor_alerts")
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as MonitorAlert;
}

export async function acknowledgeAlert(id: string): Promise<void> {
  const { error } = await supabase
    .from("monitor_alerts")
    .update({ status: "acknowledged", acknowledged_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function resolveAlert(id: string): Promise<void> {
  const { error } = await supabase
    .from("monitor_alerts")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Runbooks ─────────────────────────────────────────────────────────────────

export async function listRunbooks(): Promise<Runbook[]> {
  const { data, error } = await supabase
    .from("runbooks")
    .select("*")
    .neq("status", "deprecated")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Runbook[];
}

export async function createRunbook(
  input: Pick<Runbook, "title" | "description" | "trigger">,
): Promise<Runbook> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("runbooks")
    .insert({ ...input, user_id: user.id, steps: [] })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as Runbook;
}

export async function updateRunbook(id: string, patch: Partial<Runbook>): Promise<void> {
  const { error } = await supabase.from("runbooks").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Recent runs (from agent_runs) ───────────────────────────────────────────

export async function listRecentRuns(limit = 20) {
  const { data, error } = await supabase
    .from("agent_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}
