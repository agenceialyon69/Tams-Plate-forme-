import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import AuthedLayout from "@/components/layout/AuthedLayout";
import {
  getOpsSnapshot, listMonitors, createMonitor, updateMonitor,
  listAlerts, createAlert, acknowledgeAlert, resolveAlert,
  listRunbooks, createRunbook,
  listRecentRuns,
  type AgentMonitor, type MonitorAlert, type Runbook, type AlertSeverity,
} from "@/lib/ops";
import {
  Activity, AlertTriangle, CheckCircle, Circle, Plus,
  BookOpen, Eye, Bell, X, Check, RefreshCw,
} from "lucide-react";

const SEVERITY_STYLE: Record<AlertSeverity, string> = {
  critical: "border-red-500/30 bg-red-500/5 text-red-400",
  high:     "border-orange-500/30 bg-orange-500/5 text-orange-400",
  medium:   "border-yellow-500/30 bg-yellow-500/5 text-yellow-400",
  info:     "border-blue-500/30 bg-blue-500/5 text-blue-400",
};

const SEVERITY_DOT: Record<AlertSeverity, string> = {
  critical: "bg-red-500",
  high:     "bg-orange-400",
  medium:   "bg-yellow-400",
  info:     "bg-blue-400",
};

const RUN_STATUS_STYLE: Record<string, string> = {
  running: "text-blue-400 bg-blue-500/10",
  done:    "text-emerald-400 bg-emerald-500/10",
  error:   "text-red-400 bg-red-500/10",
  queued:  "text-muted-foreground bg-muted/30",
};

function StatCard({ label, value, sub, warn }: { label: string; value: string | number; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/30 p-4">
      <div className={`text-2xl font-semibold tabular-nums ${warn ? "text-red-400" : ""}`}>{value}</div>
      <div className="mt-0.5 text-xs font-medium text-foreground">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function AddForm({ fields, onSubmit, onCancel, busy }: {
  fields: { key: string; placeholder: string }[];
  onSubmit: (v: Record<string, string>) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [vals, setVals] = useState<Record<string, string>>({});
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(vals); }}
      className="mb-4 rounded-xl border border-border/60 bg-card/30 p-4 space-y-3"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map(f => (
          <input key={f.key}
            value={vals[f.key] ?? ""}
            onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))}
            placeholder={f.placeholder}
            className="rounded-md border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Annuler</button>
        <button type="submit" disabled={busy} className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
          {busy ? "…" : "Créer"}
        </button>
      </div>
    </form>
  );
}

