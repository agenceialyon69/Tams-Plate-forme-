import { useState, useEffect } from "react";
import {
  Users, Send, Loader2, Sparkles, Wrench, ChevronRight, AlertCircle,
  MessageSquare, GitBranch, ArrowRightLeft, Plus, Trash2, Play,
  Lightbulb, CheckCircle2, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? "";

interface AgentMeta {
  id: string;
  name: string;
  role: string;
  responsibilities: string[];
  tools: string[];
  canDelegate: boolean;
}

interface RunResult {
  agent: string;
  name: string;
  output: string;
  toolsUsed: string[];
}

interface Orchestration {
  plan: { rationale: string; delegations: { agent: string; subtask: string }[] };
  results: RunResult[];
  synthesis: string;
}

interface CouncilResult {
  query: string;
  opinions: RunResult[];
  synthesis: string;
  recommendation: string;
}

interface PipelineStep {
  agent: string;
  name: string;
  input: string;
  output: string;
  toolsUsed: string[];
}

interface PipelineResult {
  query: string;
  steps: PipelineStep[];
  finalOutput: string;
}

interface DelegationResult {
  source: string;
  target: string;
  query: string;
  response: RunResult;
}

type TabMode = "chat" | "council" | "pipeline" | "delegate";

export default function Agents() {
  const { toast } = useToast();
  const [agents, setAgents] = useState<AgentMeta[]>([]);
  const [activeTab, setActiveTab] = useState<TabMode>("chat");

  // ─── Chat / Orchestration ───
  const [task, setTask] = useState("");
  const [target, setTarget] = useState<string>("orchestrate");
  const [running, setRunning] = useState(false);
  const [orchestration, setOrchestration] = useState<Orchestration | null>(null);
  const [single, setSingle] = useState<RunResult | null>(null);

  // ─── Council ───
  const [councilQuery, setCouncilQuery] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [councilResult, setCouncilResult] = useState<CouncilResult | null>(null);
  const [councilRunning, setCouncilRunning] = useState(false);

  // ─── Pipeline ───
  const [pipelineTasks, setPipelineTasks] = useState<Array<{ agent: string; query: string }>>([
    { agent: "", query: "" },
  ]);
  const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(null);
  const [pipelineRunning, setPipelineRunning] = useState(false);

  // ─── Delegate ───
  const [delegateSource, setDelegateSource] = useState("");
  const [delegateTarget, setDelegateTarget] = useState("");
  const [delegateQuery, setDelegateQuery] = useState("");
  const [delegateResult, setDelegateResult] = useState<DelegationResult | null>(null);
  const [delegateRunning, setDelegateRunning] = useState(false);

  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState(false);

  useEffect(() => {
    setAgentsLoading(true);
    setAgentsError(false);
    fetch(`${API_BASE}/api/agents`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => {
        setAgents(d.data ?? []);
        setAgentsError(false);
      })
      .catch(() => {
        setAgentsError(true);
        toast({ title: "Impossible de charger les agents", description: "Vérifiez votre connexion et réessayez.", variant: "destructive" });
      })
      .finally(() => setAgentsLoading(false));
  }, [toast]);

  const nonExecutiveAgents = agents.filter(a => a.id !== "executive");

  // ─── Chat run ───
  async function runChat() {
    if (!task.trim() || running) return;
    setRunning(true);
    setOrchestration(null);
    setSingle(null);
    try {
      if (target === "orchestrate") {
        const res = await fetch(`${API_BASE}/api/agents/orchestrate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task: task.trim() }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        setOrchestration(d.data);
      } else {
        const res = await fetch(`${API_BASE}/api/agents/${target}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task: task.trim() }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        setSingle(d.data);
      }
    } catch {
      toast({ title: "Échec de l'exécution", description: "Réessayez dans un instant.", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  // ─── Council run ───
  async function runCouncil() {
    if (!councilQuery.trim() || councilRunning) return;
    setCouncilRunning(true);
    setCouncilResult(null);
    try {
      const body: any = { query: councilQuery.trim() };
      if (selectedAgents.size > 0) body.agents = Array.from(selectedAgents);
      const res = await fetch(`${API_BASE}/api/agents/council`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setCouncilResult(d.data);
    } catch {
      toast({ title: "Échec du conseil", description: "Réessayez dans un instant.", variant: "destructive" });
    } finally {
      setCouncilRunning(false);
    }
  }

  // ─── Pipeline run ───
  async function runPipeline() {
    const validTasks = pipelineTasks.filter(t => t.agent && t.query.trim());
    if (validTasks.length === 0 || pipelineRunning) return;
    setPipelineRunning(true);
    setPipelineResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/agents/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: validTasks }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setPipelineResult(d.data);
    } catch {
      toast({ title: "Échec du pipeline", description: "Réessayez dans un instant.", variant: "destructive" });
    } finally {
      setPipelineRunning(false);
    }
  }

  // ─── Delegate run ───
  async function runDelegate() {
    if (!delegateSource || !delegateTarget || !delegateQuery.trim() || delegateRunning) return;
    setDelegateRunning(true);
    setDelegateResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/agents/delegate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: delegateSource,
          target: delegateTarget,
          query: delegateQuery.trim(),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setDelegateResult(d.data);
    } catch {
      toast({ title: "Échec de la délégation", description: "Réessayez dans un instant.", variant: "destructive" });
    } finally {
      setDelegateRunning(false);
    }
  }

  function toggleAgent(id: string) {
    setSelectedAgents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addPipelineStep() {
    setPipelineTasks(prev => [...prev, { agent: "", query: "" }]);
  }

  function removePipelineStep(index: number) {
    setPipelineTasks(prev => prev.filter((_, i) => i !== index));
  }

  function updatePipelineStep(index: number, field: "agent" | "query", value: string) {
    setPipelineTasks(prev => prev.map((t, i) => i === index ? { ...t, [field]: value } : t));
  }

  const targetName = target === "orchestrate"
    ? "Équipe (Chief of Staff)"
    : agents.find(a => a.id === target)?.name ?? target;

  const agentColors: Record<string, string> = {
    engineering: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    product: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    business: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    marketing: "bg-rose-500/10 text-rose-500 border-rose-500/20",
    research: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    memory: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
    decision: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    studio: "bg-pink-500/10 text-pink-500 border-pink-500/20",
    devops: "bg-slate-500/10 text-slate-500 border-slate-500/20",
    red_team: "bg-red-500/10 text-red-500 border-red-500/20",
    planning: "bg-teal-500/10 text-teal-500 border-teal-500/20",
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden animate-fade-in">
      <div className="px-4 pt-6 pb-4 shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground tracking-tight">Agents</h1>
            <p className="text-[11px] text-muted-foreground">Système multi-agents · orchestration par le Chief of Staff</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {[
            { id: "chat" as TabMode, label: "Chat", icon: MessageSquare },
            { id: "council" as TabMode, label: "Conseil", icon: Lightbulb },
            { id: "pipeline" as TabMode, label: "Pipeline", icon: GitBranch },
            { id: "delegate" as TabMode, label: "Délégation", icon: ArrowRightLeft },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors active:scale-[0.98]",
                activeTab === tab.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="w-3 h-3" /> {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-28 md:pb-6 space-y-4">
        {/* ─── TAB: CHAT ─── */}
        {activeTab === "chat" && (
          <>
            {/* Composer */}
            <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
              <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                <button
                  onClick={() => setTarget("orchestrate")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors active:scale-[0.98]",
                    target === "orchestrate" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Sparkles className="w-3 h-3" /> Équipe (CoS)
                </button>
                {nonExecutiveAgents.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setTarget(a.id)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors active:scale-[0.98]",
                      target === a.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {a.name.replace(" Agent", "")}
                  </button>
                ))}
              </div>

              <textarea
                data-testid="input-agent-task"
                rows={3}
                className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring resize-none"
                placeholder={`Demande à ${targetName}…  (ex: prépare le lancement de mon produit)`}
                value={task}
                onChange={e => setTask(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runChat(); }}
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">⌘/Ctrl + Entrée pour lancer</span>
                <button
                  data-testid="button-run-agent"
                  onClick={runChat}
                  disabled={!task.trim() || running}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50 transition-all active:scale-[0.98]"
                >
                  {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  {running ? "En cours…" : "Lancer"}
                </button>
              </div>
            </div>

            {/* Orchestration result */}
            {orchestration && (
              <div className="space-y-3 animate-fade-in">
                {orchestration.plan.rationale && (
                  <div className="bg-card border border-card-border rounded-xl p-4">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Plan du Chief of Staff</div>
                    <p className="text-sm text-foreground mb-2">{orchestration.plan.rationale}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {orchestration.plan.delegations.map((d, i) => (
                        <span key={i} className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-secondary text-muted-foreground rounded-full">
                          <ChevronRight className="w-2.5 h-2.5" />
                          {agents.find(a => a.id === d.agent)?.name ?? d.agent}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-primary mb-1.5">
                    <Sparkles className="w-3 h-3" /> Synthèse exécutive
                  </div>
                  <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{orchestration.synthesis}</div>
                </div>

                {orchestration.results.map((r, i) => (
                  <AgentOutput key={i} result={r} />
                ))}
              </div>
            )}

            {/* Single agent result */}
            {single && (
              <div className="animate-fade-in">
                <AgentOutput result={single} />
              </div>
            )}

            {/* Agent roster */}
            {!orchestration && !single && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {agentsLoading && (
                  <>
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="bg-card border border-card-border rounded-xl p-4 animate-pulse">
                        <div className="h-4 w-32 bg-secondary rounded mb-2" />
                        <div className="h-3 w-48 bg-secondary rounded mb-3" />
                        <div className="flex gap-1">
                          <div className="h-5 w-16 bg-secondary rounded-full" />
                          <div className="h-5 w-20 bg-secondary rounded-full" />
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {agentsError && !agentsLoading && (
                  <div className="col-span-full flex flex-col items-center justify-center py-8 text-center">
                    <AlertCircle className="w-8 h-8 text-destructive/60 mb-2" />
                    <p className="text-sm text-muted-foreground mb-3">Impossible de charger les agents</p>
                    <button
                      onClick={() => window.location.reload()}
                      className="px-3 py-1.5 rounded-lg bg-secondary text-xs text-foreground hover:bg-accent transition-all active:scale-[0.98]"
                    >
                      Réessayer
                    </button>
                  </div>
                )}
                {!agentsLoading && !agentsError && agents.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setTarget(a.id)}
                    aria-label={`Agent ${a.name}: ${a.role}`}
                    className={cn(
                      "text-left bg-card border rounded-xl p-4 transition-all focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]",
                      target === a.id ? "border-primary/40" : "border-card-border hover:border-border/80"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-sm font-medium text-foreground">{a.name}</div>
                      {a.canDelegate && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">Orchestrateur</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground mb-2">{a.role}</div>
                    <div className="flex flex-wrap gap-1">
                      {a.responsibilities.slice(0, 3).map(r => (
                        <span key={r} className="text-[10px] px-1.5 py-0.5 bg-secondary text-muted-foreground rounded-full">{r}</span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* ─── TAB: COUNCIL ─── */}
        {activeTab === "council" && (
          <>
            <div className="bg-card border border-card-border rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Conseil Multi-Agents</h2>
                  <p className="text-[11px] text-muted-foreground">Rassemble plusieurs experts pour une décision collective</p>
                </div>
              </div>

              <textarea
                rows={3}
                className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring resize-none"
                placeholder="Posez une question complexe nécessitant plusieurs expertises…"
                value={councilQuery}
                onChange={e => setCouncilQuery(e.target.value)}
              />

              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Agents à consulter</div>
                <div className="flex flex-wrap gap-2">
                  {nonExecutiveAgents.map(a => (
                    <button
                      key={a.id}
                      onClick={() => toggleAgent(a.id)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-[0.98]",
                        selectedAgents.has(a.id)
                          ? agentColors[a.id] || "bg-primary/10 text-primary border border-primary/20"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {selectedAgents.has(a.id) && <CheckCircle2 className="w-3 h-3" />}
                      {a.name.replace(" Agent", "")}
                    </button>
                  ))}
                </div>
                {selectedAgents.size === 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1.5">Aucun agent sélectionné → sélection automatique</p>
                )}
              </div>

              <button
                onClick={runCouncil}
                disabled={!councilQuery.trim() || councilRunning}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50 transition-all active:scale-[0.98]"
              >
                {councilRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lightbulb className="w-3.5 h-3.5" />}
                {councilRunning ? "Consultation en cours…" : "Demander le conseil"}
              </button>
            </div>

            {/* Council results */}
            {councilResult && (
              <div className="space-y-3 animate-fade-in">
                {/* Synthesis */}
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-primary mb-1.5">
                    <Sparkles className="w-3 h-3" /> Synthèse du Chief of Staff
                  </div>
                  <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{councilResult.synthesis}</div>
                </div>

                {/* Recommendation */}
                {councilResult.recommendation && (
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-emerald-500 mb-1.5">
                      <CheckCircle2 className="w-3 h-3" /> Recommandation
                    </div>
                    <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{councilResult.recommendation}</div>
                  </div>
                )}

                {/* Individual opinions */}
                {councilResult.opinions.map((opinion, i) => (
                  <div
                    key={i}
                    className={cn(
                      "bg-card border rounded-xl p-4",
                      agentColors[opinion.agent] ? agentColors[opinion.agent].replace("text-", "border-").split(" ")[2] : "border-card-border"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className={cn(
                        "text-sm font-semibold",
                        agentColors[opinion.agent] ? agentColors[opinion.agent].split(" ")[1] : "text-foreground"
                      )}>
                        {opinion.name}
                      </div>
                      {opinion.toolsUsed.length > 0 && (
                        <div className="flex items-center gap-1 text-[10px] text-emerald-400">
                          <Wrench className="w-3 h-3" /> {opinion.toolsUsed.join(", ")}
                        </div>
                      )}
                    </div>
                    <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{opinion.output}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ─── TAB: PIPELINE ─── */}
        {activeTab === "pipeline" && (
          <>
            <div className="bg-card border border-card-border rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-purple-500" />
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Pipeline d'Agents</h2>
                  <p className="text-[11px] text-muted-foreground">Chaîne séquentielle : la sortie de N devient l'entrée de N+1</p>
                </div>
              </div>

              <div className="space-y-3">
                {pipelineTasks.map((step, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground font-mono w-6">{index + 1}</span>
                        <select
                          value={step.agent}
                          onChange={e => updatePipelineStep(index, "agent", e.target.value)}
                          className="bg-input border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="">Choisir un agent…</option>
                          {nonExecutiveAgents.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                        {index > 0 && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <ChevronRight className="w-3 h-3" /> reçoit la sortie de l'étape précédente
                          </span>
                        )}
                      </div>
                      <textarea
                        rows={2}
                        className="w-full bg-input border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring resize-none"
                        placeholder={index === 0 ? "Question / tâche initiale…" : "Instructions supplémentaires (optionnel)…"}
                        value={step.query}
                        onChange={e => updatePipelineStep(index, "query", e.target.value)}
                      />
                    </div>
                    {pipelineTasks.length > 1 && (
                      <button
                        onClick={() => removePipelineStep(index)}
                        className="mt-1 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={addPipelineStep}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground transition-all active:scale-[0.98]"
                >
                  <Plus className="w-3 h-3" /> Ajouter une étape
                </button>
                <button
                  onClick={runPipeline}
                  disabled={pipelineTasks.filter(t => t.agent && t.query.trim()).length === 0 || pipelineRunning}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50 transition-all active:scale-[0.98]"
                >
                  {pipelineRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  {pipelineRunning ? "Exécution…" : "Exécuter le pipeline"}
                </button>
              </div>
            </div>

            {/* Pipeline results */}
            {pipelineResult && (
              <div className="space-y-3 animate-fade-in">
                {pipelineResult.steps.map((step, i) => (
                  <div key={i} className="bg-card border border-card-border rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono bg-secondary text-muted-foreground px-1.5 py-0.5 rounded">Étape {i + 1}</span>
                        <span className={cn(
                          "text-sm font-semibold",
                          agentColors[step.agent] ? agentColors[step.agent].split(" ")[1] : "text-foreground"
                        )}>
                          {step.name}
                        </span>
                      </div>
                      {step.toolsUsed.length > 0 && (
                        <div className="flex items-center gap-1 text-[10px] text-emerald-400">
                          <Wrench className="w-3 h-3" /> {step.toolsUsed.join(", ")}
                        </div>
                      )}
                    </div>
                    {i > 0 && (
                      <div className="text-[10px] text-muted-foreground mb-1.5 bg-secondary/50 rounded px-2 py-1">
                        <ChevronRight className="w-2.5 h-2.5 inline mr-1" />
                        Entrée reçue de l'étape précédente
                      </div>
                    )}
                    <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{step.output}</div>
                  </div>
                ))}

                {/* Final output */}
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-primary mb-1.5">
                    <CheckCircle2 className="w-3 h-3" /> Résultat final
                  </div>
                  <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{pipelineResult.finalOutput}</div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ─── TAB: DELEGATE ─── */}
        {activeTab === "delegate" && (
          <>
            <div className="bg-card border border-card-border rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-teal-500" />
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Délégation Inter-Agents</h2>
                  <p className="text-[11px] text-muted-foreground">Délègue une sous-tâche d'un agent à un autre</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">Source</label>
                  <select
                    value={delegateSource}
                    onChange={e => setDelegateSource(e.target.value)}
                    className="w-full bg-input border border-border rounded-lg px-2 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Choisir…</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">Cible</label>
                  <select
                    value={delegateTarget}
                    onChange={e => setDelegateTarget(e.target.value)}
                    className="w-full bg-input border border-border rounded-lg px-2 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Choisir…</option>
                    {nonExecutiveAgents.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <textarea
                rows={3}
                className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring resize-none"
                placeholder="Sous-tâche à déléguer…"
                value={delegateQuery}
                onChange={e => setDelegateQuery(e.target.value)}
              />

              <button
                onClick={runDelegate}
                disabled={!delegateSource || !delegateTarget || !delegateQuery.trim() || delegateRunning}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50 transition-all active:scale-[0.98]"
              >
                {delegateRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRightLeft className="w-3.5 h-3.5" />}
                {delegateRunning ? "Délégation en cours…" : "Déléguer"}
              </button>
            </div>

            {/* Delegate result */}
            {delegateResult && (
              <div className="space-y-3 animate-fade-in">
                <div className="bg-card border border-card-border rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-medium text-muted-foreground">{agents.find(a => a.id === delegateResult.source)?.name ?? delegateResult.source}</span>
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    <span className={cn(
                      "text-xs font-medium",
                      agentColors[delegateResult.target] ? agentColors[delegateResult.target].split(" ")[1] : "text-foreground"
                    )}>
                      {agents.find(a => a.id === delegateResult.target)?.name ?? delegateResult.target}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mb-2 bg-secondary/50 rounded px-2 py-1">
                    Tâche : {delegateResult.query}
                  </div>
                  <AgentOutput result={delegateResult.response} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AgentOutput({ result }: { result: RunResult }) {
  return (
    <div className="bg-card border border-card-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-sm font-semibold text-foreground">{result.name}</div>
        {result.toolsUsed.length > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-emerald-400">
            <Wrench className="w-3 h-3" /> {result.toolsUsed.join(", ")}
          </div>
        )}
      </div>
      <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{result.output}</div>
    </div>
  );
}
