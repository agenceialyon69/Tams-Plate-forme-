export type NodeKind =
  | "person"
  | "company"
  | "project"
  | "concept"
  | "resource"
  | "event"
  | "decision"
  | "insight";

export type EdgeKind =
  | "knows"
  | "works_at"
  | "owns"
  | "relates_to"
  | "blocks"
  | "enables"
  | "references"
  | "led_to";

export interface MemoryNode {
  id: string;
  user_id: string;
  label: string;
  kind: NodeKind;
  description: string | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface MemoryEdge {
  id: string;
  user_id: string;
  source_id: string;
  target_id: string;
  kind: EdgeKind;
  label: string | null;
  weight: number;
  created_at: string;
}

export interface GraphData {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
}
