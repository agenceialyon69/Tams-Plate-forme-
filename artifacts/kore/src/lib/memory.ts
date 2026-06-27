import { supabase } from "./supabase";
import type { MemoryNode, MemoryEdge, NodeKind, EdgeKind, GraphData } from "./memory-types";

export type { MemoryNode, MemoryEdge, NodeKind, EdgeKind, GraphData };

export async function listNodes(filter?: { kind?: NodeKind; search?: string }): Promise<MemoryNode[]> {
  let q = supabase.from("memory_nodes").select("*");
  if (filter?.kind) q = q.eq("kind", filter.kind);
  if (filter?.search) q = q.ilike("label", `%${filter.search}%`);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MemoryNode[];
}

export async function createNode(
  input: Pick<MemoryNode, "label" | "kind" | "description" | "tags">,
): Promise<MemoryNode> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("memory_nodes")
    .insert({ ...input, user_id: user.id, metadata: {} })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as MemoryNode;
}

export async function updateNode(id: string, patch: Partial<MemoryNode>): Promise<void> {
  const { error } = await supabase.from("memory_nodes").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteNode(id: string): Promise<void> {
  const { error } = await supabase.from("memory_nodes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listEdges(): Promise<MemoryEdge[]> {
  const { data, error } = await supabase
    .from("memory_edges")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MemoryEdge[];
}

export async function createEdge(
  input: Pick<MemoryEdge, "source_id" | "target_id" | "kind" | "label" | "weight">,
): Promise<MemoryEdge> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("memory_edges")
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as MemoryEdge;
}

export async function deleteEdge(id: string): Promise<void> {
  const { error } = await supabase.from("memory_edges").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function loadGraph(): Promise<GraphData> {
  const [nodes, edges] = await Promise.all([listNodes(), listEdges()]);
  return { nodes, edges };
}
