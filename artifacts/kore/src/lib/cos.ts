import { supabase } from "./supabase";
import type { Project, CosTask, Decision, Risk, Objective, Person } from "./cos-types";

export type { Project, CosTask, Decision, Risk, Objective, Person };

// ─── Projects ────────────────────────────────────────────────────────────────

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Project[];
}

export async function createProject(
  input: Pick<Project, "name" | "description" | "status" | "priority" | "due_date">,
): Promise<Project> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("projects")
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Project;
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<void> {
  const { error } = await supabase.from("projects").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export async function listTasks(filters?: {
  projectId?: string;
  status?: CosTask["status"];
}): Promise<CosTask[]> {
  let q = supabase.from("cos_tasks").select("*");
  if (filters?.projectId) q = q.eq("project_id", filters.projectId);
  if (filters?.status) q = q.eq("status", filters.status);
  const { data, error } = await q
    .order("priority", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CosTask[];
}

export async function createTask(
  input: Pick<CosTask, "title" | "description" | "priority" | "status" | "due_date" | "project_id">,
): Promise<CosTask> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("cos_tasks")
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CosTask;
}

export async function updateTask(id: string, patch: Partial<CosTask>): Promise<void> {
  const { error } = await supabase.from("cos_tasks").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from("cos_tasks").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Decisions ───────────────────────────────────────────────────────────────

export async function listDecisions(): Promise<Decision[]> {
  const { data, error } = await supabase
    .from("decisions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Decision[];
}

export async function createDecision(
  input: Pick<Decision, "title" | "context" | "project_id">,
): Promise<Decision> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("decisions")
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Decision;
}

export async function updateDecision(id: string, patch: Partial<Decision>): Promise<void> {
  const { error } = await supabase.from("decisions").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Risks ───────────────────────────────────────────────────────────────────

export async function listRisks(): Promise<Risk[]> {
  const { data, error } = await supabase
    .from("risks")
    .select("*")
    .neq("status", "closed")
    .order("severity", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Risk[];
}

export async function createRisk(
  input: Pick<Risk, "title" | "description" | "severity" | "probability" | "project_id">,
): Promise<Risk> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("risks")
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Risk;
}

export async function updateRisk(id: string, patch: Partial<Risk>): Promise<void> {
  const { error } = await supabase.from("risks").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Objectives ──────────────────────────────────────────────────────────────

export async function listObjectives(): Promise<Objective[]> {
  const { data, error } = await supabase
    .from("objectives")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Objective[];
}

export async function createObjective(
  input: Pick<Objective, "title" | "description" | "quarter">,
): Promise<Objective> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("objectives")
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Objective;
}

export async function updateObjective(id: string, patch: Partial<Objective>): Promise<void> {
  const { error } = await supabase.from("objectives").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── People ──────────────────────────────────────────────────────────────────

export async function listPeople(): Promise<Person[]> {
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Person[];
}
