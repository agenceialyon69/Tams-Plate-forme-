import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  useListMemories, useCreateMemory, useDeleteMemory,
  useListDecisions, useCreateDecision, useUpdateDecision, useDeleteDecision,
  useAnalyzeDecision, useCreateTasksFromDecision,
  useGetMemoryGraph, useCreateMemoryEdge, useDeleteMemoryEdge,
  useGetSystemStats, useGetSystemAudit, useExportSystemData,
  getListMemoriesQueryKey, getListDecisionsQueryKey, getGetDecisionQueryKey,
  getGetMemoryGraphQueryKey, getListTasksQueryKey,
  type Memory, type MemoryEdgeType, type SystemStats,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";

// ─── Custom hooks for new semantic search / auto-link / centered graph ───────

interface SemanticSearchResult {
  data: Array<{
    id: number;
    title: string;
    type: string;
    content?: string | null;
    tags?: string[];
    semanticScore: number;
    createdAt?: string;
    updatedAt?: string;
  }>;
}

function useSemanticSearch() {
  return useMutation<SemanticSearchResult, Error, { q: string; limit?: number; type?: string }>({
    mutationFn: async (body) => {
      const res = await fetch("/api/memories/semantic-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<SemanticSearchResult>;
    },
  });
}

interface AutoLinkResult {
  created: number;
  links: Array<{ sourceId: number; targetId: number; type: string; strength: number }>;
}

function useAutoLink() {
  return useMutation<AutoLinkResult, Error, { threshold?: number }>({
    mutationFn: async (body) => {
      const res = await fetch("/api/memories/auto-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<AutoLinkResult>;
    },
  });
}

interface CenteredGraphParams {
  center?: number;
  depth?: number;
}

function getMemoryGraphWithParamsUrl(params?: CenteredGraphParams) {
  const sp = new URLSearchParams();
  if (params?.center !== undefined) sp.append("center", String(params.center));
  if (params?.depth !== undefined) sp.append("depth", String(params.depth));
  const qs = sp.toString();
  return qs ? `/api/memories/graph?${qs}` : `/api/memories/graph`;
}

interface GraphNode {
  id: number;
  title: string;
  type: string;
  content?: string | null;
  tags?: string[];
}

interface GraphEdge {
  id: number;
  source: number;
  target: number;
  type: string;
  note?: string | null;
}

function useGetMemoryGraphWithParams(params?: CenteredGraphParams) {
  return useQuery({
    queryKey: ["/api/memories/graph", params],
    queryFn: async ({ signal }) => {
      const res = await fetch(getMemoryGraphWithParamsUrl(params), { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
    },
  });
}

// ─── Workflow hooks ───────────────────────────────────────────────────────────

interface WorkflowRuleItem {
  id: string;
  name: string;
  description: string;
  trigger: string;
  enabled: boolean;
  isTemporal: boolean;
  lastRun: string | null;
  runCount: number;
  lastSuccess: boolean | null;
}

interface WorkflowHistoryItem {
  id: string;
  ruleId: string;
  ruleName: string;
  trigger: string;
  executedAt: string;
  success: boolean;
  result?: string;
  error?: string;
}

function useListWorkflows() {
  return useQuery({
    queryKey: ["/api/workflows"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/workflows", { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ data: WorkflowRuleItem[] }>;
    },
  });
}

function useToggleWorkflow() {
  const qc = useQueryClient();
  return useMutation<{ data: { id: string; enabled: boolean } }, Error, { id: string; enabled: boolean }>({
    mutationFn: async ({ id, enabled }) => {
      const res = await fetch(`/api/workflows/${id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ data: { id: string; enabled: boolean } }>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/workflows"] }),
  });
}

function useRunWorkflow() {
  const qc = useQueryClient();
  return useMutation<{ data: { id: string; message: string } }, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/workflows/${id}/run`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ data: { id: string; message: string } }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/workflows"] });
      qc.invalidateQueries({ queryKey: ["/api/workflows/history"] });
    },
  });
}

function useWorkflowHistory() {
  return useQuery({
    queryKey: ["/api/workflows/history"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/workflows/history", { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ data: WorkflowHistoryItem[] }>;
    },
  });
}

function useCreateWorkflow() {
  const qc = useQueryClient();
  return useMutation<{ data: WorkflowRuleItem }, Error, { id: string; name: string; description?: string; trigger: string; enabled?: boolean }>({
    mutationFn: async (body) => {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ data: WorkflowRuleItem }>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/workflows"] }),
  });
}

import {
  Brain, GitFork, Plus, Search, Trash2, Zap, ChevronDown, ChevronUp,
  List, Share2, Activity, BarChart2, Download, RefreshCw, Clock,
  CheckSquare, FolderOpen, Users, Layers, AlertCircle,
  X, Maximize2, Minimize2, Eye, EyeOff, Filter, Tag, ArrowRight, ArrowLeft,
  Network, Info, Link2,
  Copy, FileJson, FileText, Scale, CheckCircle2, Circle, Sparkles,
  ShieldAlert, Lightbulb, ScrollText, ListChecks, CalendarDays, Check,
  Server, Cpu, HardDrive, Wifi, WifiOff, XCircle, TrendingUp, TrendingDown,
  Database, Workflow, Play, Pause, History, Settings,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type Tab = "memoire" | "decisions" | "systeme" | "graphe" | "workflows";

// ─── Constants ────────────────────────────────────────────────────────────────

const MEMORY_TYPES = [
  { value: "person",   label: "Personne",   color: "text-blue-400 bg-blue-500/10", nodeColor: "#3b82f6" },
  { value: "project",  label: "Projet",     color: "text-violet-400 bg-violet-500/10", nodeColor: "#8b5cf6" },
  { value: "company",  label: "Entreprise", color: "text-emerald-400 bg-emerald-500/10", nodeColor: "#10b981" },
  { value: "decision", label: "Décision",   color: "text-amber-400 bg-amber-500/10", nodeColor: "#f59e0b" },
  { value: "note",     label: "Note",       color: "text-cyan-400 bg-cyan-500/10", nodeColor: "#06b6d4" },
  { value: "goal",     label: "Objectif",   color: "text-pink-400 bg-pink-500/10", nodeColor: "#ec4899" },
  { value: "event",    label: "Événement",  color: "text-orange-400 bg-orange-500/10", nodeColor: "#f97316" },
];

const EDGE_COLORS: Record<string, string> = {
  related_to:   "#6b7280",
  supports:     "#10b981",
  contradicts:  "#ef4444",
  caused_by:    "#f59e0b",
  leads_to:     "#3b82f6",
  part_of:      "#8b5cf6",
  works_on:     "#a855f7",
  knows:        "#14b8a6",
  decided_about: "#f97316",
  references:   "#64748b",
  collaborates_with: "#22c55e",
};

const EDGE_LABELS: Record<string, string> = {
  related_to: "lié à",
  supports: "soutient",
  contradicts: "contredit",
  caused_by: "causé par",
  leads_to: "mène à",
  part_of: "fait partie de",
  works_on: "travaille sur",
  knows: "connaît",
  decided_about: "décide de",
  references: "référence",
  collaborates_with: "collabore avec",
};

const DECISION_STATUS: Record<string, { label: string; color: string; dot: string }> = {
  pending:   { label: "En attente",  color: "text-slate-400 bg-slate-500/10 border-slate-500/20", dot: "#94a3b8" },
  analyzing: { label: "Analyse...",  color: "text-amber-400 bg-amber-500/10 border-amber-500/20", dot: "#fbbf24" },
  decided:   { label: "Décidé",      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", dot: "#34d399" },
  archived:  { label: "Archivé",     color: "text-muted-foreground bg-secondary border-border", dot: "#6b7280" },
};

const PRIORITY_BADGES: Record<string, { label: string; color: string }> = {
  low:    { label: "Basse",    color: "text-slate-400 bg-slate-500/10" },
  medium: { label: "Moyenne",  color: "text-blue-400 bg-blue-500/10" },
  high:   { label: "Haute",    color: "text-amber-400 bg-amber-500/10" },
  urgent: { label: "Urgente",  color: "text-red-400 bg-red-500/10" },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}j`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function formatMonthYear(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function Systeme() {
  const [tab, setTab] = useState<Tab>("memoire");

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "memoire",   label: "Mémoire",    icon: Brain },
    { id: "decisions", label: "Décisions",  icon: GitFork },
    { id: "graphe",    label: "Graphe",     icon: Network },
    { id: "workflows", label: "Workflows",  icon: Workflow },
    { id: "systeme",   label: "Système",    icon: Activity },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden animate-fade-in pb-28 md:pb-6 stagger-up">
      <div className="px-4 pt-6 pb-4 shrink-0">
        <h1 className="text-xl font-semibold text-foreground tracking-tight mb-4">Système</h1>
        <div className="flex gap-1 bg-secondary rounded-xl p-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 relative overflow-hidden",
                tab === t.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
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
      {tab === "graphe"    && <GrapheTab />}
      {tab === "workflows" && <WorkflowsTab />}
      {tab === "systeme"   && <SystemeTab />}
    </div>
  );
}

// ─── Mémoire Tab ──────────────────────────────────────────────────────────────

function MemoireTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("note");
  const [content, setContent] = useState("");
  const [autoLinkedIds, setAutoLinkedIds] = useState<Set<number>>(new Set());

  const semanticSearch = useSemanticSearch();
  const autoLink = useAutoLink();

  // Debounce search with semantic search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: semanticResults, isLoading: semanticLoading } = useQuery({
    queryKey: ["/api/memories/semantic-search", debouncedSearch, typeFilter],
    queryFn: async () => {
      if (!debouncedSearch.trim()) return null;
      return semanticSearch.mutateAsync({
        q: debouncedSearch,
        limit: 20,
        type: typeFilter !== "all" ? typeFilter : undefined,
      });
    },
    enabled: debouncedSearch.trim().length > 0,
  });

  // Fallback to list when no search
  const { data: allMemories = [], isLoading: listLoading } = useListMemories(
    !debouncedSearch.trim() && typeFilter !== "all"
      ? { type: typeFilter !== "all" ? (typeFilter as Memory["type"]) : undefined }
      : {}
  );

  const memories = debouncedSearch.trim()
    ? (semanticResults?.data ?? [])
    : allMemories;
  const isLoading = debouncedSearch.trim() ? semanticLoading : listLoading;

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
            className="w-full bg-secondary rounded-lg pl-9 pr-3 py-2 text-base text-foreground placeholder:text-muted-foreground outline-none"
            style={{ fontSize: "16px" }}
            placeholder="Recherche sémantique..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            autoLink.mutate({}, {
              onSuccess: (data) => {
                const ids = new Set<number>();
                data.links.forEach((l) => { ids.add(l.sourceId); ids.add(l.targetId); });
                setAutoLinkedIds(ids);
                qc.invalidateQueries({ queryKey: getGetMemoryGraphQueryKey() });
                toast({ title: `${data.created} liens créés automatiquement` });
              },
            });
          }}
          disabled={autoLink.isPending}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 disabled:opacity-50"
          title="Lier automatiquement"
        >
          <Link2 className="w-4 h-4" />
          <span className="hidden sm:inline">Lier auto</span>
        </button>
      </div>

      {/* Type filter chips */}
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

      {/* Add form */}
      {showForm && (
        <div className="mb-3 bg-secondary rounded-xl p-4 space-y-3 shrink-0">
          <input
            className="w-full bg-background rounded-lg px-3 py-2 text-base text-foreground placeholder:text-muted-foreground outline-none"
            style={{ fontSize: "16px" }}
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
            className="w-full bg-background rounded-lg px-3 py-2 text-base text-foreground placeholder:text-muted-foreground outline-none resize-none"
            style={{ fontSize: "16px" }}
            placeholder="Contenu..."
            rows={3}
            value={content}
            onChange={e => setContent(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (!title.trim()) return;
                create.mutate({ data: { title: title.trim(), type: type as Memory["type"], content: content.trim() || undefined } });
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

      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-secondary rounded-xl animate-pulse shimmer" />)}
          </div>
        ) : memories.length === 0 ? (
          <EmptyState icon={Brain} title="Aucune mémoire" sub={debouncedSearch.trim() ? "Aucun résultat sémantique" : "Ajoutez des informations à retenir"} />
        ) : (
          memories.map((m) => {
            const typeInfo = getTypeInfo(m.type);
            const score = (m as { semanticScore?: number }).semanticScore;
            const isAutoLinked = autoLinkedIds.has(m.id);
            return (
              <div key={m.id} className="bg-secondary rounded-xl p-3.5 flex items-start gap-3 transition-all duration-300 hover:bg-secondary/80 hover-lift hover-glow relative">
                <div className={cn("mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide shrink-0", typeInfo.color)}>
                  {typeInfo.label}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{m.title}</div>
                  {m.content && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{m.content}</div>}
                  {score !== undefined && (
                    <div className="flex items-center gap-2 mt-1">
                      <div className="text-[10px] text-primary font-medium">Score: {(score * 100).toFixed(1)}%</div>
                      <Badge variant="outline" className="h-4 px-1 text-[10px] gap-0.5 border-indigo-200 bg-indigo-50 text-indigo-700">
                        <Database className="h-2.5 w-2.5" />
                        Vector
                      </Badge>
                      <div className="w-12 h-1 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-500"
                          style={{ width: `${Math.min(score * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {isAutoLinked && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-600 font-medium">Liens auto</span>
                  )}
                  <button
                    onClick={() => del.mutate({ id: m.id })}
                    className="shrink-0 p-1.5 rounded-lg hover:bg-background text-muted-foreground hover:text-destructive transition-colors active:scale-[0.98]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Graphe Tab (Memory Graph) ────────────────────────────────────────────────

interface SimNode {
  id: string;
  title: string;
  type: string;
  content?: string | null;
  tags?: string[];
  x: number;
  y: number;
  fx?: number;
  fy?: number;
  vx: number;
  vy: number;
  degree: number;
}

interface SimEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  note?: string | null;
}

function GrapheTab() {
  const [centerNodeId, setCenterNodeId] = useState<number | undefined>(undefined);
  const [depth, setDepth] = useState(1);
  const { data: graph, isLoading } = useGetMemoryGraphWithParams(
    centerNodeId !== undefined ? { center: centerNodeId, depth } : undefined
  );
  const { data: memories = [] } = useListMemories();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<SimNode[]>([]);
  const [edges, setEdges] = useState<SimEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const animRef = useRef<number | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const dragNodeRef = useRef<string | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  // Filters & search
  const [searchQuery, setSearchQuery] = useState("");
  const [showLabels, setShowLabels] = useState(true);
  const [activeNodeTypes, setActiveNodeTypes] = useState<Set<string>>(new Set(MEMORY_TYPES.map(t => t.value)));
  const [activeEdgeTypes, setActiveEdgeTypes] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  // Build edge types from data
  useEffect(() => {
    if (graph?.edges) {
      const types = new Set<string>();
      graph.edges.forEach((e) => types.add(e.type));
      setActiveEdgeTypes(prev => {
        const next = new Set(prev);
        types.forEach(t => { if (!next.has(t)) next.add(t); });
        return next;
      });
    }
  }, [graph]);

  // Sync dims from container
  useEffect(() => {
    const el = containerRef.current;
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
    const nodeMap = new Map<string, SimNode>();
    const ns: SimNode[] = (graph.nodes ?? []).map((n, i, arr) => {
      const id = String(n.id);
      const node: SimNode = {
        id,
        title: n.title ?? "?",
        type: n.type ?? "note",
        content: n.content,
        tags: n.tags,
        x: w / 2 + (Math.cos((i / (arr.length || 1)) * 2 * Math.PI) * Math.min(w, h) * 0.25),
        y: h / 2 + (Math.sin((i / (arr.length || 1)) * 2 * Math.PI) * Math.min(w, h) * 0.25),
        vx: 0,
        vy: 0,
        degree: 0,
      };
      nodeMap.set(id, node);
      return node;
    });

    const es: SimEdge[] = (graph.edges ?? []).map((e) => ({
      id: String(e.id),
      source: String(e.source),
      target: String(e.target),
      type: e.type ?? "related_to",
      note: e.note,
    }));

    // Compute degrees
    es.forEach(e => {
      const s = nodeMap.get(e.source);
      const t = nodeMap.get(e.target);
      if (s) s.degree++;
      if (t) t.degree++;
    });

    nodesRef.current = ns;
    setNodes([...ns]);
    setEdges(es);
  }, [graph, dims.w, dims.h]);

  // Filtered nodes/edges
  const filteredNodes = useMemo(() => {
    return nodes.filter(n => activeNodeTypes.has(n.type));
  }, [nodes, activeNodeTypes]);

  const filteredEdges = useMemo(() => {
    const visibleIds = new Set(filteredNodes.map(n => n.id));
    return edges.filter(e =>
      activeEdgeTypes.has(e.type) && visibleIds.has(e.source) && visibleIds.has(e.target)
    );
  }, [edges, filteredNodes, activeEdgeTypes]);

  // Search highlighting
  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const q = searchQuery.toLowerCase();
    const matches = new Set<string>();
    filteredNodes.forEach(n => {
      if (n.title.toLowerCase().includes(q) || n.type.toLowerCase().includes(q)) matches.add(n.id);
      if (n.tags?.some(t => t.toLowerCase().includes(q))) matches.add(n.id);
      if (n.content?.toLowerCase().includes(q)) matches.add(n.id);
    });
    return matches;
  }, [searchQuery, filteredNodes]);

  // Simple force simulation tick
  const tick = useCallback(() => {
    const ns = nodesRef.current;
    if (!ns.length) return;
    const { w, h } = dims;
    const cx = w / 2;
    const cy = h / 2;
    const DAMPING = 0.88;
    const REPEL = 2000;
    const ATTRACT = 0.008;
    const CENTER = 0.015;
    const LINK_DIST = 100;

    // Only simulate visible nodes
    const visibleIds = new Set(filteredNodes.map(n => n.id));

    for (let i = 0; i < ns.length; i++) {
      const a = ns[i];
      if (!visibleIds.has(a.id)) continue;
      if (a.fx !== undefined) { a.x = a.fx; a.vx = 0; continue; }
      // Center gravity
      a.vx += (cx - a.x) * CENTER;
      a.vy += (cy - a.y) * CENTER;
      // Repulsion
      for (let j = i + 1; j < ns.length; j++) {
        const b = ns[j];
        if (!visibleIds.has(b.id)) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = REPEL / (dist * dist + 1);
        a.vx += (dx / dist) * f;
        a.vy += (dy / dist) * f;
        b.vx -= (dx / dist) * f;
        b.vy -= (dy / dist) * f;
      }
    }
    // Edge attraction (spring)
    filteredEdges.forEach(e => {
      const src = ns.find(n => n.id === e.source);
      const tgt = ns.find(n => n.id === e.target);
      if (!src || !tgt) return;
      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - LINK_DIST) * ATTRACT;
      src.vx += (dx / dist) * force;
      src.vy += (dy / dist) * force;
      tgt.vx -= (dx / dist) * force;
      tgt.vy -= (dy / dist) * force;
    });

    for (const n of ns) {
      if (!visibleIds.has(n.id)) continue;
      if (n.fx !== undefined) { n.x = n.fx; n.vx = 0; continue; }
      n.vx *= DAMPING;
      n.vy *= DAMPING;
      n.x = Math.max(20, Math.min(w - 20, n.x + n.vx));
      n.y = Math.max(20, Math.min(h - 20, n.y + n.vy));
    }
    nodesRef.current = [...ns];
    setNodes([...ns]);
    animRef.current = requestAnimationFrame(tick);
  }, [filteredEdges, filteredNodes, dims]);

  useEffect(() => {
    if (!nodes.length) return;
    animRef.current = requestAnimationFrame(tick);
    const stop = setTimeout(() => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    }, 5000);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      clearTimeout(stop);
    };
  }, [filteredEdges.length, tick, nodes.length]);

  // Restart simulation on filter changes
  useEffect(() => {
    if (nodes.length) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      animRef.current = requestAnimationFrame(tick);
      const stop = setTimeout(() => {
        if (animRef.current) cancelAnimationFrame(animRef.current);
      }, 3000);
      return () => clearTimeout(stop);
    }
    return undefined;
  }, [activeNodeTypes.size, activeEdgeTypes.size]);

  const getTypeColor = (t: string) => {
    const found = MEMORY_TYPES.find(x => x.value === t);
    return found?.nodeColor ?? "#6b7280";
  };

  const getNodeRadius = (n: SimNode) => {
    const base = 8;
    const maxExtra = 12;
    const maxDegree = Math.max(1, ...nodes.map(nn => nn.degree));
    return base + (n.degree / maxDegree) * maxExtra;
  };

  // Zoom / Pan handlers
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform(prev => {
      const newK = Math.max(0.2, Math.min(4, prev.k * scaleFactor));
      return { ...prev, k: newK };
    });
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as Element).tagName === "svg") {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const dx = (e.clientX - panStartRef.current.x) / transform.k;
      const dy = (e.clientY - panStartRef.current.y) / transform.k;
      setTransform(prev => ({ ...prev, x: panStartRef.current.tx + dx, y: panStartRef.current.ty + dy }));
    }
    if (dragNodeRef.current) {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = (e.clientX - rect.left - transform.x * transform.k) / transform.k;
      const my = (e.clientY - rect.top - transform.y * transform.k) / transform.k;
      const node = nodesRef.current.find(n => n.id === dragNodeRef.current);
      if (node) {
        node.fx = mx - dragOffsetRef.current.x;
        node.fy = my - dragOffsetRef.current.y;
        node.x = node.fx;
        node.y = node.fy;
        nodesRef.current = [...nodesRef.current];
        setNodes([...nodesRef.current]);
      }
    }
  };

  const onMouseUp = () => {
    setIsPanning(false);
    if (dragNodeRef.current) {
      const node = nodesRef.current.find(n => n.id === dragNodeRef.current);
      if (node) { node.fx = undefined; node.fy = undefined; }
      dragNodeRef.current = null;
    }
  };

  const onNodeMouseDown = (e: React.MouseEvent, node: SimNode) => {
    e.stopPropagation();
    dragNodeRef.current = node.id;
    dragOffsetRef.current = { x: 0, y: 0 };
  };

  const onNodeClick = (node: SimNode) => {
    if (dragNodeRef.current) return;
    setSelectedNode(prev => prev?.id === node.id ? null : node);
    // Center graph on clicked node
    const id = Number(node.id);
    if (!isNaN(id)) {
      setCenterNodeId(id);
    }
  };

  const onNodeDoubleClick = (node: SimNode) => {
    setSelectedNode(node);
    const id = Number(node.id);
    if (!isNaN(id)) {
      setCenterNodeId(id);
    }
  };

  // Get related edges for selected node
  const selectedNodeEdges = useMemo(() => {
    if (!selectedNode) return { incoming: [] as SimEdge[], outgoing: [] as SimEdge[] };
    const incoming = edges.filter(e => e.target === selectedNode.id);
    const outgoing = edges.filter(e => e.source === selectedNode.id);
    return { incoming, outgoing };
  }, [selectedNode, edges]);

  // Get memory details
  const selectedMemory = useMemo(() => {
    if (!selectedNode) return null;
    return memories.find((m: { id: number }) => String(m.id) === selectedNode.id);
  }, [selectedNode, memories]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-muted-foreground animate-pulse">Chargement du graphe...</div>
      </div>
    );
  }

  if (!nodes.length) {
    return (
      <div className="flex-1 flex flex-col px-4 pb-4">
        <EmptyState icon={Network} title="Graphe vide" sub="Ajoutez des mémoires pour les voir ici" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden px-4 pb-4">
      {/* Toolbar */}
      <div className="flex gap-2 mb-2 shrink-0 items-center flex-wrap">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full bg-secondary rounded-lg pl-9 pr-3 py-2 text-base text-foreground placeholder:text-muted-foreground outline-none"
            style={{ fontSize: "16px" }}
            placeholder="Rechercher un nœud..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        {centerNodeId !== undefined && (
          <div className="flex items-center gap-1.5 bg-secondary rounded-lg px-2 py-1.5 text-xs">
            <span className="text-muted-foreground">Centre:</span>
            <span className="font-medium text-foreground max-w-[80px] truncate">
              {nodes.find(n => Number(n.id) === centerNodeId)?.title ?? `#${centerNodeId}`}
            </span>
            <button
              onClick={() => { setCenterNodeId(undefined); setDepth(1); }}
              className="p-0.5 rounded hover:bg-background text-muted-foreground hover:text-foreground"
              title="Réinitialiser le centre"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-1 bg-secondary rounded-lg px-2 py-1.5">
          <span className="text-[10px] text-muted-foreground uppercase">Prof.</span>
          <button
            onClick={() => setDepth(1)}
            className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", depth === 1 ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            1
          </button>
          <button
            onClick={() => setDepth(2)}
            className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", depth === 2 ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            2
          </button>
        </div>
        <button
          onClick={() => setDepth(prev => Math.min(prev + 1, 2))}
          disabled={depth >= 2 || centerNodeId === undefined}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground text-xs font-medium disabled:opacity-40 transition-all shrink-0"
          title="Étendre la profondeur"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Étendre</span>
        </button>
        <button
          onClick={() => setShowLabels(prev => !prev)}
          className={cn("p-2 rounded-lg transition-all shrink-0", showLabels ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}
          title={showLabels ? "Masquer les labels" : "Afficher les labels"}
        >
          {showLabels ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
        <button
          onClick={() => setShowFilters(prev => !prev)}
          className={cn("p-2 rounded-lg transition-all shrink-0", showFilters ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}
          title="Filtres"
        >
          <Filter className="w-4 h-4" />
        </button>
        <button
          onClick={() => setTransform({ x: 0, y: 0, k: 1 })}
          className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-all shrink-0"
          title="Réinitialiser le zoom"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="mb-2 bg-secondary rounded-xl p-3 space-y-2 shrink-0">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Types de nœuds</div>
          <div className="flex gap-1.5 flex-wrap">
            {MEMORY_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => setActiveNodeTypes(prev => {
                  const next = new Set(prev);
                  if (next.has(t.value)) next.delete(t.value); else next.add(t.value);
                  return next;
                })}
                className={cn("px-2 py-1 rounded-full text-[10px] font-medium transition-all",
                  activeNodeTypes.has(t.value) ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2">Types de liens</div>
          <div className="flex gap-1.5 flex-wrap">
            {Array.from(new Set(edges.map(e => e.type))).map(type => (
              <button
                key={type}
                onClick={() => setActiveEdgeTypes(prev => {
                  const next = new Set(prev);
                  if (next.has(type)) next.delete(type); else next.add(type);
                  return next;
                })}
                className={cn("px-2 py-1 rounded-full text-[10px] font-medium transition-all flex items-center gap-1",
                  activeEdgeTypes.has(type) ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"
                )}
              >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: EDGE_COLORS[type] ?? "#6b7280" }} />
                {EDGE_LABELS[type] ?? type}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Graph container */}
      <div ref={containerRef} className="flex-1 min-h-0 relative bg-background rounded-xl border border-border overflow-hidden">
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{ touchAction: "none", cursor: isPanning ? "grabbing" : "grab" }}
          role="img"
          aria-label="Graphe de mémoire interactif"
          onWheel={onWheel}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          <defs>
            {Object.entries(EDGE_COLORS).map(([type, color]) => (
              <marker key={`arrow-${type}`} id={`arrow-${type}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill={color} opacity="0.6" />
              </marker>
            ))}
          </defs>
          <g transform={`translate(${transform.x * transform.k}, ${transform.y * transform.k}) scale(${transform.k})`}>
            {/* Edges */}
            {filteredEdges.map(e => {
              const src = nodes.find(n => n.id === e.source);
              const tgt = nodes.find(n => n.id === e.target);
              if (!src || !tgt) return null;
              return (
                <line
                  key={e.id}
                  x1={src.x} y1={src.y}
                  x2={tgt.x} y2={tgt.y}
                  stroke={EDGE_COLORS[e.type] ?? "#6b7280"}
                  strokeWidth={hoveredNode && (e.source === hoveredNode.id || e.target === hoveredNode.id) ? 2.5 : 1.2}
                  strokeOpacity={hoveredNode && (e.source === hoveredNode.id || e.target === hoveredNode.id) ? 0.9 : 0.35}
                  markerEnd={`url(#arrow-${e.type})`}
                  style={{ transition: "stroke-width 0.15s, stroke-opacity 0.15s" }}
                />
              );
            })}
            {/* Nodes */}
            {filteredNodes.map(n => {
              const r = getNodeRadius(n);
              const isSelected = selectedNode?.id === n.id;
              const isHovered = hoveredNode?.id === n.id;
              const isSearchMatch = searchMatches.has(n.id);
              return (
                <g
                  key={n.id}
                  onMouseEnter={() => setHoveredNode(n)}
                  onMouseLeave={() => setHoveredNode(prev => prev?.id === n.id ? null : prev)}
                  onClick={() => onNodeClick(n)}
                  onDoubleClick={() => onNodeDoubleClick(n)}
                  onMouseDown={e => onNodeMouseDown(e, n)}
                  style={{ cursor: "pointer" }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Mémoire : ${n.title}, type ${n.type}`}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onNodeClick(n); }}
                >
                  <circle
                    cx={n.x} cy={n.y} r={isSelected ? r + 4 : isHovered ? r + 2 : r}
                    fill={getTypeColor(n.type)}
                    fillOpacity={isSearchMatch ? 1 : 0.85}
                    stroke={isSelected ? "#fff" : isSearchMatch ? "#fbbf24" : "transparent"}
                    strokeWidth={isSelected ? 3 : isSearchMatch ? 2.5 : 0}
                    style={{ transition: "r 0.3s ease, stroke 0.3s ease, fill-opacity 0.3s ease" }}
                  />
                  {(showLabels || isHovered || isSelected) && (
                    <text
                      x={n.x} y={n.y + r + 14}
                      textAnchor="middle"
                      fontSize={isHovered || isSelected ? 11 : 9}
                      fill={isSearchMatch ? "#fbbf24" : "#9ca3af"}
                      fontWeight={isSelected ? 600 : 400}
                      className="pointer-events-none select-none"
                      style={{ transition: "font-size 0.15s" }}
                    >
                      {n.title.length > 18 ? n.title.slice(0, 17) + "…" : n.title}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Legend */}
        <div className="absolute bottom-2 left-2 bg-background/90 backdrop-blur rounded-lg p-2 space-y-1 border border-border">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Légende</div>
          {MEMORY_TYPES.map(t => (
            <div key={t.value} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.nodeColor }} />
              <span className="text-[10px] text-muted-foreground">{t.label}</span>
            </div>
          ))}
        </div>

        {/* Zoom info */}
        <div className="absolute top-2 right-2 bg-background/90 backdrop-blur rounded-lg px-2 py-1 border border-border">
          <span className="text-[10px] text-muted-font-foreground">{Math.round(transform.k * 100)}%</span>
        </div>

        {/* Search results count */}
        {searchQuery.trim() && (
          <div className="absolute top-2 left-2 bg-background/90 backdrop-blur rounded-lg px-2 py-1 border border-border">
            <span className="text-[10px] text-amber-400">{searchMatches.size} résultat{searchMatches.size > 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Node detail drawer */}
      {selectedNode && (
        <NodeDetailDrawer
          node={selectedNode}
          memory={selectedMemory ?? null}
          incoming={selectedNodeEdges.incoming}
          outgoing={selectedNodeEdges.outgoing}
          nodes={nodes}
          onClose={() => setSelectedNode(null)}
          onNavigate={(id) => {
            const target = nodes.find(n => n.id === id);
            if (target) {
              setSelectedNode(target);
              // Center view on node
              setTransform(prev => ({
                ...prev,
                x: dims.w / 2 / prev.k - target.x,
                y: dims.h / 2 / prev.k - target.y,
              }));
            }
          }}
        />
      )}
    </div>
  );
}

// ─── Node Detail Drawer ───────────────────────────────────────────────────────

function NodeDetailDrawer({
  node,
  memory,
  incoming,
  outgoing,
  nodes,
  onClose,
  onNavigate,
}: {
  node: SimNode;
  memory: Memory | null;
  incoming: SimEdge[];
  outgoing: SimEdge[];
  nodes: SimNode[];
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showCreateEdge, setShowCreateEdge] = useState(false);
  const [targetNodeId, setTargetNodeId] = useState("");
  const [edgeType, setEdgeType] = useState("related_to");
  const [edgeNote, setEdgeNote] = useState("");

  const createEdge = useCreateMemoryEdge({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetMemoryGraphQueryKey() });
        toast({ title: "Relation créée" });
        setShowCreateEdge(false);
        setTargetNodeId("");
        setEdgeNote("");
      },
    },
  });

  const deleteEdge = useDeleteMemoryEdge({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetMemoryGraphQueryKey() });
        toast({ title: "Relation supprimée" });
      },
    },
  });

  const getNodeTitle = (id: string) => {
    const n = nodes.find(nn => nn.id === id);
    return n?.title ?? id;
  };

  const getTypeInfo = (t: string) =>
    MEMORY_TYPES.find(x => x.value === t) ?? { label: t, color: "text-muted-foreground bg-secondary", nodeColor: "#6b7280" };

  const typeInfo = getTypeInfo(node.type);

  const availableTargets = nodes.filter(n => n.id !== node.id);
  const allEdges = [...incoming, ...outgoing];

  return (
    <div className="absolute top-0 right-0 bottom-0 w-80 bg-background/95 backdrop-blur border-l border-border shadow-xl z-50 flex flex-col animate-slide-in-right transition-all duration-500">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: typeInfo.nodeColor }} />
          <span className="text-sm font-semibold text-foreground truncate">{node.title}</span>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {/* Type & tags */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide", typeInfo.color)}>
            {typeInfo.label}
          </span>
          {node.tags?.map(tag => (
            <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-[10px] text-muted-foreground">
              <Tag className="w-2.5 h-2.5" />
              {tag}
            </span>
          ))}
        </div>

        {/* Content */}
        {memory?.content && (
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Contenu</div>
            <div className="text-xs text-foreground/80 whitespace-pre-wrap bg-secondary rounded-lg p-3">{memory.content}</div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-secondary rounded-lg p-2.5 text-center">
            <div className="text-lg font-bold text-foreground">{incoming.length}</div>
            <div className="text-[10px] text-muted-foreground">Entrantes</div>
          </div>
          <div className="bg-secondary rounded-lg p-2.5 text-center">
            <div className="text-lg font-bold text-foreground">{outgoing.length}</div>
            <div className="text-[10px] text-muted-foreground">Sortantes</div>
          </div>
        </div>

        {/* Relations */}
        {allEdges.length > 0 && (
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Relations</div>
            <div className="space-y-1.5">
              {incoming.map(e => (
                <div key={`in-${e.id}`} className="flex items-center gap-1.5 text-xs bg-secondary rounded-lg p-2">
                  <button
                    onClick={() => onNavigate(e.source)}
                    className="text-foreground hover:text-primary truncate flex items-center gap-1 min-w-0"
                  >
                    <ArrowRight className="w-3 h-3 rotate-180 shrink-0" />
                    <span className="truncate">{getNodeTitle(e.source)}</span>
                  </button>
                  <span className="text-muted-foreground shrink-0">→</span>
                  <span className="text-[10px] text-muted-foreground shrink-0 px-1 py-0.5 rounded bg-background">
                    {EDGE_LABELS[e.type] ?? e.type}
                  </span>
                </div>
              ))}
              {outgoing.map(e => (
                <div key={`out-${e.id}`} className="flex items-center gap-1.5 text-xs bg-secondary rounded-lg p-2">
                  <span className="text-[10px] text-muted-foreground shrink-0 px-1 py-0.5 rounded bg-background">
                    {EDGE_LABELS[e.type] ?? e.type}
                  </span>
                  <span className="text-muted-foreground shrink-0">→</span>
                  <button
                    onClick={() => onNavigate(e.target)}
                    className="text-foreground hover:text-primary truncate flex items-center gap-1 min-w-0"
                  >
                    <span className="truncate">{getNodeTitle(e.target)}</span>
                    <ArrowRight className="w-3 h-3 shrink-0" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Create edge form */}
        {showCreateEdge ? (
          <div className="bg-secondary rounded-xl p-3 space-y-2.5">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Nouvelle relation</div>
            <select
              className="w-full bg-background rounded-lg px-3 py-2 text-xs text-foreground outline-none"
              value={targetNodeId}
              onChange={e => setTargetNodeId(e.target.value)}
            >
              <option value="">Choisir un nœud cible...</option>
              {availableTargets.map(n => (
                <option key={n.id} value={n.id}>{n.title} ({n.type})</option>
              ))}
            </select>
            <select
              className="w-full bg-background rounded-lg px-3 py-2 text-xs text-foreground outline-none"
              value={edgeType}
              onChange={e => setEdgeType(e.target.value)}
            >
              {Object.entries(EDGE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <input
              className="w-full bg-background rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none"
              placeholder="Note (optionnel)..."
              value={edgeNote}
              onChange={e => setEdgeNote(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (!targetNodeId) return;
                  createEdge.mutate({
                    id: Number(node.id),
                    data: {
                      targetId: Number(targetNodeId),
                      type: edgeType as MemoryEdgeType,
                      note: edgeNote.trim() || undefined,
                    },
                  });
                }}
                disabled={!targetNodeId || createEdge.isPending}
                className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
              >
                {createEdge.isPending ? "Création..." : "Créer"}
              </button>
              <button onClick={() => setShowCreateEdge(false)} className="px-3 py-2 rounded-lg bg-background text-muted-foreground text-xs">
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCreateEdge(true)}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-secondary text-foreground text-xs font-medium hover:bg-secondary/80 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Créer une relation
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── DÉCISIONS TAB (NOUVEAU) ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

interface Decision {
  id: number;
  title: string;
  context?: string | null;
  options?: string[];
  advantages?: string[];
  risks?: string[];
  aiAdvice?: string | null;
  redTeamAdvice?: string | null;
  result?: string | null;
  learnings?: string | null;
  status: "pending" | "analyzing" | "decided" | "archived";
  confidenceScore: number;
  createdAt: string;
  updatedAt: string;
}

// ─── CircularGauge ────────────────────────────────────────────────────────────

function CircularGauge({ score, size = 44 }: { score: number; size?: number }) {
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const color = score >= 70 ? "#34d399" : score >= 40 ? "#fbbf24" : "#f87171";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke}
          className="text-muted-foreground/15" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-700 ease-out" />
      </svg>
      <span className="absolute text-[10px] font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

// ─── CollapsibleSection ───────────────────────────────────────────────────────

function CollapsibleSection({
  title, icon: Icon, children, defaultOpen = false, colorClass = "text-muted-foreground"
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
  colorClass?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border/60 rounded-xl overflow-hidden bg-background/50">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide hover:bg-secondary/50 transition-colors"
      >
        <Icon className={cn("w-3.5 h-3.5 shrink-0", colorClass)} />
        <span className={cn("flex-1 text-left", colorClass)}>{title}</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── ExportMenu ───────────────────────────────────────────────────────────────

function ExportMenu({ decision, onClose }: { decision: Decision; onClose: () => void }) {
  const { toast } = useToast();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const toMarkdown = () => {
    const statusInfo = DECISION_STATUS[decision.status] ?? DECISION_STATUS.pending;
    let md = `# ${decision.title}\n\n`;
    md += `**Statut :** ${statusInfo.label}\n`;
    md += `**Score de confiance :** ${decision.confidenceScore}/100\n`;
    md += `**Date :** ${formatDate(decision.createdAt)}\n\n`;
    if (decision.context) md += `## Contexte\n\n${decision.context}\n\n`;
    if (decision.options?.length) md += `## Options\n\n${decision.options.map((o, i) => `${i + 1}. ${o}`).join("\n")}\n\n`;
    if (decision.advantages?.length) md += `## Avantages\n\n${decision.advantages.map(a => `- ${a}`).join("\n")}\n\n`;
    if (decision.risks?.length) md += `## Risques\n\n${decision.risks.map(r => `- ${r}`).join("\n")}\n\n`;
    if (decision.aiAdvice) md += `## Conseil IA\n\n${decision.aiAdvice}\n\n`;
    if (decision.redTeamAdvice) md += `## Red Team Advice\n\n${decision.redTeamAdvice}\n\n`;
    if (decision.result) md += `## Résultat\n\n${decision.result}\n\n`;
    if (decision.learnings) md += `## Apprentissages\n\n${decision.learnings}\n\n`;
    return md;
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copié dans le presse-papiers` });
    } catch {
      toast({ title: "Erreur", description: "Impossible de copier" });
    }
    onClose();
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `${filename} téléchargé` });
    onClose();
  };

  return (
    <div ref={menuRef} className="absolute right-0 top-8 z-50 bg-popover border border-border rounded-xl shadow-xl p-1.5 min-w-[180px]">
      <button
        onClick={() => copyToClipboard(toMarkdown(), "Markdown")}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-foreground hover:bg-secondary transition-colors"
      >
        <FileText className="w-3.5 h-3.5 text-muted-foreground" />
        Copier Markdown
      </button>
      <button
        onClick={() => downloadFile(toMarkdown(), `decision-${decision.id}.md`, "text/markdown")}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-foreground hover:bg-secondary transition-colors"
      >
        <ScrollText className="w-3.5 h-3.5 text-muted-foreground" />
        Télécharger Markdown
      </button>
      <button
        onClick={() => copyToClipboard(JSON.stringify(decision, null, 2), "JSON")}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-foreground hover:bg-secondary transition-colors"
      >
        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
        Copier JSON
      </button>
      <button
        onClick={() => downloadFile(JSON.stringify(decision, null, 2), `decision-${decision.id}.json`, "application/json")}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-foreground hover:bg-secondary transition-colors"
      >
        <FileJson className="w-3.5 h-3.5 text-muted-foreground" />
        Télécharger JSON
      </button>
    </div>
  );
}

// ─── DecisionCard ─────────────────────────────────────────────────────────────

function DecisionCard({
  decision,
  isExpanded,
  isSelected,
  onToggle,
  onSelectForCompare,
  analyze,
  update,
  del,
  createTasks,
}: {
  decision: Decision;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onSelectForCompare: () => void;
  analyze: ReturnType<typeof useAnalyzeDecision>;
  update: ReturnType<typeof useUpdateDecision>;
  del: ReturnType<typeof useDeleteDecision>;
  createTasks: ReturnType<typeof useCreateTasksFromDecision>;
}) {
  const [showExport, setShowExport] = useState(false);
  const [showCreateTasksConfirm, setShowCreateTasksConfirm] = useState(false);
  const status = DECISION_STATUS[decision.status] ?? DECISION_STATUS.pending;
  const analyzingThis = analyze.isPending && analyze.variables?.id === decision.id;

  // Auto-generate tasks from decision content
  const handleCreateTasks = () => {
    const tasks = [];
    if (decision.result) {
      tasks.push({ title: `Mettre en œuvre : ${decision.result.slice(0, 80)}`, priority: "high" as const });
    }
    if (decision.aiAdvice) {
      tasks.push({ title: `Suivre conseil IA : ${decision.aiAdvice.slice(0, 80)}`, priority: "medium" as const });
    }
    if (decision.risks?.length) {
      tasks.push({ title: `Atténuer risque : ${decision.risks[0].slice(0, 80)}`, priority: "high" as const });
    }
    if (tasks.length === 0) {
      tasks.push({ title: `Suivi décision : ${decision.title.slice(0, 80)}`, priority: "medium" as const });
    }
    createTasks.mutate({ id: decision.id, data: { tasks } });
    setShowCreateTasksConfirm(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={cn(
        "bg-card rounded-2xl border overflow-hidden transition-shadow duration-300",
        isExpanded ? "shadow-lg border-border/80" : "shadow-sm border-border/40 hover:shadow-md hover:border-border/60"
      )}
    >
      {/* Header */}
      <div
        className="p-4 flex items-start gap-3 cursor-pointer"
        onClick={onToggle}
      >
        {/* Timeline dot */}
        <div className="flex flex-col items-center pt-1.5">
          <div
            className="w-3 h-3 rounded-full border-2 border-background shadow-sm shrink-0"
            style={{ backgroundColor: status.dot }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border", status.color)}>
              {status.label}
            </span>
            {decision.confidenceScore !== undefined && (
              <div className="flex items-center gap-1">
                <CircularGauge score={decision.confidenceScore} size={36} />
              </div>
            )}
            {/* Compare checkbox */}
            <button
              onClick={(e) => { e.stopPropagation(); onSelectForCompare(); }}
              className={cn(
                "ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all",
                isSelected
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-secondary border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {isSelected ? <Check className="w-3 h-3" /> : <Scale className="w-3 h-3" />}
              {isSelected ? "Sélectionnée" : "Comparer"}
            </button>
          </div>
          <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">{decision.title}</h3>
          <div className="flex items-center gap-2 mt-1.5">
            <CalendarDays className="w-3 h-3 text-muted-foreground/60" />
            <span className="text-[10px] text-muted-foreground/70">{formatDate(decision.createdAt)}</span>
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {decision.status === "pending" && (
            <button
              onClick={(e) => { e.stopPropagation(); analyze.mutate({ id: decision.id }); }}
              disabled={analyze.isPending}
              className="p-2 rounded-lg hover:bg-secondary text-amber-400 hover:text-amber-300 transition-all active:scale-95"
              title="Analyser avec l'IA"
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowExport(!showExport); }}
              className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-all active:scale-95"
              title="Exporter"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            {showExport && <ExportMenu decision={decision} onClose={() => setShowExport(false)} />}
          </div>
          {decision.status === "decided" && (
            <button
              onClick={(e) => { e.stopPropagation(); update.mutate({ id: decision.id, data: { status: "archived" } }); }}
              className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-all text-[10px] font-medium active:scale-95"
              title="Archiver"
            >
              Archiver
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); del.mutate({ id: decision.id }); }}
            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-destructive transition-all active:scale-95"
            title="Supprimer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-border/40 pt-3 space-y-3">
              {/* Context */}
              {decision.context && (
                <CollapsibleSection title="Contexte" icon={Info} defaultOpen={true}>
                  <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">{decision.context}</p>
                </CollapsibleSection>
              )}

              {/* Options with radio style */}
              {decision.options && decision.options.length > 0 && (
                <CollapsibleSection title="Options" icon={ListChecks} defaultOpen={true}>
                  <div className="space-y-1.5">
                    {decision.options.map((opt, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                        <Circle className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{opt}</span>
                      </div>
                    ))}
                  </div>
                </CollapsibleSection>
              )}

              {/* AI Advice */}
              {decision.aiAdvice && (
                <CollapsibleSection title="Conseil IA" icon={Sparkles} colorClass="text-amber-400">
                  <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">{decision.aiAdvice}</p>
                </CollapsibleSection>
              )}

              {/* Red Team Advice */}
              {decision.redTeamAdvice && (
                <CollapsibleSection title="Red Team Advice" icon={ShieldAlert} colorClass="text-red-400">
                  <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">{decision.redTeamAdvice}</p>
                </CollapsibleSection>
              )}

              {/* Avantages */}
              {decision.advantages && decision.advantages.length > 0 && (
                <CollapsibleSection title="Avantages" icon={CheckCircle2} colorClass="text-emerald-400">
                  <ul className="space-y-1">
                    {decision.advantages.map((a, i) => (
                      <li key={i} className="text-xs text-foreground/80 flex items-start gap-1.5">
                        <span className="text-emerald-400 shrink-0 mt-0.5">+</span>
                        <span className="leading-relaxed">{a}</span>
                      </li>
                    ))}
                  </ul>
                </CollapsibleSection>
              )}

              {/* Risques */}
              {decision.risks && decision.risks.length > 0 && (
                <CollapsibleSection title="Risques" icon={AlertCircle} colorClass="text-red-400">
                  <ul className="space-y-1">
                    {decision.risks.map((r, i) => (
                      <li key={i} className="text-xs text-foreground/80 flex items-start gap-1.5">
                        <span className="text-red-400 shrink-0 mt-0.5">−</span>
                        <span className="leading-relaxed">{r}</span>
                      </li>
                    ))}
                  </ul>
                </CollapsibleSection>
              )}

              {/* Result */}
              {decision.result && (
                <CollapsibleSection title="Résultat" icon={Lightbulb} colorClass="text-blue-400" defaultOpen={true}>
                  <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">{decision.result}</p>
                </CollapsibleSection>
              )}

              {/* Learnings */}
              {decision.learnings && (
                <CollapsibleSection title="Apprentissages" icon={ScrollText} colorClass="text-violet-400">
                  <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">{decision.learnings}</p>
                </CollapsibleSection>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-1">
                {decision.status === "pending" && (
                  <button
                    onClick={() => analyze.mutate({ id: decision.id })}
                    disabled={analyze.isPending}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500/10 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-all active:scale-[0.98] disabled:opacity-50 border border-amber-500/20"
                  >
                    <Sparkles className="w-4 h-4" />
                    {analyzingThis ? "Analyse en cours..." : "Analyser avec l'IA"}
                  </button>
                )}
                <button
                  onClick={() => setShowCreateTasksConfirm(true)}
                  disabled={createTasks.isPending}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-all active:scale-[0.98] disabled:opacity-50 border border-primary/20"
                >
                  <ListChecks className="w-4 h-4" />
                  {createTasks.isPending ? "Création..." : "Créer tâches"}
                </button>
              </div>

              {/* Create tasks confirmation */}
              <AnimatePresence>
                {showCreateTasksConfirm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-secondary/60 rounded-xl p-3 space-y-2">
                      <p className="text-xs text-muted-foreground">Générer des tâches à partir de cette décision ?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleCreateTasks}
                          className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
                        >
                          Confirmer
                        </button>
                        <button
                          onClick={() => setShowCreateTasksConfirm(false)}
                          className="px-4 py-2 rounded-lg bg-background text-muted-foreground text-xs"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── CompareModal ─────────────────────────────────────────────────────────────

function CompareModal({
  decisions,
  onClose,
}: {
  decisions: [Decision, Decision];
  onClose: () => void;
}) {
  const [d1, d2] = decisions;
  const s1 = DECISION_STATUS[d1.status] ?? DECISION_STATUS.pending;
  const s2 = DECISION_STATUS[d2.status] ?? DECISION_STATUS.pending;

  const renderSection = (label: string, v1: React.ReactNode, v2: React.ReactNode) => (
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-secondary/50 rounded-xl p-3">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{label}</div>
        <div className="text-xs text-foreground/80">{v1}</div>
      </div>
      <div className="bg-secondary/50 rounded-xl p-3">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{label}</div>
        <div className="text-xs text-foreground/80">{v2}</div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        onClick={e => e.stopPropagation()}
        className="bg-background rounded-2xl border border-border shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Comparaison de décisions</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {/* Titles */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-secondary rounded-xl p-3">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Décision 1</div>
              <div className="text-sm font-semibold text-foreground">{d1.title}</div>
            </div>
            <div className="bg-secondary rounded-xl p-3">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Décision 2</div>
              <div className="text-sm font-semibold text-foreground">{d2.title}</div>
            </div>
          </div>

          {/* Status */}
          {renderSection("Statut",
            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold", s1.color)}>{s1.label}</span>,
            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold", s2.color)}>{s2.label}</span>
          )}

          {/* Confidence */}
          {renderSection("Score de confiance",
            <div className="flex items-center gap-2"><CircularGauge score={d1.confidenceScore} size={32} /><span className="text-xs font-medium">{d1.confidenceScore}/100</span></div>,
            <div className="flex items-center gap-2"><CircularGauge score={d2.confidenceScore} size={32} /><span className="text-xs font-medium">{d2.confidenceScore}/100</span></div>
          )}

          {/* Date */}
          {renderSection("Date",
            formatDate(d1.createdAt),
            formatDate(d2.createdAt)
          )}

          {/* Context */}
          {(d1.context || d2.context) && renderSection("Contexte",
            d1.context || <span className="text-muted-foreground/50 italic">Aucun</span>,
            d2.context || <span className="text-muted-foreground/50 italic">Aucun</span>
          )}

          {/* Options */}
          {(d1.options?.length || d2.options?.length) && renderSection("Options",
            d1.options?.length ? (
              <ul className="space-y-0.5">
                {d1.options.map((o, i) => <li key={i} className="flex items-start gap-1"><Circle className="w-3 h-3 text-muted-foreground/50 shrink-0 mt-0.5" />{o}</li>)}
              </ul>
            ) : <span className="text-muted-foreground/50 italic">Aucune</span>,
            d2.options?.length ? (
              <ul className="space-y-0.5">
                {d2.options.map((o, i) => <li key={i} className="flex items-start gap-1"><Circle className="w-3 h-3 text-muted-foreground/50 shrink-0 mt-0.5" />{o}</li>)}
              </ul>
            ) : <span className="text-muted-foreground/50 italic">Aucune</span>
          )}

          {/* AI Advice */}
          {(d1.aiAdvice || d2.aiAdvice) && renderSection("Conseil IA",
            d1.aiAdvice || <span className="text-muted-foreground/50 italic">Aucun</span>,
            d2.aiAdvice || <span className="text-muted-foreground/50 italic">Aucun</span>
          )}

          {/* Red Team */}
          {(d1.redTeamAdvice || d2.redTeamAdvice) && renderSection("Red Team",
            d1.redTeamAdvice || <span className="text-muted-foreground/50 italic">Aucun</span>,
            d2.redTeamAdvice || <span className="text-muted-foreground/50 italic">Aucun</span>
          )}

          {/* Advantages */}
          {(d1.advantages?.length || d2.advantages?.length) && renderSection("Avantages",
            d1.advantages?.length ? (
              <ul className="space-y-0.5">{d1.advantages.map((a, i) => <li key={i} className="text-emerald-400">+ {a}</li>)}</ul>
            ) : <span className="text-muted-foreground/50 italic">Aucun</span>,
            d2.advantages?.length ? (
              <ul className="space-y-0.5">{d2.advantages.map((a, i) => <li key={i} className="text-emerald-400">+ {a}</li>)}</ul>
            ) : <span className="text-muted-foreground/50 italic">Aucun</span>
          )}

          {/* Risks */}
          {(d1.risks?.length || d2.risks?.length) && renderSection("Risques",
            d1.risks?.length ? (
              <ul className="space-y-0.5">{d1.risks.map((r, i) => <li key={i} className="text-red-400">− {r}</li>)}</ul>
            ) : <span className="text-muted-foreground/50 italic">Aucun</span>,
            d2.risks?.length ? (
              <ul className="space-y-0.5">{d2.risks.map((r, i) => <li key={i} className="text-red-400">− {r}</li>)}</ul>
            ) : <span className="text-muted-foreground/50 italic">Aucun</span>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── DecisionsTab ─────────────────────────────────────────────────────────────

function DecisionsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  const { data: allDecisions = [], isLoading } = useListDecisions();
  const decisions = statusFilter === "all"
    ? allDecisions
    : allDecisions.filter((d: Decision) => d.status === statusFilter);

  // Group by month for timeline
  const groupedDecisions = useMemo(() => {
    const groups: Record<string, Decision[]> = {};
    decisions.forEach((d: Decision) => {
      const key = formatMonthYear(d.createdAt);
      if (!groups[key]) groups[key] = [];
      groups[key].push(d);
    });
    // Sort months descending
    return Object.entries(groups).sort((a, b) => {
      const da = new Date(a[1][0].createdAt);
      const db = new Date(b[1][0].createdAt);
      return db.getTime() - da.getTime();
    });
  }, [decisions]);

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
      onSuccess: (data: Decision) => {
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

  const createTasks = useCreateTasksFromDecision({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListDecisionsQueryKey() });
        qc.invalidateQueries({ queryKey: getListTasksQueryKey() });
        toast({ title: "Tâches créées ✅" });
      },
    },
  });

  const statuses = ["all", "pending", "analyzing", "decided", "archived"];

  const toggleCompare = (id: number) => {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const compareDecisions = useMemo(() => {
    if (compareIds.length !== 2) return null;
    const d1 = decisions.find((d: Decision) => d.id === compareIds[0]);
    const d2 = decisions.find((d: Decision) => d.id === compareIds[1]);
    if (!d1 || !d2) return null;
    return [d1, d2] as [Decision, Decision];
  }, [compareIds, decisions]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden px-4 pb-4">
      {/* Filter + New + Compare */}
      <div className="flex gap-2 mb-3 shrink-0 items-center">
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
        {compareIds.length > 0 && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={() => setShowCompare(true)}
            disabled={compareIds.length !== 2}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-all",
              compareIds.length === 2
                ? "bg-violet-500/15 text-violet-400 border border-violet-500/30 hover:bg-violet-500/25"
                : "bg-secondary text-muted-foreground border border-transparent"
            )}
          >
            <Scale className="w-3.5 h-3.5" />
            {compareIds.length === 2 ? "Comparer" : `${compareIds.length}/2`}
          </motion.button>
        )}
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouvelle
        </button>
      </div>

      {/* Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mb-3 bg-secondary rounded-xl p-4 space-y-3 shrink-0">
              <textarea
                className="w-full bg-background rounded-lg px-3 py-2 text-base text-foreground placeholder:text-muted-foreground outline-none resize-none"
                style={{ fontSize: "16px" }}
                placeholder="Question de décision *"
                rows={2}
                value={question}
                onChange={e => setQuestion(e.target.value)}
              />
              <textarea
                className="w-full bg-background rounded-lg px-3 py-2 text-base text-foreground placeholder:text-muted-foreground outline-none resize-none"
                style={{ fontSize: "16px" }}
                placeholder="Contexte (optionnel)..."
                rows={2}
                value={context}
                onChange={e => setContext(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (!question.trim()) return;
                    create.mutate({ data: { title: question.trim(), context: context.trim() || undefined } });
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="space-y-4 py-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-3 h-3 rounded-full bg-secondary mt-2 animate-pulse shrink-0" />
                <div className="flex-1 h-24 bg-secondary rounded-xl animate-pulse" />
              </div>
            ))}
          </div>
        ) : decisions.length === 0 ? (
          <EmptyState icon={GitFork} title="Aucune décision" sub="Créez des décisions à analyser par l'IA" />
        ) : (
          <div className="relative py-2">
            {/* Timeline vertical line */}
            <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border/60" />

            {groupedDecisions.map(([month, items]) => (
              <div key={month} className="relative mb-6">
                {/* Month label */}
                <div className="flex items-center gap-3 mb-3 sticky top-0 bg-background/95 backdrop-blur-sm z-10 py-1">
                  <div className="w-3 h-3 rounded-full bg-primary/80 border-2 border-background shadow-sm shrink-0 ml-0.5" />
                  <span className="text-xs font-bold text-foreground uppercase tracking-wider">{month}</span>
                  <div className="flex-1 h-px bg-border/40" />
                  <span className="text-[10px] text-muted-foreground font-medium">{items.length} décision{items.length > 1 ? 's' : ''}</span>
                </div>

                {/* Cards */}
                <div className="space-y-3 pl-8">
                  {items.map((decision: Decision, idx: number) => (
                    <motion.div
                      key={decision.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: idx * 0.08 }}
                    >
                      <DecisionCard
                        decision={decision}
                        isExpanded={expandedId === decision.id}
                        isSelected={compareIds.includes(decision.id)}
                        onToggle={() => setExpandedId(expandedId === decision.id ? null : decision.id)}
                        onSelectForCompare={() => toggleCompare(decision.id)}
                        analyze={analyze}
                        update={update}
                        del={del}
                        createTasks={createTasks}
                      />
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Compare modal */}
      <AnimatePresence>
        {showCompare && compareDecisions && (
          <CompareModal decisions={compareDecisions} onClose={() => { setShowCompare(false); setCompareIds([]); }} />
        )}
      </AnimatePresence>
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

// ─── SystemeTab (Dashboard système enrichi) ───────────────────────────────────

interface SystemMetrics {
  requestsPerMinute: number;
  avgLatencyMs: number;
  errorRate: number;
  aiSuccessRateByProvider: Record<string, { successRate: number; avgLatencyMs: number; calls: number }>;
  toolCallsCount: number;
  activeConversations: number;
}

interface HealthCheck {
  status: "ok" | "degraded" | "error";
  uptime: number;
  version: string;
  checks: Record<string, { status: "ok" | "error"; message?: string }>;
}

// VIS — Validation & Integration System : teste chaque sous-système et affiche
// un rapport PASS/WARN/FAIL (preuve de l'état runtime, Railway inclus).
interface VisCheck { category: string; name: string; status: "PASS" | "WARN" | "FAIL"; detail: string; }
interface VisReport { overall: "PASS" | "WARN" | "FAIL"; summary: { pass: number; warn: number; fail: number }; checks: VisCheck[]; }
function ValidationCard() {
  const [report, setReport] = useState<VisReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [selftest, setSelftest] = useState<VisReport | null>(null);
  const [testing, setTesting] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/system/validate");
      if (res.ok) setReport(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { run(); }, [run]);

  const runSelftest = useCallback(async () => {
    setTesting(true);
    setSelftest(null);
    try {
      const res = await fetch("/api/system/selftest");
      if (res.ok) setSelftest(await res.json());
    } catch { /* ignore */ } finally { setTesting(false); }
  }, []);

  const [scenarios, setScenarios] = useState<{ name: string; status: string; detail: string; durationMs: number }[] | null>(null);
  const [running, setRunning] = useState(false);
  const runScenarios = useCallback(async () => {
    setRunning(true);
    setScenarios(null);
    try {
      const res = await fetch("/api/system/scenarios");
      if (res.ok) { const d = await res.json(); setScenarios(d.scenarios); }
    } catch { /* ignore */ } finally { setRunning(false); }
  }, []);

  const color = (s: string) => s === "PASS" ? "text-emerald-400" : s === "WARN" ? "text-amber-400" : "text-red-400";
  const dot = (s: string) => s === "PASS" ? "bg-emerald-400" : s === "WARN" ? "bg-amber-400" : "bg-red-400";

  return (
    <div className="bg-gradient-to-br from-sky-500/[0.07] to-cyan-500/[0.07] border border-sky-500/20 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🩺</span>
          <span className="text-sm font-semibold text-foreground">Diagnostic plateforme (VIS)</span>
        </div>
        <button onClick={run} disabled={loading} className="text-xs px-2.5 py-1 rounded-lg bg-secondary border border-border text-muted-foreground disabled:opacity-50">
          {loading ? "…" : "Relancer"}
        </button>
      </div>
      {report && (
        <div className="flex items-center gap-3 text-xs">
          <span className={cn("font-bold", color(report.overall))}>{report.overall}</span>
          <span className="text-emerald-400">{report.summary.pass} PASS</span>
          <span className="text-amber-400">{report.summary.warn} WARN</span>
          <span className="text-red-400">{report.summary.fail} FAIL</span>
        </div>
      )}
      <div className="space-y-1.5">
        {report?.checks.map((c, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className={cn("w-2 h-2 rounded-full mt-1 shrink-0", dot(c.status))} />
            <div className="min-w-0">
              <span className="text-foreground">{c.name}</span>
              <span className="text-muted-foreground"> — {c.detail}</span>
            </div>
          </div>
        ))}
        {!report && !loading && <p className="text-xs text-muted-foreground">Diagnostic indisponible.</p>}
      </div>

      {/* Self-test fonctionnel : exécute réellement l'IA + l'encodage vidéo */}
      <div className="pt-2 border-t border-border/50 space-y-2">
        <button onClick={runSelftest} disabled={testing} className="text-xs px-3 py-1.5 rounded-lg bg-sky-500/15 text-sky-400 border border-sky-500/25 disabled:opacity-50">
          {testing ? "Test en cours (IA + vidéo)…" : "▶ Test fonctionnel réel (IA + encodage vidéo)"}
        </button>
        {selftest?.checks.map((c, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className={cn("w-2 h-2 rounded-full mt-1 shrink-0", dot(c.status))} />
            <div className="min-w-0"><span className="text-foreground">{c.name}</span><span className="text-muted-foreground"> — {c.detail}</span></div>
          </div>
        ))}
      </div>

      {/* End-to-End Scenarios : exécute réellement chaque parcours utilisateur */}
      <div className="pt-2 border-t border-border/50 space-y-2">
        <button onClick={runScenarios} disabled={running} className="text-xs px-3 py-1.5 rounded-lg bg-violet-500/15 text-violet-400 border border-violet-500/25 disabled:opacity-50">
          {running ? "Parcours en cours (1-2 min : IA + vidéo)…" : "▶ Scénarios bout-en-bout (parcours réels)"}
        </button>
        {scenarios && (
          <div className="space-y-1">
            {scenarios.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-xs gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", dot(s.status))} />
                  <span className="text-foreground truncate">{s.name}</span>
                </div>
                <span className={cn("font-semibold shrink-0", color(s.status))}>{s.status} <span className="text-muted-foreground font-normal">{(s.durationMs / 1000).toFixed(1)}s</span></span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Cerveau autonome — déclenche un cycle de l'organisation d'agents (Chief of
// Staff + Council + Red Team + Planner + Reflection) sur le projet.
interface ContinueResult {
  synthesis?: string;
  analysis?: { state?: string; priorities?: string[] } | null;
  plan?: { steps?: { title?: string; role?: string; rationale?: string }[] } | null;
  architecture?: { constraints?: string[]; objections?: string[]; approved?: boolean } | null;
  redTeam?: { attacks?: string[]; unproven?: string[]; verdict?: string } | null;
  validation?: { checklist?: string[]; humanGates?: string[]; readyToExecute?: boolean } | null;
}
function ContinueTamsCard() {
  const { toast } = useToast();
  const [goal, setGoal] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ContinueResult | null>(null);

  async function run() {
    if (running) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/agents/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: goal.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Cycle échoué", description: data.detail || data.error || `HTTP ${res.status}`, variant: "destructive" });
      } else {
        setResult(data);
        toast({ title: "Cycle autonome terminé 🧠", description: `${data.agentsConsulted ?? 0} agents consultés` });
      }
    } catch {
      toast({ title: "Cycle échoué", description: "Vérifie ta connexion.", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="bg-gradient-to-br from-indigo-500/[0.08] to-violet-500/[0.08] border border-indigo-500/20 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-base">🧠</span>
        <span className="text-sm font-semibold text-foreground">Cerveau autonome — « Continue TAMS »</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        L'organisation d'agents (Chief of Staff · Council multi-agents · Red Team · Planner · Reflection)
        analyse le projet, débat, critique et propose la prochaine étape. Le résultat est mémorisé (Décisions).
      </p>
      <input
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        placeholder="Objectif précis (laisse vide = analyse autonome)"
        className="w-full bg-background rounded-lg px-3 py-2 text-sm border border-border outline-none focus:border-indigo-500/40"
        style={{ fontSize: "16px" }}
      />
      <button
        onClick={run}
        disabled={running}
        className="w-full py-2.5 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-sm font-medium disabled:opacity-50 active:scale-[0.99] transition-all"
      >
        {running ? "Les agents réfléchissent (10-30s)…" : "Lancer un cycle autonome"}
      </button>
      {result && (
        <div className="space-y-3 text-xs pt-1">
          {result.synthesis && (
            <div>
              <div className="font-semibold text-foreground mb-1">🎯 Synthèse (Chief of Staff)</div>
              <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">{result.synthesis}</p>
            </div>
          )}
          {result.analysis?.priorities && result.analysis.priorities.length > 0 && (
            <div>
              <div className="font-semibold text-foreground mb-1">📊 Priorités</div>
              <ul className="text-muted-foreground space-y-0.5 list-disc list-inside">
                {result.analysis.priorities.slice(0, 6).map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}
          {result.plan?.steps && result.plan.steps.length > 0 && (
            <div>
              <div className="font-semibold text-emerald-400 mb-1">📋 Plan (Mission Planner)</div>
              <ol className="text-muted-foreground space-y-1 list-decimal list-inside">
                {result.plan.steps.slice(0, 8).map((s, i) => (
                  <li key={i}><span className="text-foreground">{s.title}</span>{s.role ? <span className="text-violet-400"> · {s.role}</span> : null}</li>
                ))}
              </ol>
            </div>
          )}
          {result.architecture?.objections && result.architecture.objections.length > 0 && (
            <div>
              <div className="font-semibold text-amber-400 mb-1">🏛️ Architect {result.architecture.approved === false ? "(veto)" : ""}</div>
              <ul className="text-muted-foreground space-y-0.5 list-disc list-inside">
                {result.architecture.objections.slice(0, 5).map((o, i) => <li key={i}>{o}</li>)}
              </ul>
            </div>
          )}
          {result.redTeam && (
            <div>
              <div className="font-semibold text-red-400 mb-1">🔴 Red Team — {result.redTeam.verdict ?? "—"}</div>
              <ul className="text-muted-foreground space-y-0.5 list-disc list-inside">
                {(result.redTeam.attacks ?? []).slice(0, 5).map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}
          {result.validation?.humanGates && result.validation.humanGates.length > 0 && (
            <div>
              <div className="font-semibold text-sky-400 mb-1">🔐 Portes de validation humaine</div>
              <ul className="text-muted-foreground space-y-0.5 list-disc list-inside">
                {result.validation.humanGates.slice(0, 5).map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Connecteur Shopify : import des produits dans les Assets (gratuit, jeton app privée).
function ShopifyImportCard() {
  const { toast } = useToast();
  const [shop, setShop] = useState("");
  const [token, setToken] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; total: number } | null>(null);

  async function runImport() {
    if (!shop.trim() || !token.trim() || importing) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await fetch("/api/integrations/shopify/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop: shop.trim(), token: token.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Import échoué", description: data.hint || data.error || `HTTP ${res.status}`, variant: "destructive" });
      } else {
        setResult({ imported: data.imported, total: data.total });
        toast({ title: `${data.imported} produit(s) importé(s)`, description: "Disponibles dans tes Assets (Studio)." });
      }
    } catch {
      toast({ title: "Import échoué", description: "Vérifie ta connexion.", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="bg-secondary rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-base">🛍️</span>
        <span className="text-sm font-semibold text-foreground">Connecter Shopify</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Importe tes produits (image + description) dans tes Assets. Dans Shopify : crée une
        <span className="font-medium"> app personnalisée</span> avec le scope <span className="font-mono">read_products</span>, puis colle le jeton <span className="font-mono">shpat_…</span>.
      </p>
      <input
        value={shop}
        onChange={(e) => setShop(e.target.value)}
        placeholder="ma-boutique.myshopify.com"
        autoCapitalize="off"
        autoCorrect="off"
        className="w-full bg-background rounded-lg px-3 py-2 text-sm border border-border outline-none focus:border-primary/40"
        style={{ fontSize: "16px" }}
      />
      <input
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="shpat_..."
        type="password"
        className="w-full bg-background rounded-lg px-3 py-2 text-sm border border-border outline-none focus:border-primary/40"
        style={{ fontSize: "16px" }}
      />
      <button
        onClick={runImport}
        disabled={importing || !shop.trim() || !token.trim()}
        className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 active:scale-[0.99] transition-transform"
      >
        {importing ? "Import en cours..." : "Importer mes produits"}
      </button>
      {result && (
        <p className="text-xs text-emerald-400">
          ✅ {result.imported}/{result.total} produit(s) importé(s) → Studio → Assets.
        </p>
      )}
    </div>
  );
}

function SystemeTab() {
  const { toast } = useToast();
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useGetSystemStats();
  const { data: audit, isLoading: auditLoading, refetch: refetchAudit } = useGetSystemAudit({ limit: 20 });
  const exportData = useExportSystemData({
    query: { enabled: false } as { enabled: boolean; queryKey: readonly unknown[] },
  });

  // Nouveaux états pour les métriques temps réel
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<Array<{ time: string; rpm: number; latency: number }>>([]);
  const [errors, setErrors] = useState<Array<{ method: string; url: string; status: number; time: string }>>([]);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [loadingHealth, setLoadingHealth] = useState(false);

  const fetchMetrics = async () => {
    setLoadingMetrics(true);
    try {
      const res = await fetch("/api/system/metrics");
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
        setMetricsHistory(prev => {
          const now = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          const next = [...prev, { time: now, rpm: data.requestsPerMinute ?? 0, latency: Math.round(data.avgLatencyMs ?? 0) }];
          return next.slice(-20);
        });
      }
    } catch (_e) {
      // ignore
    } finally {
      setLoadingMetrics(false);
    }
  };

  const fetchHealth = async () => {
    setLoadingHealth(true);
    try {
      const res = await fetch("/api/healthz/detailed");
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch (_e) {
      // ignore
    } finally {
      setLoadingHealth(false);
    }
  };

  const fetchErrors = async () => {
    try {
      const res = await fetch("/api/activity?limit=50");
      if (res.ok) {
        const data = await res.json();
        const errorItems = (data as Array<{ description?: string; title?: string; createdAt?: string }>)
          .filter((item) => item.description?.includes("Status: 5") || item.title?.includes("5xx"))
          .slice(0, 10)
          .map((item) => {
            const match = item.description?.match(/Status:\s*(\d+)/);
            const status = match ? parseInt(match[1], 10) : 500;
            const methodMatch = item.title?.match(/Request:\s*(\w+)\s/);
            const method = methodMatch ? methodMatch[1] : "GET";
            const urlMatch = item.title?.match(/Request:\s*\w+\s(.+)/);
            const url = urlMatch ? urlMatch[1] : "";
            return { method, url, status, time: timeAgo(item.createdAt ?? "") };
          });
        setErrors(errorItems);
      }
    } catch (_e) {
      // ignore
    }
  };

  // Polling toutes les 30s
  useEffect(() => {
    fetchMetrics();
    fetchHealth();
    fetchErrors();
    const interval = setInterval(() => {
      fetchMetrics();
      fetchHealth();
      fetchErrors();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

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
    } catch (_e) {
      toast({ title: "Erreur export", description: "Impossible d'exporter les données" });
    }
  };

  const handleExportLogs = async () => {
    try {
      const [activityRes, metricsRes, healthRes] = await Promise.all([
        fetch("/api/activity?limit=200"),
        fetch("/api/system/metrics"),
        fetch("/api/healthz/detailed"),
      ]);
      const activity = activityRes.ok ? await activityRes.json() : [];
      const metricsData = metricsRes.ok ? await metricsRes.json() : {};
      const healthData = healthRes.ok ? await healthRes.json() : {};
      const payload = {
        exportedAt: new Date().toISOString(),
        activity,
        metrics: metricsData,
        health: healthData,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tams-logs-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Logs exportés" });
    } catch (_e) {
      toast({ title: "Erreur export logs", description: "Impossible d'exporter les logs" });
    }
  };

  const statCards = stats ? [
    { label: "Tâches", value: (stats as SystemStats & { taskCount?: number }).taskCount ?? (stats as SystemStats & { tables?: Record<string, number> }).tables?.tasks ?? 0,       icon: CheckSquare, color: "text-blue-400" },
    { label: "Projets", value: (stats as SystemStats & { projectCount?: number }).projectCount ?? (stats as SystemStats & { tables?: Record<string, number> }).tables?.projects ?? 0,   icon: FolderOpen,  color: "text-violet-400" },
    { label: "Contacts", value: (stats as SystemStats & { contactCount?: number }).contactCount ?? (stats as SystemStats & { tables?: Record<string, number> }).tables?.contacts ?? 0,  icon: Users,       color: "text-emerald-400" },
    { label: "Mémoires", value: (stats as SystemStats & { memoryCount?: number }).memoryCount ?? (stats as SystemStats & { tables?: Record<string, number> }).tables?.memories ?? 0,   icon: Brain,       color: "text-amber-400" },
    { label: "Décisions", value: (stats as SystemStats & { decisionCount?: number }).decisionCount ?? (stats as SystemStats & { tables?: Record<string, number> }).tables?.decisions ?? 0, icon: GitFork,    color: "text-rose-400" },
    { label: "Assets", value: (stats as SystemStats & { assetCount?: number }).assetCount ?? (stats as SystemStats & { tables?: Record<string, number> }).tables?.assets ?? 0,      icon: Layers,      color: "text-cyan-400" },
  ] : [];

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
      {/* VIS — Diagnostic plateforme */}
      <ValidationCard />
      {/* Cerveau autonome */}
      <ContinueTamsCard />
      {/* Connecteur Shopify */}
      <ShopifyImportCard />
      {/* Actions header */}
      <div className="flex items-center justify-between shrink-0">
        <span className="text-xs font-medium text-muted-foreground">Observabilité</span>
        <div className="flex gap-2">
          <button
            onClick={() => { refetchStats(); refetchAudit(); fetchMetrics(); fetchHealth(); fetchErrors(); }}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-[0.98]"
            title="Actualiser"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleExport}
            disabled={exportData.isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-medium hover:bg-secondary/80 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            {exportData.isFetching ? "Export..." : "Exporter"}
          </button>
          <button
            onClick={handleExportLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-all active:scale-[0.98]"
          >
            <FileText className="w-3.5 h-3.5" />
            Logs
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

      {/* Métriques temps réel */}
      <div className="bg-secondary rounded-xl p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-foreground">Métriques temps réel</div>
          {loadingMetrics && <RefreshCw className="w-3 h-3 text-muted-foreground animate-spin" />}
        </div>
        {metrics ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <MetricCard label="Req/min" value={metrics.requestsPerMinute} icon={Activity} color="text-blue-400" />
              <MetricCard label="Latence" value={`${Math.round(metrics.avgLatencyMs)}ms`} icon={Clock} color="text-amber-400" />
              <MetricCard label="Erreurs" value={`${(metrics.errorRate * 100).toFixed(1)}%`} icon={ShieldAlert} color={metrics.errorRate > 0.05 ? "text-rose-400" : "text-emerald-400"} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <MetricCard label="Appels outils" value={metrics.toolCallsCount} icon={Zap} color="text-violet-400" />
              <MetricCard label="Conversations" value={metrics.activeConversations} icon={Users} color="text-cyan-400" />
            </div>
            {/* Graphique requêtes */}
            {metricsHistory.length > 1 && (
              <div className="bg-background rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground mb-1">Requêtes / min</div>
                <div className="h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metricsHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="time" tick={{ fontSize: 8 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 8 }} stroke="#94a3b8" />
                      <Tooltip contentStyle={{ fontSize: 10, background: "#0f172a", border: "1px solid #334155" }} />
                      <Bar dataKey="rpm" fill="#60a5fa" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            {/* Graphique latence */}
            {metricsHistory.length > 1 && (
              <div className="bg-background rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground mb-1">Latence (ms)</div>
                <div className="h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={metricsHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="time" tick={{ fontSize: 8 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 8 }} stroke="#94a3b8" />
                      <Tooltip contentStyle={{ fontSize: 10, background: "#0f172a", border: "1px solid #334155" }} />
                      <Line type="monotone" dataKey="latency" stroke="#f59e0b" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            {/* Taux de succès IA par fournisseur */}
            {Object.keys(metrics.aiSuccessRateByProvider).length > 0 && (
              <div className="bg-background rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground mb-1">IA par fournisseur</div>
                <div className="space-y-1.5">
                  {Object.entries(metrics.aiSuccessRateByProvider).map(([provider, data]) => (
                    <div key={provider} className="flex items-center justify-between text-xs">
                      <span className="text-foreground capitalize">{provider}</span>
                      <div className="flex items-center gap-2">
                        <span className={cn("text-[10px]", data.successRate > 0.9 ? "text-emerald-400" : data.successRate > 0.7 ? "text-amber-400" : "text-rose-400")}>
                          {(data.successRate * 100).toFixed(0)}%
                        </span>
                        <span className="text-[10px] text-muted-foreground">{data.calls} appels</span>
                        <span className="text-[10px] text-muted-foreground">{Math.round(data.avgLatencyMs)}ms</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground text-center py-4">Métriques indisponibles</div>
        )}
      </div>

      {/* Statut des services */}
      <div className="bg-secondary rounded-xl p-3.5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-foreground">Statut des services</div>
          {loadingHealth && <RefreshCw className="w-3 h-3 text-muted-foreground animate-spin" />}
        </div>
        {health ? (
          <div className="space-y-1.5">
            <ServiceStatusRow
              name="Base de données"
              status={health.checks?.database?.status === "ok"}
              message={health.checks?.database?.message}
              icon={Server}
            />
            <ServiceStatusRow
              name="IA"
              status={health.checks?.ai?.status === "ok"}
              message={health.checks?.ai?.message}
              icon={Brain}
            />
            <ServiceStatusRow
              name="Disque"
              status={health.checks?.disk?.status === "ok"}
              message={health.checks?.disk?.message}
              icon={HardDrive}
            />
            <ServiceStatusRow
              name="Mémoire"
              status={health.checks?.memory?.status === "ok"}
              message={health.checks?.memory?.message}
              icon={Cpu}
            />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/50">
              <span>Uptime: {Math.floor(health.uptime / 60)}min</span>
              <span>Version: {health.version}</span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground text-center py-4">Statut indisponible</div>
        )}
      </div>

      {/* Dernières erreurs */}
      <div className="bg-secondary rounded-xl p-3.5 space-y-2">
        <div className="text-xs font-semibold text-foreground">Dernières erreurs</div>
        {errors.length > 0 ? (
          <div className="space-y-1.5">
            {errors.map((err, i) => (
              <div key={i} className="flex items-center gap-2 text-xs bg-background rounded-lg p-2">
                <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-foreground truncate">{err.method} {err.url}</div>
                  <div className="text-[10px] text-muted-foreground">Status {err.status}</div>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">{err.time}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground text-center py-2">Aucune erreur récente</div>
        )}
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
        ) : !audit || audit.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4">Aucune activité récente</div>
        ) : (
          <div className="space-y-2">
            {audit.map((item) => (
              <div key={item.id} className="flex items-center gap-2.5">
                <div className={cn(
                  "w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0",
                  ACTIVITY_COLORS[item.type] ?? "bg-secondary text-muted-foreground"
                )}>
                  {(item.type?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">{item.title ?? (item as { action?: string }).action}</div>
                  {item.description && (
                    <div className="text-[10px] text-muted-foreground truncate">{item.description}</div>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground shrink-0">
                  {timeAgo(item.createdAt ?? (item as { created_at?: string }).created_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }>; color: string }) {
  return (
    <div className="bg-background rounded-lg p-2 flex items-center gap-2">
      <Icon className={cn("w-3.5 h-3.5 shrink-0", color)} />
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        <div className="text-xs font-bold text-foreground truncate">{value}</div>
      </div>
    </div>
  );
}

function ServiceStatusRow({ name, status, message, icon: Icon }: { name: string; status: boolean; message?: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-2">
        <Icon className={cn("w-3.5 h-3.5", status ? "text-emerald-400" : "text-rose-400")} />
        <span className="text-foreground">{name}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {status ? <Wifi className="w-3 h-3 text-emerald-400" /> : <WifiOff className="w-3 h-3 text-rose-400" />}
        <span className={cn("text-[10px]", status ? "text-emerald-400" : "text-rose-400")}>
          {status ? "OK" : "Erreur"}
        </span>
        {message && <span className="text-[10px] text-muted-foreground hidden sm:inline">({message})</span>}
      </div>
    </div>
  );
}

// ─── Workflows Tab ────────────────────────────────────────────────────────────

function WorkflowsTab() {
  const { data, isLoading } = useListWorkflows();
  const { data: historyData } = useWorkflowHistory();
  const toggle = useToggleWorkflow();
  const run = useRunWorkflow();
  const create = useCreateWorkflow();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [newRule, setNewRule] = useState({ id: "", name: "", description: "", trigger: "scheduled" });

  const rules = data?.data ?? [];
  const history = historyData?.data ?? [];

  const handleToggle = (rule: WorkflowRuleItem) => {
    toggle.mutate({ id: rule.id, enabled: !rule.enabled }, {
      onSuccess: () => toast({ title: rule.enabled ? "Règle désactivée" : "Règle activée" }),
      onError: (err) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    });
  };

  const handleRun = (id: string) => {
    run.mutate(id, {
      onSuccess: (res) => toast({ title: "Exécution", description: res.data.message }),
      onError: (err) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRule.id || !newRule.name) return;
    create.mutate(newRule, {
      onSuccess: () => {
        toast({ title: "Règle créée" });
        setShowCreate(false);
        setNewRule({ id: "", name: "", description: "", trigger: "scheduled" });
      },
      onError: (err) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {rules.length} règle{rules.length > 1 ? "s" : ""} · {rules.filter(r => r.enabled).length} active{rules.filter(r => r.enabled).length > 1 ? "s" : ""}
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouvelle règle
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="bg-secondary rounded-xl p-4 space-y-3">
          <div className="text-xs font-semibold text-foreground">Nouvelle règle personnalisée</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={newRule.id}
              onChange={e => setNewRule(r => ({ ...r, id: e.target.value }))}
              placeholder="ID (ex: my_custom_rule)"
              className="px-3 py-2 bg-background rounded-lg text-xs text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary"
              required
              pattern="[a-z0-9_]+"
            />
            <input
              value={newRule.name}
              onChange={e => setNewRule(r => ({ ...r, name: e.target.value }))}
              placeholder="Nom"
              className="px-3 py-2 bg-background rounded-lg text-xs text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary"
              required
            />
          </div>
          <input
            value={newRule.description}
            onChange={e => setNewRule(r => ({ ...r, description: e.target.value }))}
            placeholder="Description"
            className="w-full px-3 py-2 bg-background rounded-lg text-xs text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <select
            value={newRule.trigger}
            onChange={e => setNewRule(r => ({ ...r, trigger: e.target.value }))}
            className="px-3 py-2 bg-background rounded-lg text-xs text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="task_created">task_created</option>
            <option value="task_completed">task_completed</option>
            <option value="project_created">project_created</option>
            <option value="contact_added">contact_added</option>
            <option value="decision_created">decision_created</option>
            <option value="memory_created">memory_created</option>
            <option value="deadline_approaching">deadline_approaching</option>
            <option value="scheduled">scheduled</option>
          </select>
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-opacity">
              Créer
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-1.5 bg-background text-foreground rounded-lg text-xs border border-border hover:bg-secondary transition-colors">
              Annuler
            </button>
          </div>
        </form>
      )}

      {/* Rules list */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-secondary rounded-xl animate-pulse" />)}
          </div>
        ) : rules.length === 0 ? (
          <EmptyState icon={Workflow} title="Aucune règle" sub="Les règles workflows apparaîtront ici" />
        ) : (
          rules.map(rule => (
            <div key={rule.id} className="bg-secondary rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center",
                    rule.enabled ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground"
                  )}>
                    {rule.isTemporal ? <Clock className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-foreground">{rule.name}</div>
                    <div className="text-[10px] text-muted-foreground">{rule.id} · {rule.trigger}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleRun(rule.id)}
                    disabled={run.isPending}
                    className="p-1.5 rounded-lg bg-background text-foreground hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50"
                    title="Exécuter maintenant"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleToggle(rule)}
                    className={cn(
                      "p-1.5 rounded-lg transition-colors",
                      rule.enabled
                        ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                        : "bg-background text-muted-foreground hover:bg-primary/10 hover:text-primary"
                    )}
                    title={rule.enabled ? "Désactiver" : "Activer"}
                  >
                    {rule.enabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              {rule.description && (
                <div className="text-[10px] text-muted-foreground pl-9.5">{rule.description}</div>
              )}
              <div className="flex items-center gap-3 pl-9.5 text-[10px] text-muted-foreground">
                {rule.lastRun ? (
                  <span className="flex items-center gap-1">
                    <History className="w-3 h-3" />
                    Dernière exécution : {timeAgo(rule.lastRun)}
                    {rule.lastSuccess !== null && (
                      <span className={rule.lastSuccess ? "text-emerald-400" : "text-rose-400"}>
                        {rule.lastSuccess ? " ✓" : " ✗"}
                      </span>
                    )}
                  </span>
                ) : (
                  <span>Jamais exécutée</span>
                )}
                <span>· {rule.runCount} exécution{rule.runCount > 1 ? "s" : ""}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* History */}
      <div className="bg-secondary rounded-xl p-3.5 space-y-2">
        <div className="flex items-center gap-2">
          <History className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">Historique des exécutions</span>
        </div>
        {history.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4">Aucune exécution enregistrée</div>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {history.map(h => (
              <div key={h.id} className="flex items-center gap-2 text-xs bg-background rounded-lg p-2">
                <div className={cn("w-2 h-2 rounded-full shrink-0", h.success ? "bg-emerald-400" : "bg-rose-400")} />
                <div className="flex-1 min-w-0">
                  <div className="text-foreground truncate">{h.ruleName}</div>
                  <div className="text-[10px] text-muted-foreground">{h.trigger}</div>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(h.executedAt)}</span>
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
