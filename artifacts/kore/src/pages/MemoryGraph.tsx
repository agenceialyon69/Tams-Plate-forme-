import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import AuthedLayout from "@/components/layout/AuthedLayout";
import {
  loadGraph, createNode, createEdge, deleteNode, deleteEdge,
  type MemoryNode, type MemoryEdge, type NodeKind, type EdgeKind,
} from "@/lib/memory";
import {
  Network, Plus, Search, Trash2, X, ArrowRight, Tag,
} from "lucide-react";

const KIND_COLOR: Record<NodeKind, string> = {
  person:    "#818cf8",
  company:   "#34d399",
  project:   "#60a5fa",
  concept:   "#f472b6",
  resource:  "#fbbf24",
  event:     "#a78bfa",
  decision:  "#fb923c",
  insight:   "#22d3ee",
};

const KIND_LABEL: Record<NodeKind, string> = {
  person:   "Personne",
  company:  "Entreprise",
  project:  "Projet",
  concept:  "Concept",
  resource: "Ressource",
  event:    "Événement",
  decision: "Décision",
  insight:  "Insight",
};

const EDGE_KINDS: EdgeKind[] = [
  "knows","works_at","owns","relates_to","blocks","enables","references","led_to",
];

const NODE_KINDS: NodeKind[] = [
  "person","company","project","concept","resource","event","decision","insight",
];

function NodeBadge({ kind }: { kind: NodeKind }) {
  const color = KIND_COLOR[kind] ?? "#888";
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ background: color + "22", color }}
    >
      {KIND_LABEL[kind] ?? kind}
    </span>
  );
}

