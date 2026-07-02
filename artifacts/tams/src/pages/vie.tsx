import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, Bot, Brain, Briefcase, CalendarDays, CheckCircle2,
  Clock, Database, FileClock, Heart, History, Home, Inbox, LockKeyhole,
  RefreshCw, Settings, Shield, Sparkles, Target, Users, Workflow, Zap,
} from "lucide-react";

type Tab = "cockpit" | "briefing" | "risks" | "agenda" | "emails" | "automations" | "history" | "coach" | "memory" | "privacy";
type IntegrationState = { status: "connected" | "missing_config" | "configured_unverified"; connected: boolean; mode: string; missingVariables: string[] };
type Cockpit = {
  doctrine: string;
  overallScore: number;
  domains: Array<{ id: string; label: string; score: number; status: string; guardrail: string }>;
  riskRadar: Array<{ id: string; level: "low" | "medium" | "high"; title: string; reason: string; antidote: string }>;
  nextActions: Array<{ order: number; domain: string; action: string; timeboxMinutes: number }>;
  signals: { tasks: { active: number; urgent: number }; decisions: { open: number }; memories: number; platform?: { historyCount: number; activeJobs: number; failedJobs: number; enabledAutomations: number } };
};
type TimelineEvent = { id: string; type: string; category: string; severity: string; confidence: number; summary: string; source: string; createdAt: string };
type Automation = { id: string; title: string; description: string; enabled: boolean; schedule: string; type: string; lastRunAt: string | null; lastError: string | null; requiredPermission: string; dryRun: boolean; approvalRequired: boolean };
type CoachResponse = { diagnosis: string; factsKnown: string[]; assumptions: string[]; risks: string[]; tradeoffs: string[]; recommendation: string; redTeamCounterArguments: string[]; nextAction: string; timebox: number; confidence: number; sources: Array<{ id: string; source: string; summary: string }>; limits: string[]; doctrine: string };

const tabs: Array<{ id: Tab; label: string; icon: typeof Home }> = [
  { id: "cockpit", label: "Cockpit", icon: Home },
  { id: "briefing", label: "Briefing", icon: Sparkles },
  { id: "risks", label: "Risk Radar", icon: AlertTriangle },
  { id: "agenda", label: "Agenda", icon: CalendarDays },
  { id: "emails", label: "Emails", icon: Inbox },
  { id: "automations", label: "Automatisations", icon: Workflow },
  { id: "history", label: "Historique", icon: History },
  { id: "coach", label: "Coach", icon: Bot },
  { id: "memory", label: "Mémoire", icon: Database },
  { id: "privacy", label: "Privacy", icon: LockKeyhole },
];

const domainIcons: Record<string, typeof Heart> = {
  health: Heart, family: Users, admin_finance: Shield, work_stability: Briefcase, projects: Target, learning: Brain,
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const raw = await response.text();
  let payload: unknown = null;
  try { payload = raw ? JSON.parse(raw) : null; }
  catch { throw new Error(`Réponse JSON invalide (${response.status}).`); }
  if (!response.ok) {
    const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    throw new Error(typeof record.error === "string" ? record.error : `HTTP ${response.status}`);
  }
  return payload as T;
}

