import { useState } from "react";
import {
  useListMemories, useCreateMemory, useDeleteMemory,
  useListDecisions, useCreateDecision, useUpdateDecision, useDeleteDecision,
  useAnalyzeDecision,
  getListMemoriesQueryKey, getListDecisionsQueryKey, getGetDecisionQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Brain, GitFork, Plus, Search, Trash2, Zap, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type Tab = "memoire" | "decisions";

const MEMORY_TYPES = [
  { value: "person", label: "Personne", color: "text-blue-400 bg-blue-500/10" },
  { value: "project", label: "Projet", color: "text-violet-400 bg-violet-500/10" },
  { value: "company", label: "Entreprise", color: "text-emerald-400 bg-emerald-500/10" },
  { value: "decision", label: "Décision", color: "text-amber-400 bg-amber-500/10" },
  { value: "note", label: "Note", color: "text-cyan-400 bg-cyan-500/10" },
  { value: "goal", label: "Objectif", color: "text-pink-400 bg-pink-500/10" },
  { value: "event", label: "Événement", color: "text-orange-400 bg-orange-500/10" },
];

const DECISION_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "En attente", color: "text-muted-foreground bg-secondary" },
  analyzing: { label: "Analyse...", color: "text-amber-400 bg-amber-500/10" },
  decided: { label: "Décidé", color: "text-emerald-400 bg-emerald-500/10" },
  archived: { label: "Archivé", color: "text-muted-foreground bg-secondary" },
};