function GraphCanvas({
  nodes, edges, selectedId, onSelect,
}: {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const W = 640, H = 400;
  const positions = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {};
    const n = nodes.length;
    if (n === 0) return map;
    nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / n;
      const r = Math.min(W, H) * 0.35;
      map[node.id] = {
        x: W / 2 + r * Math.cos(angle),
        y: H / 2 + r * Math.sin(angle),
      };
    });
    return map;
  }, [nodes]);

  if (nodes.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border/50 text-sm text-muted-foreground/60">
        Aucun nœud — ajoutez-en un pour visualiser le graphe.
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full rounded-xl border border-border/40 bg-card/20"
      style={{ height: "min(400px, 50vw)" }}
    >
      <defs>
        <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
          <polygon points="0 0, 6 2, 0 4" fill="#555" />
        </marker>
      </defs>

      {edges.map((e) => {
        const src = positions[e.source_id];
        const tgt = positions[e.target_id];
        if (!src || !tgt) return null;
        return (
          <g key={e.id}>
            <line
              x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
              stroke="#334155" strokeWidth={1.5}
              markerEnd="url(#arrowhead)"
            />
            {e.label && (
              <text
                x={(src.x + tgt.x) / 2}
                y={(src.y + tgt.y) / 2 - 4}
                fontSize="9"
                fill="#64748b"
                textAnchor="middle"
              >
                {e.label || e.kind}
              </text>
            )}
          </g>
        );
      })}

      {nodes.map((node) => {
        const pos = positions[node.id];
        if (!pos) return null;
        const color = KIND_COLOR[node.kind] ?? "#888";
        const isSelected = selectedId === node.id;
        return (
          <g
            key={node.id}
            onClick={() => onSelect(isSelected ? null : node.id)}
            style={{ cursor: "pointer" }}
          >
            <circle
              cx={pos.x} cy={pos.y} r={isSelected ? 22 : 18}
              fill={color + "33"}
              stroke={color}
              strokeWidth={isSelected ? 2 : 1}
            />
            <text
              x={pos.x} y={pos.y + 1}
              textAnchor="middle" dominantBaseline="middle"
              fontSize="10" fontWeight={isSelected ? "600" : "400"}
              fill={color}
            >
              {node.label.slice(0, 8)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function AddNodeForm({ onClose, onCreated }: { onClose: () => void; onCreated: (n: MemoryNode) => void }) {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<NodeKind>("concept");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    try {
      const node = await createNode({
        label: label.trim(),
        kind,
        description: description.trim() || null,
        tags: tags.split(",").map(t => t.trim()).filter(Boolean) || null,
      });
      onCreated(node);
      toast.success("Nœud créé");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-border/60 bg-card/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Nouveau nœud</span>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          required value={label} onChange={e => setLabel(e.target.value)}
          placeholder="Label *"
          className="rounded-md border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <select
          value={kind} onChange={e => setKind(e.target.value as NodeKind)}
          className="rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none"
        >
          {NODE_KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <input
          value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Description"
          className="rounded-md border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring sm:col-span-2"
        />
        <input
          value={tags} onChange={e => setTags(e.target.value)}
          placeholder="Tags (séparés par virgule)"
          className="rounded-md border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring sm:col-span-2"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Annuler</button>
        <button type="submit" disabled={busy} className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
          {busy ? "…" : "Créer"}
        </button>
      </div>
    </form>
  );
}

function AddEdgeForm({
  nodes, onClose, onCreated,
}: {
  nodes: MemoryNode[];
  onClose: () => void;
  onCreated: (e: MemoryEdge) => void;
}) {
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [kind, setKind] = useState<EdgeKind>("relates_to");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!sourceId || !targetId) return;
    setBusy(true);
    try {
      const edge = await createEdge({ source_id: sourceId, target_id: targetId, kind, label: label || null, weight: 1 });
      onCreated(edge);
      toast.success("Lien créé");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-border/60 bg-card/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Nouveau lien</span>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <select value={sourceId} onChange={e => setSourceId(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none"
        >
          <option value="">Source *</option>
          {nodes.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
        </select>
        <select value={kind} onChange={e => setKind(e.target.value as EdgeKind)}
          className="rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none"
        >
          {EDGE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={targetId} onChange={e => setTargetId(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none"
        >
          <option value="">Cible *</option>
          {nodes.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
        </select>
        <input
          value={label} onChange={e => setLabel(e.target.value)}
          placeholder="Label optionnel"
          className="rounded-md border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring sm:col-span-3"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Annuler</button>
        <button type="submit" disabled={busy || !sourceId || !targetId} className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
          {busy ? "…" : "Créer"}
        </button>
      </div>
    </form>
  );
}

export default function MemoryGraph() {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: ["graph"] });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<NodeKind | "">("");
  const [showAddNode, setShowAddNode] = useState(false);
  const [showAddEdge, setShowAddEdge] = useState(false);
  const [view, setView] = useState<"graph" | "list">("graph");

  const graph = useQuery({ queryKey: ["graph"], queryFn: loadGraph });

  const deleteNodeMut = useMutation({
    mutationFn: deleteNode,
    onSuccess: () => { inv(); setSelectedId(null); toast.success("Nœud supprimé"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });
  const deleteEdgeMut = useMutation({
    mutationFn: deleteEdge,
    onSuccess: () => { inv(); toast.success("Lien supprimé"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const allNodes = graph.data?.nodes ?? [];
  const allEdges = graph.data?.edges ?? [];

  const filteredNodes = useMemo(() => {
    let nodes = allNodes;
    if (kindFilter) nodes = nodes.filter(n => n.kind === kindFilter);
    if (search.trim()) nodes = nodes.filter(n => n.label.toLowerCase().includes(search.toLowerCase()) || (n.description ?? "").toLowerCase().includes(search.toLowerCase()));
    return nodes;
  }, [allNodes, kindFilter, search]);

  const selectedNode = selectedId ? allNodes.find(n => n.id === selectedId) : null;
  const connectedEdges = selectedId
    ? allEdges.filter(e => e.source_id === selectedId || e.target_id === selectedId)
    : [];

  const nodeById = useMemo(() => Object.fromEntries(allNodes.map(n => [n.id, n])), [allNodes]);

  const handleCreatedNode = useCallback((n: MemoryNode) => {
    inv();
    setShowAddNode(false);
    setSelectedId(n.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreatedEdge = useCallback((_e: MemoryEdge) => {
    inv();
    setShowAddEdge(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthedLayout>
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Network className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold tracking-tight">Memory Graph</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Graphe de connaissances — personnes, projets, concepts, relations.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <span className="rounded-lg border border-border/60 bg-card/30 px-3 py-2 text-center">
              <div className="text-lg font-semibold tabular-nums">{allNodes.length}</div>
              <div className="text-[11px] text-muted-foreground">Nœuds</div>
            </span>
            <span className="rounded-lg border border-border/60 bg-card/30 px-3 py-2 text-center">
              <div className="text-lg font-semibold tabular-nums">{allEdges.length}</div>
              <div className="text-[11px] text-muted-foreground">Liens</div>
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-40">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="w-full rounded-md border border-input bg-background py-2 pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <select
            value={kindFilter}
            onChange={e => setKindFilter(e.target.value as NodeKind | "")}
            className="rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none"
          >
            <option value="">Tous les types</option>
            {NODE_KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <div className="flex rounded-md border border-border/50 bg-muted/20 p-0.5">
            <button onClick={() => setView("graph")} className={`px-3 py-1 text-xs rounded ${view === "graph" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
              Graphe
            </button>
            <button onClick={() => setView("list")} className={`px-3 py-1 text-xs rounded ${view === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
              Liste
            </button>
          </div>
          <button
            onClick={() => { setShowAddNode(v => !v); setShowAddEdge(false); }}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Nœud
          </button>
          <button
            onClick={() => { setShowAddEdge(v => !v); setShowAddNode(false); }}
            disabled={allNodes.length < 2}
            className="flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            Lien
          </button>
        </div>

        {/* Forms */}
        {showAddNode && (
          <AddNodeForm onClose={() => setShowAddNode(false)} onCreated={handleCreatedNode} />
        )}
        {showAddEdge && (
          <AddEdgeForm nodes={allNodes} onClose={() => setShowAddEdge(false)} onCreated={handleCreatedEdge} />
        )}

        {/* Main content */}
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div>
            {view === "graph" ? (
              <GraphCanvas
                nodes={filteredNodes}
                edges={allEdges}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            ) : (
              <div className="space-y-1.5">
                {filteredNodes.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground/60">
                    Aucun nœud trouvé.
                  </div>
                )}
                {filteredNodes.map(node => (
                  <button
                    key={node.id}
                    onClick={() => setSelectedId(selectedId === node.id ? null : node.id)}
                    className={[
                      "w-full rounded-xl border p-3 text-left transition-colors",
                      selectedId === node.id
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/50 bg-card/20 hover:border-border hover:bg-card/40",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-2">
                      <NodeBadge kind={node.kind} />
                      <span className="text-sm font-medium">{node.label}</span>
                    </div>
                    {node.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground truncate">{node.description}</p>
                    )}
                    {(node.tags ?? []).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(node.tags ?? []).map(t => (
                          <span key={t} className="flex items-center gap-0.5 rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            <Tag className="h-2.5 w-2.5" />{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Detail panel */}
          <div>
            {selectedNode ? (
              <div className="rounded-xl border border-border/60 bg-card/30 p-4 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <NodeBadge kind={selectedNode.kind} />
                    <h3 className="mt-1.5 text-base font-semibold">{selectedNode.label}</h3>
                    {selectedNode.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{selectedNode.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => deleteNodeMut.mutate(selectedNode.id)}
                    disabled={deleteNodeMut.isPending}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {(selectedNode.tags ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(selectedNode.tags ?? []).map(t => (
                      <span key={t} className="flex items-center gap-0.5 rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        <Tag className="h-2.5 w-2.5" />{t}
                      </span>
                    ))}
                  </div>
                )}

                <div>
                  <p className="mb-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                    Connexions ({connectedEdges.length})
                  </p>
                  {connectedEdges.length === 0 && (
                    <p className="text-xs text-muted-foreground/60">Aucune connexion.</p>
                  )}
                  <ul className="space-y-1">
                    {connectedEdges.map(edge => {
                      const isSource = edge.source_id === selectedId;
                      const otherId = isSource ? edge.target_id : edge.source_id;
                      const other = nodeById[otherId];
                      return (
                        <li key={edge.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/20 px-2.5 py-2 text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {!isSource && <ArrowRight className="h-3 w-3 shrink-0 rotate-180 text-muted-foreground" />}
                            <span className="font-mono text-[10px] text-muted-foreground">{edge.kind}</span>
                            {isSource && <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                            <button
                              onClick={() => setSelectedId(otherId)}
                              className="truncate font-medium hover:underline"
                            >
                              {other?.label ?? otherId.slice(0, 8)}
                            </button>
                          </div>
                          <button
                            onClick={() => deleteEdgeMut.mutate(edge.id)}
                            className="shrink-0 text-muted-foreground/40 hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <p className="text-[10px] text-muted-foreground/40 font-mono">
                  {new Date(selectedNode.created_at).toLocaleDateString("fr-FR")}
                </p>
              </div>
            ) : (
              <div className="flex h-full min-h-32 items-center justify-center rounded-xl border border-dashed border-border/40 text-sm text-muted-foreground/50">
                Sélectionnez un nœud
              </div>
            )}
          </div>
        </div>
      </div>
    </AuthedLayout>
  );
}
