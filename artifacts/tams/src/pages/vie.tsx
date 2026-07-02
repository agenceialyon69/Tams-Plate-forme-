import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Brain, Briefcase, CheckCircle2, Clock, Heart, Home, RefreshCw, Shield, Sparkles, Target, Users } from "lucide-react";

type RiskLevel = "low" | "medium" | "high";

type Domain = {
  id: string;
  label: string;
  score: number;
  status: string;
  weight: number;
  guardrail: string;
};

type Risk = {
  id: string;
  level: RiskLevel;
  title: string;
  reason: string;
  antidote: string;
};

type NextAction = {
  order: number;
  domain: string;
  action: string;
  timeboxMinutes: number;
};

type Cockpit = {
  ok: boolean;
  version: string;
  generatedAt: string;
  doctrine: string;
  overallScore: number;
  domains: Domain[];
  riskRadar: Risk[];
  nextActions: NextAction[];
  signals: {
    tasks: { total: number; done: number; active: number; urgent: number; dueSoon: number };
    decisions: { total: number; open: number; lowConfidence: number };
    memories: number;
    activity: number;
    recentTasks: Array<{ id: number; title: string; status: string; priority: string; dueDate: string | null }>;
    recentActivity: Array<{ type: string; title: string; createdAt: string }>;
  };
  council: Array<{ agent: string; role: string }>;
};

type RedTeamResult = {
  ok: boolean;
  verdict: string;
  redFlags: string[];
  saferPath: string[];
};

const domainIcons: Record<string, typeof Heart> = {
  health: Heart,
  family: Users,
  admin_finance: Shield,
  work_stability: Briefcase,
  projects: Target,
  learning: Brain,
};

const levelClasses: Record<RiskLevel, string> = {
  low: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  high: "border-rose-500/30 bg-rose-500/10 text-rose-200",
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  return JSON.parse(text) as T;
}

function scoreLabel(score: number) {
  if (score >= 80) return "solide";
  if (score >= 65) return "stable";
  if (score >= 50) return "à surveiller";
  return "fragile";
}