export default function Systeme() {
  const [tab, setTab] = useState<Tab>("memoire");

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 pt-6 pb-4 shrink-0">
        <h1 className="text-xl font-semibold text-foreground tracking-tight mb-4">Système</h1>
        <div className="flex gap-1 bg-secondary rounded-xl p-1">
          {[{ id: "memoire" as Tab, label: "Mémoire", icon: Brain }, { id: "decisions" as Tab, label: "Decisions OS", icon: GitFork }].map(t => (
            <button
              key={t.id}
              data-testid={`tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all", tab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-28 md:pb-6">
        {tab === "memoire" ? <MemoireTab /> : <DecisionsTab />}
      </div>
    </div>
  );
}

function MemoireTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("note");
  const [content, setContent] = useState("");

  const { data: memories = [], isLoading } = useListMemories(
    search || typeFilter !== "all" ? { q: search || undefined, type: typeFilter !== "all" ? typeFilter as any : undefined } : {}
  );

  const create = useCreateMemory({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListMemoriesQueryKey() }); setTitle(""); setContent(""); setShowForm(false); toast({ title: "Mémoire enregistrée" }); } } });
  const del = useDeleteMemory({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListMemoriesQueryKey() }); toast({ title: "Mémoire supprimée" }); } } });

  const getTypeInfo = (t: string) => MEMORY_TYPES.find(x => x.value === t) ?? { label: t, color: "text-muted-foreground bg-secondary" };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 bg-input border border-border rounded-xl px-3 py-2.5 focus-within:ring-1 focus-within:ring-ring">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            data-testid="input-memory-search"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            placeholder="Rechercher dans la mémoire..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button data-testid="button-new-memory" onClick={() => setShowForm(!showForm)} className="px-3 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-medium hover:opacity-90">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        <button onClick={() => setTypeFilter("all")} className={cn("px-3 py-1 rounded-full text-xs font-medium shrink-0 transition-colors", typeFilter === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>Tous</button>
        {MEMORY_TYPES.map(t => (
          <button key={t.value} onClick={() => setTypeFilter(t.value)} className={cn("px-3 py-1 rounded-full text-xs font-medium shrink-0 transition-colors", typeFilter === t.value ? t.color : "bg-secondary text-muted-foreground hover:text-foreground")}>{t.label}</button>
        ))}
      </div>

      {showForm && (
        <div className="bg-card border border-card-border rounded-xl p-4 animate-fade-in space-y-2">
          <input data-testid="input-memory-title" autoFocus className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring" placeholder="Titre..." value={title} onChange={e => setTitle(e.target.value)} />
          <div className="flex flex-wrap gap-1.5">
            {MEMORY_TYPES.map(t => (
              <button key={t.value} onClick={() => setType(t.value)} className={cn("px-2.5 py-1 rounded-full text-xs font-medium transition-colors", type === t.value ? t.color : "bg-secondary text-muted-foreground")}>{t.label}</button>
            ))}
          </div>
          <textarea data-testid="input-memory-content" rows={3} className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring resize-none" placeholder="Contenu..." value={content} onChange={e => setContent(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-lg border border-border text-xs text-muted-foreground">Annuler</button>
            <button data-testid="button-save-memory" disabled={!title.trim() || create.isPending} onClick={() => create.mutate({ data: { title: title.trim(), type: type as any, content: content.trim() || undefined } })} className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50">Enregistrer</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-card rounded-xl animate-pulse" />)}</div>
      ) : memories.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Aucune mémoire trouvée</div>
      ) : (
        <div className="space-y-2 stagger">
          {memories.map(mem => {
            const t = getTypeInfo(mem.type);
            return (
              <div key={mem.id} data-testid={`memory-item-${mem.id}`} className="bg-card border border-card-border rounded-xl p-4 group">
                <div className="flex items-start gap-3">
                  <div className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 mt-0.5", t.color)}>{t.label}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">{mem.title}</div>
                    {mem.content && <div className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{mem.content}</div>}
                    {(mem.tags as string[]).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(mem.tags as string[]).map(tag => (
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-secondary text-muted-foreground rounded-full">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button data-testid={`button-delete-memory-${mem.id}`} onClick={() => del.mutate({ id: mem.id })} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-destructive text-muted-foreground transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DecisionsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: decisions = [], isLoading } = useListDecisions();
  const create = useCreateDecision({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListDecisionsQueryKey() }); setTitle(""); setContext(""); setShowForm(false); toast({ title: "Décision créée" }); } } });
  const del = useDeleteDecision({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListDecisionsQueryKey() }); toast({ title: "Décision supprimée" }); } } });
  const analyze = useAnalyzeDecision({
    mutation: {
      onSuccess: (d) => {
        qc.invalidateQueries({ queryKey: getListDecisionsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetDecisionQueryKey(d.id) });
        setExpandedId(d.id);
        toast({ title: "Analyse IA terminée" });
      },
      onError: () => toast({ title: "Erreur lors de l'analyse", variant: "destructive" }),
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button data-testid="button-new-decision" onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90">
          <Plus className="w-3.5 h-3.5" />
          Nouvelle décision
        </button>
      </div>

      {showForm && (
        <div className="bg-card border border-card-border rounded-xl p-4 animate-fade-in space-y-2">
          <input data-testid="input-decision-title" autoFocus className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring" placeholder="Titre de la décision..." value={title} onChange={e => setTitle(e.target.value)} />
          <textarea data-testid="input-decision-context" rows={3} className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring resize-none" placeholder="Contexte et enjeux..." value={context} onChange={e => setContext(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-lg border border-border text-xs text-muted-foreground">Annuler</button>
            <button data-testid="button-save-decision" disabled={!title.trim() || create.isPending} onClick={() => create.mutate({ data: { title: title.trim(), context: context.trim() || undefined } })} className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50">Créer</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[...Array(2)].map((_, i) => <div key={i} className="h-28 bg-card rounded-xl animate-pulse" />)}</div>
      ) : decisions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Aucune décision</div>
      ) : (
        <div className="space-y-2 stagger">
          {decisions.map(d => {
            const st = DECISION_STATUS[d.status] ?? DECISION_STATUS.pending;
            const expanded = expandedId === d.id;
            return (
              <div key={d.id} data-testid={`decision-item-${d.id}`} className="bg-card border border-card-border rounded-xl overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Confidence ring */}
                    <div className="relative w-12 h-12 shrink-0">
                      <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15" fill="none" stroke="hsl(var(--secondary))" strokeWidth="3" />
                        <circle cx="18" cy="18" r="15" fill="none" stroke="hsl(var(--primary))" strokeWidth="3"
                          strokeDasharray={`${(d.confidenceScore / 100) * 94.2} 94.2`}
                          strokeLinecap="round" className="transition-all duration-700"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[11px] font-bold text-foreground">{d.confidenceScore}</span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">{d.title}</span>
                        <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", st.color)}>{st.label}</span>
                      </div>
                      {d.context && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{d.context}</div>}
                    </div>
                    <button data-testid={`button-delete-decision-${d.id}`} onClick={() => del.mutate({ id: d.id })} className="p-1 rounded hover:text-destructive text-muted-foreground transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <button
                      data-testid={`button-analyze-decision-${d.id}`}
                      disabled={analyze.isPending}
                      onClick={() => analyze.mutate({ id: d.id })}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
                    >
                      <Zap className="w-3 h-3" />
                      {analyze.isPending ? "Analyse..." : "Analyser avec l'IA"}
                    </button>
                    <button
                      data-testid={`button-expand-decision-${d.id}`}
                      onClick={() => setExpandedId(expanded ? null : d.id)}
                      className="flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {expanded ? "Réduire" : "Détails"}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-card-border animate-fade-in">
                    {d.aiAdvice && (
                      <div className="px-4 py-3 border-b border-card-border">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Zap className="w-3.5 h-3.5 text-primary" />
                          <span className="text-xs font-semibold text-foreground">Avis IA</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{d.aiAdvice}</p>
                      </div>
                    )}
                    {d.redTeamAdvice && (
                      <div className="px-4 py-3">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="w-3.5 h-3.5 text-xs font-bold text-red-400 flex items-center">RT</span>
                          <span className="text-xs font-semibold text-foreground">Red Team</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{d.redTeamAdvice}</p>
                      </div>
                    )}
                    {!d.aiAdvice && !d.redTeamAdvice && (
                      <div className="px-4 py-3 text-xs text-muted-foreground text-center">Cliquez "Analyser avec l'IA" pour obtenir une analyse</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
