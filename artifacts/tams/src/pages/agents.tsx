import { useState, useEffect } from "react";
import { Users, Send, Loader2, Sparkles, Wrench, ChevronRight } from "lucide-react";
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

export default function Agents() {
  const { toast } = useToast();
  const [agents, setAgents] = useState<AgentMeta[]>([]);
  const [task, setTask] = useState("");
  const [target, setTarget] = useState<string>("orchestrate"); // "orchestrate" | agentId
  const [running, setRunning] = useState(false);
  const [orchestration, setOrchestration] = useState<Orchestration | null>(null);
  const [single, setSingle] = useState<RunResult | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/agents`)
      .then(r => r.json())
      .then(d => setAgents(d.data ?? []))
      .catch(() => {});
  }, []);

  async function run() {
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

  const targetName = target === "orchestrate"
    ? "Équipe (Chief of Staff)"
    : agents.find(a => a.id === target)?.name ?? target;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
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
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-28 md:pb-6 space-y-4">
        {/* Composer */}
        <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            <button
              onClick={() => setTarget("orchestrate")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors",
                target === "orchestrate" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              <Sparkles className="w-3 h-3" /> Équipe (CoS)
            </button>
            {agents.filter(a => a.id !== "executive").map(a => (
              <button
                key={a.id}
                onClick={() => setTarget(a.id)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors",
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
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(); }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">⌘/Ctrl + Entrée pour lancer</span>
            <button
              data-testid="button-run-agent"
              onClick={run}
              disabled={!task.trim() || running}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50 transition-all active:scale-95"
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

            {/* Synthesis highlighted first */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-primary mb-1.5">
                <Sparkles className="w-3 h-3" /> Synthèse exécutive
              </div>
              <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{orchestration.synthesis}</div>
            </div>

            {/* Per-agent contributions */}
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
            {agents.map(a => (
              <button
                key={a.id}
                onClick={() => setTarget(a.id)}
                className={cn(
                  "text-left bg-card border rounded-xl p-4 transition-colors",
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