export default function OpsWatcher() {
  const qc = useQueryClient();
  const inv = (keys: string[]) => keys.forEach(k => qc.invalidateQueries({ queryKey: [k] }));

  const [tab, setTab] = useState<"overview" | "monitors" | "alerts" | "runbooks">("overview");
  const [addingMonitor, setAddingMonitor] = useState(false);
  const [addingAlert, setAddingAlert] = useState(false);
  const [addingRunbook, setAddingRunbook] = useState(false);

  const snapshot = useQuery({ queryKey: ["ops_snapshot"], queryFn: getOpsSnapshot, refetchInterval: 30_000 });
  const monitors = useQuery({ queryKey: ["monitors"], queryFn: listMonitors });
  const alerts   = useQuery({ queryKey: ["alerts"], queryFn: () => listAlerts() });
  const runbooks = useQuery({ queryKey: ["runbooks"], queryFn: listRunbooks });
  const runs     = useQuery({ queryKey: ["agent_runs"], queryFn: () => listRecentRuns(30), refetchInterval: 15_000 });

  const createMonitorMut = useMutation({
    mutationFn: createMonitor,
    onSuccess: () => { toast.success("Monitor créé"); inv(["monitors"]); setAddingMonitor(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });
  const updateMonitorMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<AgentMonitor> }) => updateMonitor(id, patch),
    onSuccess: () => { inv(["monitors"]); },
  });
  const createAlertMut = useMutation({
    mutationFn: createAlert,
    onSuccess: () => { toast.success("Alerte créée"); inv(["alerts"]); setAddingAlert(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });
  const ackAlertMut = useMutation({
    mutationFn: acknowledgeAlert,
    onSuccess: () => { inv(["alerts"]); toast.success("Alerte acquittée"); },
  });
  const resolveAlertMut = useMutation({
    mutationFn: resolveAlert,
    onSuccess: () => { inv(["alerts"]); toast.success("Alerte résolue"); },
  });
  const createRunbookMut = useMutation({
    mutationFn: createRunbook,
    onSuccess: () => { toast.success("Runbook créé"); inv(["runbooks"]); setAddingRunbook(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const openAlerts = (alerts.data ?? []).filter(a => a.status !== "resolved");
  const criticalAlerts = openAlerts.filter(a => a.severity === "critical");

  const snap = snapshot.data;
  const allRuns = runs.data ?? [];

  const TABS = [
    { id: "overview", label: "Vue d'ensemble" },
    { id: "monitors", label: "Agents" },
    { id: "alerts", label: `Alertes${openAlerts.length > 0 ? ` (${openAlerts.length})` : ""}` },
    { id: "runbooks", label: "Runbooks" },
  ] as const;

  return (
    <AuthedLayout>
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold tracking-tight">Ops Watcher</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Monitoring des agents, alertes et runbooks opérationnels.
            </p>
          </div>
          <button
            onClick={() => { inv(["ops_snapshot","agent_runs","monitors","alerts"]); }}
            className="flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Actualiser
          </button>
        </div>

        {criticalAlerts.length > 0 && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
            <span className="text-sm text-red-300">{criticalAlerts.length} alerte(s) critique(s) nécessitent attention immédiate.</span>
          </div>
        )}

        {/* Tab nav */}
        <div className="flex gap-0.5 rounded-lg border border-border/50 bg-muted/20 p-0.5">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={[
                "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors",
                tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* OVERVIEW */}
        {tab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Runs total" value={snap?.totalRuns ?? "—"} />
              <StatCard label="En cours" value={snap?.runningNow ?? "—"} sub="agents actifs" />
              <StatCard label="Erreurs aujourd'hui" value={snap?.errorsToday ?? "—"} warn={(snap?.errorsToday ?? 0) > 0} />
              <StatCard label="Taux succès" value={snap ? `${snap.successRate.toFixed(0)}%` : "—"} />
            </div>

            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Eye className="h-4 w-4 text-muted-foreground" />
                Derniers runs
                <span className="rounded-full bg-muted/60 px-1.5 text-[11px] text-muted-foreground">{allRuns.length}</span>
              </h2>
              {allRuns.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground/60">Aucun run enregistré.</div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border/50">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/50 bg-muted/20">
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Agent</th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Statut</th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Étapes</th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Démarré</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allRuns.map((run: Record<string, unknown>) => (
                        <tr key={run.id as string} className="border-b border-border/30 hover:bg-muted/10">
                          <td className="px-4 py-2.5 font-mono text-[11px]">{String(run.agent)}</td>
                          <td className="px-4 py-2.5">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${RUN_STATUS_STYLE[run.status as string] ?? ""}`}>
                              {String(run.status)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{run.steps != null ? String(run.steps) : "—"}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">
                            {new Date(run.started_at as string).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        {/* MONITORS */}
        {tab === "monitors" && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium">Agents monitorés</h2>
                <span className="rounded-full bg-muted/60 px-1.5 text-[11px] text-muted-foreground">{(monitors.data ?? []).length}</span>
              </div>
              <button onClick={() => setAddingMonitor(v => !v)}
                className="flex items-center gap-1 rounded-md border border-border/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                Ajouter
              </button>
            </div>
            {addingMonitor && (
              <AddForm
                fields={[
                  { key: "name", placeholder: "Nom de l'agent *" },
                  { key: "agent_key", placeholder: "Clé unique (ex: agent.pricing) *" },
                  { key: "description", placeholder: "Description" },
                ]}
                onSubmit={v => createMonitorMut.mutate({ name: v.name || "Agent", description: v.description || null, agent_key: v.agent_key || "agent" })}
                onCancel={() => setAddingMonitor(false)}
                busy={createMonitorMut.isPending}
              />
            )}
            <div className="space-y-2">
              {(monitors.data ?? []).length === 0 && !addingMonitor && (
                <div className="py-8 text-center text-sm text-muted-foreground/60">Aucun agent monitoré.</div>
              )}
              {(monitors.data ?? []).map((m: AgentMonitor) => (
                <div key={m.id} className="flex items-center gap-4 rounded-xl border border-border/50 bg-card/20 px-4 py-3">
                  <div className={`h-2 w-2 rounded-full shrink-0 ${m.status === "active" ? "bg-emerald-500" : m.status === "degraded" ? "bg-yellow-400" : m.status === "down" ? "bg-red-400" : "bg-muted-foreground/40"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{m.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{m.agent_key}</span>
                    </div>
                    {m.description && <p className="text-xs text-muted-foreground truncate">{m.description}</p>}
                  </div>
                  <div className="shrink-0 flex gap-4 text-xs text-muted-foreground tabular-nums">
                    <span title="Succès" className="text-emerald-400">{m.success_count} ✓</span>
                    <span title="Erreurs" className="text-red-400">{m.error_count} ✗</span>
                  </div>
                  <select value={m.status}
                    onChange={e => updateMonitorMut.mutate({ id: m.id, patch: { status: e.target.value as AgentMonitor["status"] } })}
                    className="rounded-md border border-input bg-background px-2 py-1 text-xs text-muted-foreground focus:outline-none"
                  >
                    <option value="active">actif</option>
                    <option value="paused">pause</option>
                    <option value="degraded">dégradé</option>
                    <option value="down">down</option>
                  </select>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ALERTS */}
        {tab === "alerts" && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium">Alertes</h2>
                <span className="rounded-full bg-muted/60 px-1.5 text-[11px] text-muted-foreground">{(alerts.data ?? []).length}</span>
              </div>
              <button onClick={() => setAddingAlert(v => !v)}
                className="flex items-center gap-1 rounded-md border border-border/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                Créer
              </button>
            </div>
            {addingAlert && (
              <AddForm
                fields={[
                  { key: "title", placeholder: "Titre de l'alerte *" },
                  { key: "severity", placeholder: "Sévérité (critical/high/medium/info)" },
                  { key: "description", placeholder: "Description" },
                ]}
                onSubmit={v => createAlertMut.mutate({
                  title: v.title || "Alerte",
                  description: v.description || null,
                  severity: (v.severity as AlertSeverity) || "medium",
                  monitor_id: null,
                })}
                onCancel={() => setAddingAlert(false)}
                busy={createAlertMut.isPending}
              />
            )}
            <div className="space-y-2">
              {(alerts.data ?? []).length === 0 && !addingAlert && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-400">
                  <CheckCircle className="h-4 w-4" />
                  Aucune alerte active.
                </div>
              )}
              {(alerts.data ?? []).map((a: MonitorAlert) => (
                <div key={a.id} className={`rounded-xl border p-4 ${SEVERITY_STYLE[a.severity]}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[a.severity]}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{a.title}</span>
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${a.status === "resolved" ? "bg-emerald-500/10 text-emerald-400" : a.status === "acknowledged" ? "bg-blue-500/10 text-blue-400" : "bg-muted/30 text-muted-foreground"}`}>
                            {a.status}
                          </span>
                        </div>
                        {a.description && <p className="mt-0.5 text-xs opacity-80">{a.description}</p>}
                        <p className="mt-1 text-[10px] opacity-60">
                          {new Date(a.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                        </p>
                      </div>
                    </div>
                    {a.status !== "resolved" && (
                      <div className="flex shrink-0 gap-1.5">
                        {a.status === "open" && (
                          <button onClick={() => ackAlertMut.mutate(a.id)}
                            className="flex items-center gap-1 rounded-md border border-current/30 px-2 py-1 text-[10px] opacity-80 hover:opacity-100"
                          >
                            <Eye className="h-3 w-3" />
                            Ack
                          </button>
                        )}
                        <button onClick={() => resolveAlertMut.mutate(a.id)}
                          className="flex items-center gap-1 rounded-md border border-current/30 px-2 py-1 text-[10px] opacity-80 hover:opacity-100"
                        >
                          <Check className="h-3 w-3" />
                          Résoudre
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* RUNBOOKS */}
        {tab === "runbooks" && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium">Runbooks</h2>
                <span className="rounded-full bg-muted/60 px-1.5 text-[11px] text-muted-foreground">{(runbooks.data ?? []).length}</span>
              </div>
              <button onClick={() => setAddingRunbook(v => !v)}
                className="flex items-center gap-1 rounded-md border border-border/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                Créer
              </button>
            </div>
            {addingRunbook && (
              <AddForm
                fields={[
                  { key: "title", placeholder: "Titre du runbook *" },
                  { key: "trigger", placeholder: "Déclencheur (ex: agent.error, daily.review)" },
                  { key: "description", placeholder: "Description" },
                ]}
                onSubmit={v => createRunbookMut.mutate({ title: v.title || "Runbook", trigger: v.trigger || null, description: v.description || null })}
                onCancel={() => setAddingRunbook(false)}
                busy={createRunbookMut.isPending}
              />
            )}
            <div className="space-y-3">
              {(runbooks.data ?? []).length === 0 && !addingRunbook && (
                <div className="py-8 text-center text-sm text-muted-foreground/60">Aucun runbook. Documentez vos procédures opérationnelles.</div>
              )}
              {(runbooks.data ?? []).map((rb: Runbook) => (
                <div key={rb.id} className="rounded-xl border border-border/50 bg-card/20 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 rounded-full ${rb.status === "active" ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                        <span className="text-sm font-medium">{rb.title}</span>
                        {rb.trigger && (
                          <span className="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{rb.trigger}</span>
                        )}
                      </div>
                      {rb.description && <p className="mt-1 text-xs text-muted-foreground">{rb.description}</p>}
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground/40">{rb.status}</span>
                  </div>
                  {rb.steps.length > 0 && (
                    <ol className="mt-3 space-y-1 border-t border-border/40 pt-3">
                      {rb.steps.map((step, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs">
                          <span className="shrink-0 mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-muted/40 text-[10px] font-mono text-muted-foreground">{step.order}</span>
                          <div>
                            <span className="font-medium">{step.title}</span>
                            {step.description && <span className="ml-1 text-muted-foreground">— {step.description}</span>}
                            {step.command && <code className="ml-1 rounded bg-muted/30 px-1 font-mono text-[10px]">{step.command}</code>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </AuthedLayout>
  );
}