export default function Vie() {
  const [cockpit, setCockpit] = useState<Cockpit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [capture, setCapture] = useState("");
  const [decision, setDecision] = useState("");
  const [redTeam, setRedTeam] = useState<RedTeamResult | null>(null);
  const [busy, setBusy] = useState(false);

  const loadCockpit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<Cockpit>("/api/life-os/v5/cockpit");
      setCockpit(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Life OS indisponible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCockpit(); }, [loadCockpit]);

  const strongestRisk = useMemo(() => cockpit?.riskRadar?.[0] ?? null, [cockpit]);

  const submitCapture = useCallback(async () => {
    if (!capture.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson("/api/life-os/v5/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: capture.trim(), source: "vie-ui", persist: true }),
      });
      setCapture("");
      await loadCockpit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Capture impossible");
    } finally {
      setBusy(false);
    }
  }, [capture, loadCockpit]);

  const runRedTeam = useCallback(async () => {
    if (!decision.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await fetchJson<RedTeamResult>("/api/life-os/v5/red-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: decision.trim(), energy: 50, urgency: 50 }),
      });
      setRedTeam(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Red Team indisponible");
    } finally {
      setBusy(false);
    }
  }, [decision]);

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain">
      <div className="max-w-3xl mx-auto px-4 pt-6 pb-28 md:pb-10 space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold">Life OS v5 Foundation</p>
            <h1 className="text-3xl font-semibold text-foreground mt-1">Centre de commandement personnel</h1>
            <p className="text-sm text-muted-foreground mt-2">Santé → famille → admin/finance → stabilité → projets. Pas l'inverse.</p>
          </div>
          <button onClick={loadCockpit} className="min-h-[44px] px-3 rounded-xl border border-border bg-card text-sm flex items-center gap-2" disabled={loading}>
            <RefreshCw className="w-4 h-4" /> Actualiser
          </button>
        </header>

        {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div>}

        {loading && !cockpit ? (
          <div className="rounded-3xl border border-border bg-card p-8 text-center text-muted-foreground">Chargement du Life OS…</div>
        ) : cockpit ? (
          <>
            <section className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="w-4 h-4 text-primary" /> Doctrine active</div>
                  <p className="text-lg font-semibold text-foreground mt-1">{cockpit.doctrine}</p>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-bold text-foreground">{cockpit.overallScore}</div>
                  <div className="text-xs text-muted-foreground">/100 · {scoreLabel(cockpit.overallScore)}</div>
                </div>
              </div>
              <div className="mt-4 h-2 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${cockpit.overallScore}%` }} />
              </div>
            </section>

            <section className="grid grid-cols-2 gap-3">
              {cockpit.domains.map(domain => {
                const Icon = domainIcons[domain.id] ?? Activity;
                return (
                  <div key={domain.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0"><Icon className="w-4 h-4 text-primary shrink-0" /><span className="text-sm font-medium text-foreground truncate">{domain.label}</span></div>
                      <span className="text-lg font-semibold">{domain.score}</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${domain.score}%` }} /></div>
                    <p className="text-xs text-muted-foreground">{domain.status} · {domain.guardrail}</p>
                  </div>
                );
              })}
            </section>

            <section className="rounded-3xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-400" /><h2 className="text-lg font-semibold">Risk Radar</h2></div>
              <div className="space-y-3">
                {cockpit.riskRadar.map(risk => (
                  <div key={risk.id} className={`rounded-2xl border p-4 ${levelClasses[risk.level]}`}>
                    <div className="flex justify-between gap-3"><strong>{risk.title}</strong><span className="uppercase text-[10px] tracking-wider">{risk.level}</span></div>
                    <p className="text-sm opacity-90 mt-1">{risk.reason}</p>
                    <p className="text-sm mt-2">Antidote : {risk.antidote}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-400" /><h2 className="text-lg font-semibold">Plan d'action aujourd'hui</h2></div>
              {cockpit.nextActions.map(action => (
                <div key={action.order} className="flex gap-3 rounded-2xl bg-secondary/40 p-3">
                  <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold">{action.order}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{action.action}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><Clock className="w-3 h-3" /> {action.timeboxMinutes} min · {action.domain}</p>
                  </div>
                </div>
              ))}
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center gap-2"><Home className="w-5 h-5 text-primary" /><h2 className="text-lg font-semibold">Capture Life OS</h2></div>
                <textarea value={capture} onChange={e => setCapture(e.target.value)} placeholder="Capture une douleur, une facture, une décision, une obligation, une idée projet…" className="w-full min-h-[120px] rounded-2xl bg-background border border-border p-3 text-sm outline-none focus:border-primary" />
                <button onClick={submitCapture} disabled={busy || !capture.trim()} className="w-full min-h-[44px] rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50">Capturer et transformer en tâche</button>
              </div>

              <div className="rounded-3xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center gap-2"><Shield className="w-5 h-5 text-rose-400" /><h2 className="text-lg font-semibold">Red Team décision</h2></div>
                <textarea value={decision} onChange={e => setDecision(e.target.value)} placeholder="Ex : dois-je accepter ce nouveau projet, changer de travail, investir dans TAMS ?" className="w-full min-h-[120px] rounded-2xl bg-background border border-border p-3 text-sm outline-none focus:border-primary" />
                <button onClick={runRedTeam} disabled={busy || !decision.trim()} className="w-full min-h-[44px] rounded-xl bg-rose-500/90 text-white font-medium disabled:opacity-50">Analyser le risque</button>
              </div>
            </section>

            {redTeam && (
              <section className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-5 space-y-3">
                <h2 className="text-lg font-semibold text-rose-100">Verdict Red Team</h2>
                <p className="text-sm text-rose-50">{redTeam.verdict}</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div><h3 className="text-sm font-semibold mb-2">Drapeaux rouges</h3><ul className="space-y-1 text-sm text-muted-foreground">{redTeam.redFlags.map(item => <li key={item}>• {item}</li>)}</ul></div>
                  <div><h3 className="text-sm font-semibold mb-2">Chemin plus sûr</h3><ul className="space-y-1 text-sm text-muted-foreground">{redTeam.saferPath.map(item => <li key={item}>• {item}</li>)}</ul></div>
                </div>
              </section>
            )}

            <section className="rounded-3xl border border-border bg-card p-5 space-y-3">
              <h2 className="text-lg font-semibold">Conseil d'agents</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {cockpit.council.map(agent => (
                  <div key={agent.agent} className="rounded-2xl bg-secondary/40 p-3">
                    <p className="text-sm font-medium">{agent.agent}</p>
                    <p className="text-xs text-muted-foreground mt-1">{agent.role}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-border bg-card p-5 text-xs text-muted-foreground">
              <p>Signaux : {cockpit.signals.tasks.active} tâches actives, {cockpit.signals.tasks.urgent} urgentes, {cockpit.signals.decisions.open} décisions ouvertes, {cockpit.signals.memories} mémoires.</p>
              {strongestRisk && <p className="mt-1">Risque principal : {strongestRisk.title}.</p>}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