function StatusPill({ status }: { status: string }) {
  const ok = status === "connected" || status === "healthy" || status === "success";
  const warn = status === "missing_config" || status === "configured_unverified" || status === "degraded" || status === "warn";
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : warn ? "border-amber-500/30 bg-amber-500/10 text-amber-200" : "border-border bg-secondary text-muted-foreground"}`}>{status}</span>;
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Home; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 space-y-4 shadow-sm">
      <div className="flex items-center gap-2"><Icon className="w-5 h-5 text-primary" /><h2 className="text-lg font-semibold">{title}</h2></div>
      {children}
    </section>
  );
}

export default function Vie() {
  const [tab, setTab] = useState<Tab>("cockpit");
  const [cockpit, setCockpit] = useState<Cockpit | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [gmail, setGmail] = useState<IntegrationState | null>(null);
  const [calendar, setCalendar] = useState<IntegrationState | null>(null);
  const [opsStatus, setOpsStatus] = useState("unknown");
  const [capture, setCapture] = useState("");
  const [capturePreview, setCapturePreview] = useState<Record<string, unknown> | null>(null);
  const [coachPrompt, setCoachPrompt] = useState("");
  const [energy, setEnergy] = useState(50);
  const [coach, setCoach] = useState<CoachResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [cockpitData, historyData, automationData, gmailData, calendarData, opsData] = await Promise.all([
        fetchJson<Cockpit>("/api/life-os/v5/cockpit"),
        fetchJson<{ timeline: TimelineEvent[] }>("/api/life-os/history/timeline"),
        fetchJson<{ automations: Automation[] }>("/api/life-os/automations"),
        fetchJson<IntegrationState>("/api/life-os/integrations/gmail/status"),
        fetchJson<IntegrationState>("/api/life-os/integrations/calendar/status"),
        fetchJson<{ status: string }>("/api/ops/status"),
      ]);
      setCockpit(cockpitData);
      setTimeline(historyData.timeline ?? []);
      setAutomations(automationData.automations ?? []);
      setGmail(gmailData);
      setCalendar(calendarData);
      setOpsStatus(opsData.status);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Life OS indisponible.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const topRisk = useMemo(() => cockpit?.riskRadar?.[0] ?? null, [cockpit]);
  const platform = cockpit?.signals.platform;

  const previewCapture = useCallback(async () => {
    if (!capture.trim()) return;
    setBusy(true); setError(null);
    try {
      const result = await fetchJson<Record<string, unknown>>("/api/life-os/v5/capture", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: capture.trim(), source: "vie-final-ui", persist: false }),
      });
      setCapturePreview(result);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Preview impossible."); }
    finally { setBusy(false); }
  }, [capture]);

  const askCoach = useCallback(async (redTeam = false) => {
    if (!coachPrompt.trim()) return;
    setBusy(true); setError(null);
    try {
      const result = await fetchJson<CoachResponse>(redTeam ? "/api/life-os/coach/red-team" : "/api/life-os/coach", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: coachPrompt.trim(), energy }),
      });
      setCoach(result);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Coach indisponible."); }
    finally { setBusy(false); }
  }, [coachPrompt, energy]);

  const runAutomation = useCallback(async (id: string) => {
    setBusy(true); setError(null);
    try {
      await fetchJson(`/api/life-os/automations/${id}/run`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true, permission: "preview" }),
      });
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Automation indisponible."); }
    finally { setBusy(false); }
  }, [load]);

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain">
      <div className="max-w-5xl mx-auto px-4 pt-5 pb-28 md:pb-10 space-y-5">
        <header className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-primary font-semibold">Personal Life OS</p>
              <h1 className="text-2xl md:text-3xl font-semibold mt-1">Centre de commandement personnel</h1>
              <p className="text-sm text-muted-foreground mt-2">Santé → famille → admin/finance → stabilité → projets → apprentissage.</p>
            </div>
            <button onClick={load} disabled={loading} className="min-h-[44px] px-3 rounded-xl border border-border bg-background/70 flex items-center gap-2 text-sm"><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /><span className="hidden sm:inline">Actualiser</span></button>
          </div>
          <div className="flex flex-wrap gap-2 mt-4"><StatusPill status={opsStatus} /><span className="text-xs text-muted-foreground self-center">lecture privacy-first · actions externes sous approval</span></div>
        </header>

        <nav className="flex gap-2 overflow-x-auto pb-1 scrollbar-none" aria-label="Sections Life OS">
          {tabs.map(item => {
            const Icon = item.icon;
            return <button key={item.id} onClick={() => setTab(item.id)} className={`shrink-0 min-h-[44px] px-3 rounded-xl border flex items-center gap-2 text-sm transition-colors ${tab === item.id ? "border-primary/40 bg-primary/15 text-primary" : "border-border bg-card text-muted-foreground"}`}><Icon className="w-4 h-4" />{item.label}</button>;
          })}
        </nav>

        {error && <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div>}
        {loading && !cockpit ? <div className="rounded-3xl border border-border bg-card p-10 text-center text-muted-foreground">Chargement du contexte Life OS…</div> : null}

        {cockpit && tab === "cockpit" && (
          <div className="space-y-4">
            <section className="rounded-3xl border border-primary/20 bg-card p-5">
              <div className="flex justify-between gap-4">
                <div><p className="text-sm text-muted-foreground">Doctrine active</p><p className="font-semibold mt-1">{cockpit.doctrine}</p></div>
                <div className="text-right"><div className="text-4xl font-bold">{cockpit.overallScore}</div><div className="text-xs text-muted-foreground">score prudent /100</div></div>
              </div>
              <div className="h-2 bg-secondary rounded-full mt-4 overflow-hidden"><div className="h-full bg-primary" style={{ width: `${cockpit.overallScore}%` }} /></div>
            </section>
            <section className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {cockpit.domains.map(domain => {
                const Icon = domainIcons[domain.id] ?? Activity;
                return <article key={domain.id} className="rounded-2xl border border-border bg-card p-4"><div className="flex justify-between gap-2"><span className="flex items-center gap-2 text-sm font-medium"><Icon className="w-4 h-4 text-primary" />{domain.label}</span><strong>{domain.score}</strong></div><div className="h-1.5 bg-secondary rounded-full mt-3 overflow-hidden"><div className="h-full bg-primary" style={{ width: `${domain.score}%` }} /></div><p className="text-xs text-muted-foreground mt-2">{domain.status}</p></article>;
              })}
            </section>
            <Panel title="État plateforme" icon={Activity}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                {[["Historique", platform?.historyCount ?? 0], ["Jobs actifs", platform?.activeJobs ?? 0], ["Jobs échoués", platform?.failedJobs ?? 0], ["Automations", platform?.enabledAutomations ?? 0]].map(([label, value]) => <div key={String(label)} className="rounded-2xl bg-secondary/40 p-3"><div className="text-xl font-semibold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>)}
              </div>
            </Panel>
          </div>
        )}

        {cockpit && tab === "briefing" && <Panel title="Briefing du jour" icon={Sparkles}><p className="text-sm text-muted-foreground">Le briefing suit l'ordre de protection non négociable.</p>{cockpit.nextActions.map(action => <div key={action.order} className="rounded-2xl bg-secondary/40 p-4 flex gap-3"><span className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold">{action.order}</span><div><p className="text-sm font-medium">{action.action}</p><p className="text-xs text-muted-foreground mt-1">{action.domain} · {action.timeboxMinutes} min</p></div></div>)}</Panel>}

        {cockpit && tab === "risks" && <Panel title="Risk Radar" icon={AlertTriangle}>{cockpit.riskRadar.map(risk => <article key={risk.id} className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4"><div className="flex justify-between gap-2"><strong>{risk.title}</strong><StatusPill status={risk.level} /></div><p className="text-sm text-muted-foreground mt-2">{risk.reason}</p><p className="text-sm mt-2">Antidote : {risk.antidote}</p></article>)}{topRisk && <p className="text-xs text-muted-foreground">Priorité actuelle : {topRisk.title}.</p>}</Panel>}

        {tab === "agenda" && <Panel title="Agenda" icon={CalendarDays}><div className="flex justify-between items-center"><div><p className="font-medium">Google Calendar</p><p className="text-sm text-muted-foreground">Lecture seule; aucune création automatique.</p></div><StatusPill status={calendar?.status ?? "loading"} /></div>{calendar?.status !== "connected" && <p className="rounded-2xl bg-amber-500/10 p-4 text-sm">Calendar est {calendar?.status ?? "indisponible"}. Aucun faux événement n'est affiché.</p>}</Panel>}

        {tab === "emails" && <Panel title="Emails importants" icon={Inbox}><div className="flex justify-between items-center"><div><p className="font-medium">Gmail</p><p className="text-sm text-muted-foreground">Métadonnées et résumés courts uniquement; aucun envoi automatique.</p></div><StatusPill status={gmail?.status ?? "loading"} /></div>{gmail?.status !== "connected" && <p className="rounded-2xl bg-amber-500/10 p-4 text-sm">Gmail est {gmail?.status ?? "indisponible"}. Aucun faux email n'est affiché.</p>}</Panel>}

        {tab === "automations" && <Panel title="Automatisations" icon={Workflow}>{automations.length === 0 ? <p className="text-sm text-muted-foreground">Aucune automation disponible.</p> : automations.map(item => <article key={item.id} className="rounded-2xl border border-border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><div className="flex items-center gap-2"><p className="font-medium">{item.title}</p><StatusPill status={item.enabled ? "enabled" : "disabled"} /></div><p className="text-sm text-muted-foreground mt-1">{item.description}</p><p className="text-xs text-muted-foreground mt-2">{item.type} · {item.requiredPermission} · dry-run par défaut</p></div><button disabled={busy} onClick={() => runAutomation(item.id)} className="min-h-[44px] px-4 rounded-xl bg-secondary text-sm flex items-center justify-center gap-2"><Zap className="w-4 h-4" />Tester en dry-run</button></article>)}</Panel>}

        {tab === "history" && <Panel title="Historique" icon={FileClock}>{timeline.length === 0 ? <p className="text-sm text-muted-foreground">Aucun événement encore enregistré. Les futures captures, permissions, jobs et coachings alimenteront cette timeline.</p> : timeline.map(event => <article key={event.id} className="border-l-2 border-primary/30 pl-4 py-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-sm">{event.summary}</p><StatusPill status={event.severity} /></div><p className="text-xs text-muted-foreground mt-1">{event.source} · confiance {Math.round(event.confidence * 100)}% · {new Date(event.createdAt).toLocaleString("fr-FR")}</p></article>)}</Panel>}

        {tab === "coach" && <div className="space-y-4">
          <Panel title="Coach contextuel" icon={Bot}>
            <textarea value={coachPrompt} onChange={event => setCoachPrompt(event.target.value)} placeholder="Décris une situation réelle : fatigue, facture, travail, famille ou projet…" className="w-full min-h-[120px] rounded-2xl border border-border bg-background p-3 text-sm outline-none focus:border-primary" />
            <label className="text-sm text-muted-foreground">Énergie : {energy}/100<input type="range" min="0" max="100" value={energy} onChange={event => setEnergy(Number(event.target.value))} className="w-full mt-2" /></label>
            <div className="grid grid-cols-2 gap-3"><button disabled={busy || !coachPrompt.trim()} onClick={() => askCoach(false)} className="min-h-[44px] rounded-xl bg-primary text-primary-foreground disabled:opacity-50">Demander au coach</button><button disabled={busy || !coachPrompt.trim()} onClick={() => askCoach(true)} className="min-h-[44px] rounded-xl bg-rose-500/90 text-white disabled:opacity-50">Red Team</button></div>
          </Panel>
          {coach && <Panel title="Réponse structurée" icon={CheckCircle2}><p className="font-medium">{coach.diagnosis}</p><div><h3 className="text-sm font-semibold">Faits connus</h3><ul className="text-sm text-muted-foreground mt-1 space-y-1">{coach.factsKnown.map(item => <li key={item}>• {item}</li>)}</ul></div><div><h3 className="text-sm font-semibold">Suppositions</h3><ul className="text-sm text-muted-foreground mt-1 space-y-1">{coach.assumptions.map(item => <li key={item}>• {item}</li>)}</ul></div><div className="rounded-2xl bg-primary/10 p-4"><h3 className="font-semibold">Recommandation</h3><p className="text-sm mt-1">{coach.recommendation}</p><p className="text-xs text-muted-foreground mt-2">Prochaine action · {coach.timebox} min · confiance {Math.round(coach.confidence * 100)}%</p></div><div><h3 className="text-sm font-semibold">Limites</h3><ul className="text-sm text-muted-foreground mt-1 space-y-1">{coach.limits.map(item => <li key={item}>• {item}</li>)}</ul></div></Panel>}
        </div>}

        {tab === "memory" && <div className="space-y-4"><Panel title="Capture et mémoire" icon={Database}><textarea value={capture} onChange={event => setCapture(event.target.value)} placeholder="Capture une contrainte, une obligation, une preuve ou un objectif…" className="w-full min-h-[120px] rounded-2xl border border-border bg-background p-3 text-sm outline-none focus:border-primary" /><button disabled={busy || !capture.trim()} onClick={previewCapture} className="w-full min-h-[44px] rounded-xl bg-primary text-primary-foreground disabled:opacity-50">Prévisualiser sans persister</button>{capturePreview && <pre className="rounded-2xl bg-secondary/40 p-4 text-xs whitespace-pre-wrap overflow-auto">{JSON.stringify(capturePreview, null, 2)}</pre>}</Panel></div>}

        {tab === "privacy" && <div className="grid gap-4 md:grid-cols-2">
          <Panel title="Intégrations" icon={Settings}><div className="flex justify-between"><span>Gmail</span><StatusPill status={gmail?.status ?? "loading"} /></div><div className="flex justify-between"><span>Calendar</span><StatusPill status={calendar?.status ?? "loading"} /></div><p className="text-xs text-muted-foreground">Les noms des variables manquantes peuvent être affichés; leurs valeurs ne le sont jamais.</p></Panel>
          <Panel title="Permission model" icon={LockKeyhole}><ul className="text-sm text-muted-foreground space-y-2"><li>• Read-only par défaut.</li><li>• Preview avant effet interne.</li><li>• Approval humain pour risque élevé.</li><li>• Admin-only pour GitHub, recovery et bulk write.</li><li>• Audit sans secret.</li></ul></Panel>
        </div>}
      </div>
    </div>
  );
}
