import { useState, useRef, useEffect, useCallback } from "react";
import {
  useListMemories, useCreateMemory, useDeleteMemory,
  useListDecisions, useCreateDecision, useUpdateDecision, useDeleteDecision,
  useAnalyzeDecision,
  useGetMemoryGraph, useCreateMemoryEdge, useDeleteMemoryEdge,
  useGetSystemStats, useGetSystemAudit, useExportSystemData,
  getListMemoriesQueryKey, getListDecisionsQueryKey, getGetDecisionQueryKey,
  getGetMemoryGraphQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Brain, GitFork, Plus, Search, Trash2, Zap, ChevronDown, ChevronUp,
  List, Share2, Activity, BarChart2, Download, RefreshCw, Clock,
  CheckSquare, FolderOpen, Users, Layers, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type Tab = "memoire" | "decisions" | "systeme";

// ─── Constants ────────────────────────────────────────────────────────────────

const MEMORY_TYPES = [
  { value: "person",   label: "Personne",   color: "text-blue-400 bg-blue-500/10" },
  { value: "project",  label: "Projet",     color: "text-violet-400 bg-violet-500/10" },
  { value: "company",  label: "Entreprise", color: "text-emerald-400 bg-emerald-500/10" },
  { value: "decision", label: "Décision",   color: "text-amber-400 bg-amber-500/10" },
  { value: "note",     label: "Note",       color: "text-cyan-400 bg-cyan-500/10" },
  { value: "goal",     label: "Objectif",   color: "text-pink-400 bg-pink-500/10" },
  { value: "event",    label: "Événement",  color: "text-orange-400 bg-orange-500/10" },
];

const EDGE_COLORS: Record<string, string> = {
  related_to:   "#6b7280",
  supports:     "#10b981",
  contradicts:  "#ef4444",
  caused_by:    "#f59e0b",
  leads_to:     "#3b82f6",
  part_of:      "#8b5cf6",
};

const DECISION_STATUS: Record<string, { label: string; color: string }> = {
  pending:   { label: "En attente",  color: "text-muted-foreground bg-secondary" },
  analyzing: { label: "Analyse...",  color: "text-amber-400 bg-amber-500/10" },
  decided:   { label: "Décidé",      color: "text-emerald-400 bg-emerald-500/10" },
  archived:  { label: "Archivé",     color: "text-muted-foreground bg-secondary" },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}j`;
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function Systeme() {
  const [tab, setTab] = useState<Tab>("memoire");

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "memoire",   label: "Mémoire",    icon: Brain },
    { id: "decisions", label: "Décisions",  icon: GitFork },
    { id: "systeme",   label: "Système",    icon: Activity },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 pt-6 pb-4 shrink-0">
        <h1 className="text-xl font-semibold text-foreground tracking-tight mb-4">Système</h1>
        <div className="flex gap-1 bg-secondary rounded-xl p-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                tab === t.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === "memoire"   && <MemoireTab />}
      {tab === "decisions" && <DecisionsTab />}
      {tab === "systeme"   && <SystemeTab />}
    </div>
  );
}

// ─── Mémoire Tab ──────────────────────────────────────────────────────────────

function MemoireTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [view, setView] = useState<"list" | "graph">("list");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("note");
  const [content, setContent] = useState("");

  const { data: memories = [], isLoading } = useListMemories(
    search || typeFilter !== "all"
      ? { q: search || undefined, type: typeFilter !== "all" ? (typeFilter as any) : undefined }
      : {}
  );

  const create = useCreateMemory({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListMemoriesQueryKey() });
        qc.invalidateQueries({ queryKey: getGetMemoryGraphQueryKey() });
        setTitle(""); setContent(""); setShowForm(false);
        toast({ title: "Mémoire enregistrée" });
      },
    },
  });

  const del = useDeleteMemory({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListMemoriesQueryKey() });
        qc.invalidateQueries({ queryKey: getGetMemoryGraphQueryKey() });
        toast({ title: "Mémoire supprimée" });
      },
    },
  });

  const getTypeInfo = (t: string) =>
    MEMORY_TYPES.find(x => x.value === t) ?? { label: t, color: "text-muted-foreground bg-secondary" };

  return (
    <div className="flex-1 flex flex-col overflow-hidden px-4 pb-4">
      {/* Toolbar */}
      <div className="flex gap-2 mb-3 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full bg-secondary rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            placeholder="Rechercher..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {/* View toggle */}
        <div className="flex gap-1 bg-secondary rounded-lg p-1">
          <button
            onClick={() => setView("list")}
            className={cn("p-1.5 rounded-md transition-all", view === "list" ? "bg-background text-foreground" : "text-muted-foreground")}
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setView("graph")}
            className={cn("p-1.5 rounded-md transition-all", view === "graph" ? "bg-background text-foreground" : "text-muted-foreground")}
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Type filter chips — list view only */}
      {view === "list" && (
        <div className="flex gap-1.5 flex-wrap mb-3 shrink-0">
          <button
            onClick={() => setTypeFilter("all")}
            className={cn("px-2.5 py-1 rounded-full text-xs font-medium transition-all",
              typeFilter === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
          >
            Tous
          </button>
          {MEMORY_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setTypeFilter(t.value)}
              className={cn("px-2.5 py-1 rounded-full text-xs font-medium transition-all",
                typeFilter === t.value ? "bg-primary text-primary-foreground" : cn("bg-secondary", t.color, "hover:opacity-80")
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="mb-3 bg-secondary rounded-xl p-4 space-y-3 shrink-0">
          <input
            className="w-full bg-background rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            placeholder="Titre *"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
          <select
            className="w-full bg-background rounded-lg px-3 py-2 text-sm text-foreground outline-none"
            value={type}
            onChange={e => setType(e.target.value)}
          >
            {MEMORY_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <textarea
            className="w-full bg-background rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none"
            placeholder="Contenu..."
            rows={3}
            value={content}
            onChange={e => setContent(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (!title.trim()) return;
                create.mutate({ data: { title: title.trim(), type: type as any, content: content.trim() || undefined } });
              }}
              disabled={!title.trim() || create.isPending}
              className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              {create.isPending ? "Enregistrement..." : "Enregistrer"}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-background text-muted-foreground text-sm">
              Annuler
            </button>
          </div>
        </div>
      )}

      {view === "list" ? (
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-secondary rounded-xl animate-pulse" />)}
            </div>
          ) : memories.length === 0 ? (
            <EmptyState icon={Brain} title="Aucune mémoire" sub="Ajoutez des informations à retenir" />
          ) : (
            memories.map(m => {
              const typeInfo = getTypeInfo(m.type);
              return (
                <div key={m.id} className="bg-secondary rounded-xl p-3.5 flex items-start gap-3">
                  <div className={cn("mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide shrink-0", typeInfo.color)}>
                    {typeInfo.label}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{m.title}</div>
                    {m.content && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{m.content}</div>}
                  </div>
                  <button
                    onClick={() => del.mutate({ memoryId: m.id })}
                    className="shrink-0 p-1.5 rounded-lg hover:bg-background text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <MemoryGraphView />
      )}
    </div>
  );
}

// ─── Memory Graph SVG ─────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  title: string;
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
}

function MemoryGraphView() {
  const { data: graph, isLoading } = useGetMemoryGraph();
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [dims, setDims] = useState({ w: 320, h: 400 });
  const animRef = useRef<number | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);

  // Sync dims from container
  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: Math.max(width, 200), h: Math.max(height, 300) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build initial nodes/edges from API data
  useEffect(() => {
    if (!graph) return;
    const { w, h } = dims;
    const ns: GraphNode[] = (graph.nodes ?? []).map((n: any, i: number) => ({
      id: String(n.id),
      title: n.title ?? "?",
      type: n.type ?? "note",
      x: w / 2 + (Math.cos((i / (graph.nodes.length || 1)) * 2 * Math.PI) * w * 0.3),
      y: h / 2 + (Math.sin((i / (graph.nodes.length || 1)) * 2 * Math.PI) * h * 0.3),
      vx: 0,
      vy: 0,
    }));
    const es: GraphEdge[] = (graph.edges ?? []).map((e: any) => ({
      id: String(e.id),
      source: String(e.sourceId ?? e.source_id),
      target: String(e.targetId ?? e.target_id),
      type: e.type ?? "related_to",
    }));
    nodesRef.current = ns;
    setNodes([...ns]);
    setEdges(es);
  }, [graph, dims.w, dims.h]);

  // Simple force simulation tick
  const tick = useCallback(() => {
    const ns = nodesRef.current;
    if (!ns.length) return;
    const { w, h } = dims;
    const cx = w / 2;
    const cy = h / 2;
    const DAMPING = 0.85;
    const REPEL = 1200;
    const ATTRACT = 0.005;
    const CENTER = 0.02;

    for (let i = 0; i < ns.length; i++) {
      const a = ns[i];
      // Center gravity
      a.vx += (cx - a.x) * CENTER;
      a.vy += (cy - a.y) * CENTER;
      // Repulsion
      for (let j = i + 1; j < ns.length; j++) {
        const b = ns[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = REPEL / (dist * dist);
        a.vx += (dx / dist) * f;
        a.vy += (dy / dist) * f;
        b.vx -= (dx / dist) * f;
        b.vy -= (dy / dist) * f;
      }
    }
    // Edge attraction (spring)
    edges.forEach(e => {
      const src = ns.find(n => n.id === e.source);
      const tgt = ns.find(n => n.id === e.target);
      if (!src || !tgt) return;
      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      src.vx += dx * ATTRACT;
      src.vy += dy * ATTRACT;
      tgt.vx -= dx * ATTRACT;
      tgt.vy -= dy * ATTRACT;
    });

    for (const n of ns) {
      n.vx *= DAMPING;
      n.vy *= DAMPING;
      n.x = Math.max(28, Math.min(w - 28, n.x + n.vx));
      n.y = Math.max(28, Math.min(h - 28, n.y + n.vy));
    }
    nodesRef.current = [...ns];
    setNodes([...ns]);
    animRef.current = requestAnimationFrame(tick);
  }, [edges, dims]);

  useEffect(() => {
    if (!nodes.length) return;
    animRef.current = requestAnimationFrame(tick);
    // Stop after 3s (nodes settle)
    const stop = setTimeout(() => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    }, 3000);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      clearTimeout(stop);
    };
  }, [edges.length, tick]);

  const getTypeColor = (t: string) => {
    const map: Record<string, string> = {
      person: "#3b82f6", project: "#8b5cf6", company: "#10b981",
      decision: "#f59e0b", note: "#06b6d4", goal: "#ec4899", event: "#f97316",
    };
    return map[t] ?? "#6b7280";
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-muted-foreground animate-pulse">Chargement du graphe...</div>
      </div>
    );
  }

  if (!nodes.length) {
    return <EmptyState icon={Share2} title="Graphe vide" sub="Ajoutez des mémoires pour les voir ici" />;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <svg ref={svgRef} width="100%" height="100%" className="flex-1">
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#6b7280" opacity="0.5" />
          </marker>
        </defs>
        {/* Edges */}
        {edges.map(e => {
          const src = nodes.find(n => n.id === e.source);
          const tgt = nodes.find(n => n.id === e.target);
          if (!src || !tgt) return null;
          return (
            <line
              key={e.id}
              x1={src.x} y1={src.y}
              x2={tgt.x} y2={tgt.y}
              stroke={EDGE_COLORS[e.type] ?? "#6b7280"}
              strokeWidth={1.5}
              strokeOpacity={0.5}
              markerEnd="url(#arrow)"
            />
          );
        })}
        {/* Nodes */}
        {nodes.map(n => (
          <g key={n.id} onClick={() => setSelected(selected?.id === n.id ? null : n)} style={{ cursor: "pointer" }}>
            <circle
              cx={n.x} cy={n.y} r={selected?.id === n.id ? 14 : 10}
              fill={getTypeColor(n.type)}
              fillOpacity={0.85}
              stroke={selected?.id === n.id ? "#fff" : "transparent"}
              strokeWidth={2}
              style={{ transition: "r 0.15s, stroke 0.15s" }}
            />
            <text
              x={n.x} y={n.y + 22}
              textAnchor="middle"
              fontSize={9}
              fill="#9ca3af"
              className="pointer-events-none select-none"
            >
              {n.title.length > 14 ? n.title.slice(0, 13) + "…" : n.title}
            </text>
          </g>
        ))}
      </svg>
      {/* Node detail */}
      {selected && (
        <div className="absolute bottom-0 left-0 right-0 bg-secondary/95 backdrop-blur border-t border-border p-3 rounded-t-xl">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground truncate">{selected.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5 capitalize">{selected.type}</div>
            </div>
            <button onClick={() => setSelected(null)} className="text-muted-foreground text-xs shrink-0 px-2 py-1 rounded hover:bg-background">
              Fermer
            </button>
          </div>
        </div>
      )}
      {/* Legend */}
      <div className="absolute top-2 right-2 bg-background/80 backdrop-blur rounded-lg p-2 space-y-1">
        {Object.entries(EDGE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded" style={{ backgroundColor: color }} />
            <span className="text-[9px] text-muted-foreground">{type.replace("_", " ")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Décisions Tab ────────────────────────────────────────────────────────────

function DecisionsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: decisions = [], isLoading } = useListDecisions(
    statusFilter !== "all" ? { status: statusFilter as any } : {}
  );

  const create = useCreateDecision({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListDecisionsQueryKey() });
        setQuestion(""); setContext(""); setShowForm(false);
        toast({ title: "Décision créée" });
      },
    },
  });

  const del = useDeleteDecision({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListDecisionsQueryKey() });
        toast({ title: "Décision supprimée" });
      },
    },
  });

  const analyze = useAnalyzeDecision({
    mutation: {
      onSuccess: data => {
        qc.invalidateQueries({ queryKey: getListDecisionsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetDecisionQueryKey(data.id) });
        toast({ title: "Analyse terminée ✨" });
      },
    },
  });

  const update = useUpdateDecision({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListDecisionsQueryKey() });
        toast({ title: "Décision mise à jour" });
      },
    },
  });

  const statuses = ["all", "pending", "analyzing", "decided", "archived"];

  return (
    <div className="flex-1 flex flex-col overflow-hidden px-4 pb-4">
      {/* Filter + New */}
      <div className="flex gap-2 mb-3 shrink-0">
        <div className="flex gap-1 flex-1 overflow-x-auto scrollbar-hide">
          {statuses.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0",
                statusFilter === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              {s === "all" ? "Toutes" : DECISION_STATUS[s]?.label ?? s}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouvelle
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="mb-3 bg-secondary rounded-xl p-4 space-y-3 shrink-0">
          <textarea
            className="w-full bg-background rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none"
            placeholder="Question de décision *"
            rows={2}
            value={question}
            onChange={e => setQuestion(e.target.value)}
          />
          <textarea
            className="w-full bg-background rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none"
            placeholder="Contexte (optionnel)..."
            rows={2}
            value={context}
            onChange={e => setContext(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (!question.trim()) return;
                create.mutate({ data: { question: question.trim(), context: context.trim() || undefined } });
              }}
              disabled={!question.trim() || create.isPending}
              className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              {create.isPending ? "Création..." : "Créer"}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-background text-muted-foreground text-sm">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Decision list */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-secondary rounded-xl animate-pulse" />)}
          </div>
        ) : decisions.length === 0 ? (
          <EmptyState icon={GitFork} title="Aucune décision" sub="Créez des décisions à analyser par l'IA" />
        ) : (
          decisions.map(d => {
            const status = DECISION_STATUS[d.status] ?? { label: d.status, color: "text-muted-foreground bg-secondary" };
            const isExp = expanded === d.id;
            return (
              <div key={d.id} className="bg-secondary rounded-xl overflow-hidden">
                <div
                  className="p-3.5 flex items-start gap-3 cursor-pointer"
                  onClick={() => setExpanded(isExp ? null : d.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide", status.color)}>
                        {status.label}
                      </span>
                      {typeof (d as any).confidenceScore === "number" && (
                        <span className="text-[10px] text-muted-foreground">
                          {(d as any).confidenceScore}/100
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-medium text-foreground line-clamp-2">{d.question}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {d.status === "pending" && (
                      <button
                        onClick={e => { e.stopPropagation(); analyze.mutate({ decisionId: d.id }); }}
                        disabled={analyze.isPending}
                        className="p-1.5 rounded-lg hover:bg-background text-amber-400 hover:text-amber-300 transition-colors"
                        title="Analyser avec l'IA"
                      >
                        <Zap className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {d.status === "decided" && (
                      <button
                        onClick={e => { e.stopPropagation(); update.mutate({ decisionId: d.id, data: { status: "archived" } }); }}
                        className="p-1.5 rounded-lg hover:bg-background text-muted-foreground hover:text-foreground transition-colors text-xs"
                      >
                        Archiver
                      </button>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); del.mutate({ decisionId: d.id }); }}
                      className="p-1.5 rounded-lg hover:bg-background text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {isExp ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>

                {isExp && (
                  <div className="px-3.5 pb-3.5 border-t border-border pt-3 space-y-2.5">
                    {d.context && (
                      <div>
                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Contexte</div>
                        <div className="text-xs text-foreground/80">{d.context}</div>
                      </div>
                    )}
                    {(d as any).analysis && (
                      <div>
                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Analyse IA</div>
                        <div className="text-xs text-foreground/80 whitespace-pre-wrap">{(d as any).analysis}</div>
                      </div>
                    )}
                    {(d as any).recommendation && (
                      <div>
                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Recommandation</div>
                        <div className="text-xs text-foreground font-medium">{(d as any).recommendation}</div>
                      </div>
                    )}
                    {(d as any).pros?.length > 0 && (
                      <div>
                        <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wide mb-1">Pour</div>
                        <ul className="space-y-0.5">
                          {((d as any).pros as string[]).map((p, i) => (
                            <li key={i} className="text-xs text-foreground/80 flex items-start gap-1.5">
                              <span className="text-emerald-400 shrink-0 mt-0.5">+</span>{p}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {(d as any).cons?.length > 0 && (
                      <div>
                        <div className="text-[11px] font-semibold text-red-400 uppercase tracking-wide mb-1">Contre</div>
                        <ul className="space-y-0.5">
                          {((d as any).cons as string[]).map((c, i) => (
                            <li key={i} className="text-xs text-foreground/80 flex items-start gap-1.5">
                              <span className="text-red-400 shrink-0 mt-0.5">−</span>{c}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {d.status === "pending" && (
                      <button
                        onClick={() => analyze.mutate({ decisionId: d.id })}
                        disabled={analyze.isPending}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-amber-500/10 text-amber-400 text-sm font-medium hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                      >
                        <Zap className="w-4 h-4" />
                        {analyze.isPending ? "Analyse en cours..." : "Analyser avec l'IA"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Système Tab ──────────────────────────────────────────────────────────────

const ACTIVITY_COLORS: Record<string, string> = {
  task: "bg-blue-500/10 text-blue-400",
  project: "bg-violet-500/10 text-violet-400",
  contact: "bg-emerald-500/10 text-emerald-400",
  memory: "bg-amber-500/10 text-amber-400",
  decision: "bg-rose-500/10 text-rose-400",
  conversation: "bg-cyan-500/10 text-cyan-400",
  asset: "bg-orange-500/10 text-orange-400",
};

function SystemeTab() {
  const { toast } = useToast();
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useGetSystemStats();
  const { data: audit, isLoading: auditLoading, refetch: refetchAudit } = useGetSystemAudit({ limit: 20 });
  const exportData = useExportSystemData({
    query: { enabled: false },
  });

  const handleExport = async () => {
    try {
      const result = await exportData.refetch();
      if (result.data) {
        const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `tams-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: "Export téléchargé" });
      }
    } catch {
      toast({ title: "Erreur export", description: "Impossible d'exporter les données" });
    }
  };

  const statCards = stats ? [
    { label: "Tâches", value: (stats as any).taskCount ?? 0,       icon: CheckSquare, color: "text-blue-400" },
    { label: "Projets", value: (stats as any).projectCount ?? 0,   icon: FolderOpen,  color: "text-violet-400" },
    { label: "Contacts", value: (stats as any).contactCount ?? 0,  icon: Users,       color: "text-emerald-400" },
    { label: "Mémoires", value: (stats as any).memoryCount ?? 0,   icon: Brain,       color: "text-amber-400" },
    { label: "Décisions", value: (stats as any).decisionCount ?? 0, icon: GitFork,    color: "text-rose-400" },
    { label: "Assets", value: (stats as any).assetCount ?? 0,      icon: Layers,      color: "text-cyan-400" },
  ] : [];

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
      {/* Actions header */}
      <div className="flex items-center justify-between shrink-0">
        <span className="text-xs font-medium text-muted-foreground">Observabilité</span>
        <div className="flex gap-2">
          <button
            onClick={() => { refetchStats(); refetchAudit(); }}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="Actualiser"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleExport}
            disabled={exportData.isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            {exportData.isFetching ? "Export..." : "Exporter"}
          </button>
        </div>
      </div>

      {/* Stats grid */}
      {statsLoading ? (
        <div className="grid grid-cols-3 gap-2">
          {[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-secondary rounded-xl animate-pulse" />)}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-3 gap-2">
          {statCards.map(s => (
            <div key={s.label} className="bg-secondary rounded-xl p-3 flex flex-col items-center gap-1">
              <s.icon className={cn("w-4 h-4", s.color)} />
              <div className="text-lg font-bold text-foreground">{s.value}</div>
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-secondary rounded-xl p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Impossible de charger les statistiques
        </div>
      )}

      {/* AI status */}
      <div className="bg-secondary rounded-xl p-3.5">
        <div className="text-xs font-semibold text-foreground mb-2">Statut IA</div>
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full", (stats as any)?.aiStatus === "available" ? "bg-emerald-500" : "bg-amber-500")} />
          <span className="text-xs text-muted-foreground">
            {(stats as any)?.aiStatus === "available" ? "IA disponible — gemini-2.5-flash" : "Mode fallback (règles)"}
          </span>
        </div>
      </div>

      {/* Audit log */}
      <div className="bg-secondary rounded-xl p-3.5">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">Journal d'activité</span>
          {auditLoading && <RefreshCw className="w-3 h-3 text-muted-foreground animate-spin ml-auto" />}
        </div>
        {auditLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-background rounded-lg animate-pulse" />)}
          </div>
        ) : !audit || (audit as any[]).length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4">Aucune activité récente</div>
        ) : (
          <div className="space-y-2">
            {(audit as any[]).map((item: any) => (
              <div key={item.id} className="flex items-center gap-2.5">
                <div className={cn(
                  "w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0",
                  ACTIVITY_COLORS[item.type] ?? "bg-secondary text-muted-foreground"
                )}>
                  {(item.type?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">{item.title ?? item.action}</div>
                  {item.description && (
                    <div className="text-[10px] text-muted-foreground truncate">{item.description}</div>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground shrink-0">
                  {timeAgo(item.createdAt ?? item.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function EmptyState({
  icon: Icon,
  title,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-12">
      <Icon className="w-10 h-10 text-muted-foreground/30 mb-3" />
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-xs text-muted-foreground/60 mt-1">{sub}</p>
    </div>
  );
}
