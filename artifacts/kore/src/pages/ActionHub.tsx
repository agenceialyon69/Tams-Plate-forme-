import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import AuthedLayout from "@/components/layout/AuthedLayout";
import {
  listActions, createAction, updateAction,
  listActionLogs, logAction,
  listWebhooks, createWebhook, updateWebhook,
  type Action, type ActionLog, type Webhook,
} from "@/lib/actions";
import {
  Zap, Plus, Play, Globe, Clock, Check, X,
  ChevronRight, AlertCircle, ArrowDownToLine, ArrowUpFromLine,
} from "lucide-react";

const STATUS_STYLE: Record<string, string> = {
  active:  "text-emerald-400 bg-emerald-500/10",
  draft:   "text-muted-foreground bg-muted/30",
  disabled:"text-red-400/60 bg-red-500/5",
};

const LOG_STYLE: Record<string, string> = {
  success: "text-emerald-400",
  failed:  "text-red-400",
  running: "text-blue-400",
  pending: "text-muted-foreground",
  timeout: "text-orange-400",
};

function SectionHeader({ icon, title, count, onAdd, adding, setAdding }: {
  icon: React.ReactNode; title: string; count: number;
  onAdd?: () => void; adding?: boolean; setAdding?: (v: boolean) => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-sm font-medium">{title}</h2>
        <span className="rounded-full bg-muted/60 px-1.5 text-[11px] text-muted-foreground">{count}</span>
      </div>
      {setAdding && (
        <button onClick={() => setAdding(!adding)}
          className="flex items-center gap-1 rounded-md border border-border/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          Ajouter
        </button>
      )}
    </div>
  );
}

function runAction(action: Action): Promise<{ ok: boolean; status: number; body: string; latency: number }> {
  const start = Date.now();
  if (!action.endpoint) {
    return Promise.resolve({ ok: true, status: 200, body: '{"simulated": true}', latency: 0 });
  }
  return fetch(action.endpoint, {
    method: action.method,
    headers: { "Content-Type": "application/json", ...(action.headers ?? {}) },
    body: action.body_template ?? undefined,
  }).then(async (res) => {
    const body = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, body, latency: Date.now() - start };
  }).catch((err) => ({
    ok: false, status: 0, body: String(err), latency: Date.now() - start,
  }));
}

export default function ActionHub() {
  const qc = useQueryClient();
  const inv = (keys: string[]) => keys.forEach(k => qc.invalidateQueries({ queryKey: [k] }));

  const [tab, setTab] = useState<"actions" | "webhooks" | "logs">("actions");
  const [addingAction, setAddingAction] = useState(false);
  const [addingWebhook, setAddingWebhook] = useState(false);
  const [aVals, setAVals] = useState<Record<string, string>>({});
  const [wVals, setWVals] = useState<Record<string, string>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);

  const actions  = useQuery({ queryKey: ["actions"], queryFn: listActions });
  const logs     = useQuery({ queryKey: ["action_logs"], queryFn: () => listActionLogs() });
  const webhooks = useQuery({ queryKey: ["webhooks"], queryFn: listWebhooks });
  const actionLogs = useQuery({
    queryKey: ["action_logs", selectedActionId],
    queryFn: () => listActionLogs(selectedActionId ?? undefined),
    enabled: !!selectedActionId,
  });

  const createActionMut = useMutation({
    mutationFn: createAction,
    onSuccess: () => { toast.success("Action créée"); inv(["actions"]); setAddingAction(false); setAVals({}); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });
  const updateActionMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Action> }) => updateAction(id, patch),
    onSuccess: () => { inv(["actions"]); },
  });
  const createWebhookMut = useMutation({
    mutationFn: createWebhook,
    onSuccess: () => { toast.success("Webhook créé"); inv(["webhooks"]); setAddingWebhook(false); setWVals({}); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });
  const updateWebhookMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Webhook> }) => updateWebhook(id, patch),
    onSuccess: () => { inv(["webhooks"]); },
  });

  async function handleRun(action: Action) {
    if (running) return;
    setRunning(action.id);
    try {
      const result = await runAction(action);
      await logAction(action.id, {
        status: result.ok ? "success" : "failed",
        request_body: action.body_template,
        response_body: result.body.slice(0, 2000),
        status_code: result.status,
        latency_ms: result.latency,
        error: result.ok ? null : result.body.slice(0, 500),
      });
      await updateAction(action.id, { run_count: action.run_count + 1, last_run_at: new Date().toISOString() });
      inv(["actions", "action_logs"]);
      toast[result.ok ? "success" : "error"](
        result.ok ? `Action exécutée (${result.latency}ms)` : `Erreur HTTP ${result.status}`,
      );
    } finally {
      setRunning(null);
    }
  }

  const TABS = [
    { id: "actions", label: `Actions (${(actions.data ?? []).length})` },
    { id: "webhooks", label: `Webhooks (${(webhooks.data ?? []).length})` },
    { id: "logs", label: "Logs" },
  ] as const;

  return (
    <AuthedLayout>
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold tracking-tight">Action Hub</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Actions exécutables, webhooks entrants/sortants, historique.
            </p>
          </div>
        </div>

        <div className="flex gap-0.5 rounded-lg border border-border/50 bg-muted/20 p-0.5">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={["flex-1 rounded-md py-1.5 text-xs font-medium transition-colors",
                tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ACTIONS */}
        {tab === "actions" && (
          <section>
            <SectionHeader icon={<Zap className="h-4 w-4" />} title="Actions" count={(actions.data ?? []).length} adding={addingAction} setAdding={setAddingAction} />

            {addingAction && (
              <form onSubmit={e => {
                e.preventDefault();
                createActionMut.mutate({
                  name: aVals.name || "Action",
                  description: aVals.description || null,
                  category: aVals.category || "custom",
                  endpoint: aVals.endpoint || null,
                  method: (aVals.method as Action["method"]) || "POST",
                  body_template: aVals.body_template || null,
                });
              }}
                className="mb-4 rounded-xl border border-border/60 bg-card/30 p-4 space-y-3"
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { key: "name", placeholder: "Nom *" },
                    { key: "category", placeholder: "Catégorie (ex: notification, data, ai)" },
                    { key: "description", placeholder: "Description" },
                    { key: "endpoint", placeholder: "URL endpoint (laisser vide pour simuler)" },
                  ].map(f => (
                    <input key={f.key} value={aVals[f.key] ?? ""} onChange={e => setAVals(v => ({ ...v, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="rounded-md border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  ))}
                  <select value={aVals.method ?? "POST"} onChange={e => setAVals(v => ({ ...v, method: e.target.value }))}
                    className="rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none"
                  >
                    <option>POST</option><option>GET</option><option>PUT</option><option>PATCH</option><option>DELETE</option>
                  </select>
                  <textarea value={aVals.body_template ?? ""} onChange={e => setAVals(v => ({ ...v, body_template: e.target.value }))}
                    placeholder='Corps JSON (ex: {"key": "value"})'
                    rows={3}
                    className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs focus:outline-none resize-y"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => { setAddingAction(false); setAVals({}); }} className="px-3 py-1.5 text-xs text-muted-foreground">Annuler</button>
                  <button type="submit" disabled={createActionMut.isPending} className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
                    {createActionMut.isPending ? "…" : "Créer"}
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2">
              {(actions.data ?? []).length === 0 && !addingAction && (
                <div className="py-8 text-center text-sm text-muted-foreground/60">Aucune action. Créez votre première action automatisée.</div>
              )}
              {(actions.data ?? []).map((a: Action) => (
                <div key={a.id} className="rounded-xl border border-border/50 bg-card/20">
                  <div className="flex items-center gap-3 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{a.name}</span>
                        <span className="rounded-full bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">{a.category}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[a.status]}`}>{a.status}</span>
                      </div>
                      {a.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{a.description}</p>}
                      {a.endpoint && (
                        <p className="font-mono text-[10px] text-primary/50 truncate mt-0.5">
                          <span className="text-muted-foreground">{a.method} </span>{a.endpoint}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">{a.run_count} runs</span>
                      <select value={a.status}
                        onChange={e => updateActionMut.mutate({ id: a.id, patch: { status: e.target.value as Action["status"] } })}
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs text-muted-foreground focus:outline-none"
                      >
                        <option value="draft">draft</option>
                        <option value="active">actif</option>
                        <option value="disabled">désactivé</option>
                      </select>
                      <button
                        onClick={() => handleRun(a)}
                        disabled={running === a.id || a.status === "disabled"}
                        className="flex items-center gap-1.5 rounded-md bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-40"
                      >
                        <Play className="h-3 w-3" />
                        {running === a.id ? "…" : "Exécuter"}
                      </button>
                      <button onClick={() => setSelectedActionId(selectedActionId === a.id ? null : a.id)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ChevronRight className={`h-4 w-4 transition-transform ${selectedActionId === a.id ? "rotate-90" : ""}`} />
                      </button>
                    </div>
                  </div>
                  {selectedActionId === a.id && (
                    <div className="border-t border-border/50 p-4">
                      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Derniers logs</p>
                      {(actionLogs.data ?? []).length === 0 ? (
                        <p className="text-xs text-muted-foreground/60">Aucun log pour cette action.</p>
                      ) : (
                        <ul className="space-y-1">
                          {(actionLogs.data ?? []).slice(0, 5).map((log: ActionLog) => (
                            <li key={log.id} className="flex items-center gap-2 text-[11px]">
                              <span className={LOG_STYLE[log.status]}>{log.status}</span>
                              <span className="text-muted-foreground">{log.status_code != null ? `HTTP ${log.status_code}` : ""}</span>
                              {log.latency_ms != null && <span className="text-muted-foreground">{log.latency_ms}ms</span>}
                              <span className="text-muted-foreground/50 ml-auto">{new Date(log.created_at).toLocaleTimeString("fr-FR")}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* WEBHOOKS */}
        {tab === "webhooks" && (
          <section>
            <SectionHeader icon={<Globe className="h-4 w-4" />} title="Webhooks" count={(webhooks.data ?? []).length} adding={addingWebhook} setAdding={setAddingWebhook} />

            {addingWebhook && (
              <form onSubmit={e => {
                e.preventDefault();
                createWebhookMut.mutate({
                  name: wVals.name || "Webhook",
                  description: wVals.description || null,
                  direction: (wVals.direction as Webhook["direction"]) || "inbound",
                  url: wVals.url || null,
                  events: wVals.events ? wVals.events.split(",").map(s => s.trim()).filter(Boolean) : [],
                });
              }}
                className="mb-4 rounded-xl border border-border/60 bg-card/30 p-4 space-y-3"
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { key: "name", placeholder: "Nom *" },
                    { key: "url", placeholder: "URL cible (pour outbound)" },
                    { key: "description", placeholder: "Description" },
                    { key: "events", placeholder: "Événements (séparés par virgule)" },
                  ].map(f => (
                    <input key={f.key} value={wVals[f.key] ?? ""} onChange={e => setWVals(v => ({ ...v, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="rounded-md border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  ))}
                  <select value={wVals.direction ?? "inbound"} onChange={e => setWVals(v => ({ ...v, direction: e.target.value }))}
                    className="rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none"
                  >
                    <option value="inbound">Entrant (inbound)</option>
                    <option value="outbound">Sortant (outbound)</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => { setAddingWebhook(false); setWVals({}); }} className="px-3 py-1.5 text-xs text-muted-foreground">Annuler</button>
                  <button type="submit" disabled={createWebhookMut.isPending} className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
                    {createWebhookMut.isPending ? "…" : "Créer"}
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2">
              {(webhooks.data ?? []).length === 0 && !addingWebhook && (
                <div className="py-8 text-center text-sm text-muted-foreground/60">Aucun webhook configuré.</div>
              )}
              {(webhooks.data ?? []).map((w: Webhook) => (
                <div key={w.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/20 p-4">
                  {w.direction === "inbound"
                    ? <ArrowDownToLine className="h-4 w-4 shrink-0 text-blue-400" />
                    : <ArrowUpFromLine className="h-4 w-4 shrink-0 text-emerald-400" />
                  }
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{w.name}</span>
                      <span className={`text-[10px] ${w.direction === "inbound" ? "text-blue-400" : "text-emerald-400"}`}>
                        {w.direction}
                      </span>
                    </div>
                    {w.url && <p className="font-mono text-[10px] text-primary/50 truncate">{w.url}</p>}
                    {(w.events ?? []).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {w.events.map(ev => (
                          <span key={ev} className="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{ev}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">{w.received_count}</span>
                    <select value={w.status}
                      onChange={e => updateWebhookMut.mutate({ id: w.id, patch: { status: e.target.value as Webhook["status"] } })}
                      className="rounded-md border border-input bg-background px-2 py-1 text-xs text-muted-foreground focus:outline-none"
                    >
                      <option value="active">actif</option>
                      <option value="draft">draft</option>
                      <option value="disabled">désactivé</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* LOGS */}
        {tab === "logs" && (
          <section>
            <SectionHeader icon={<Clock className="h-4 w-4" />} title="Historique d'exécution" count={(logs.data ?? []).length} />
            {(logs.data ?? []).length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground/60">Aucun log enregistré.</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border/50">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/20">
                      {["Statut", "HTTP", "Latence", "Horodatage"].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(logs.data ?? []).map((log: ActionLog) => (
                      <tr key={log.id} className="border-b border-border/30 hover:bg-muted/10">
                        <td className={`px-4 py-2.5 font-medium ${LOG_STYLE[log.status]}`}>{log.status}</td>
                        <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{log.status_code ?? "—"}</td>
                        <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{log.latency_ms != null ? `${log.latency_ms}ms` : "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{new Date(log.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </AuthedLayout>
  );
}
