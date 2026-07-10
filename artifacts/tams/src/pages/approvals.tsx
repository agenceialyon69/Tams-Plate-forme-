import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, Loader2, RefreshCw, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

type PermissionAction = {
  actionId: string;
  label: string;
  description: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  requiredPermission: string;
  humanApprovalRequired: boolean;
  dryRunSupported: boolean;
  externalSideEffect: boolean;
  rollbackPlan: string | null;
  source: string;
};

type AuditEvent = {
  id?: string;
  type?: string;
  severity?: string;
  summary?: string;
  source?: string;
  createdAt?: string;
};

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  const raw = await response.text();
  let payload: unknown = null;
  try { payload = raw ? JSON.parse(raw) : null; }
  catch { throw new Error(`Réponse JSON invalide (${response.status}).`); }
  if (!response.ok) {
    const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    throw new Error(typeof record.reason === "string" ? record.reason : typeof record.error === "string" ? record.error : `HTTP ${response.status}`);
  }
  return payload as T;
}

function riskClass(risk: string) {
  if (risk === "critical") return "border-rose-500/40 bg-rose-500/10 text-rose-100";
  if (risk === "high") return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  if (risk === "medium") return "border-blue-500/30 bg-blue-500/10 text-blue-200";
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
}

export default function ApprovalsPage() {
  const [actions, setActions] = useState<PermissionAction[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [operator, setOperator] = useState("Mohamed");
  const [reason, setReason] = useState("Validation manuelle depuis TAMS.");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const pendingActions = useMemo(() => actions.filter((action) => action.humanApprovalRequired), [actions]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [actionsPayload, auditPayload] = await Promise.allSettled([
        jsonRequest<{ actions?: PermissionAction[] }>("/api/permissions/actions"),
        jsonRequest<{ audit?: AuditEvent[] }>("/api/permissions/audit?limit=30"),
      ]);
      if (actionsPayload.status === "fulfilled") setActions(actionsPayload.value.actions ?? []);
      else setError(actionsPayload.reason instanceof Error ? actionsPayload.reason.message : "Actions permissions indisponibles.");
      if (auditPayload.status === "fulfilled") setAudit(auditPayload.value.audit ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function check(action: PermissionAction) {
    setBusyAction(action.actionId);
    setError(null);
    setNotice(null);
    try {
      const payload = await jsonRequest<{ reason?: string }>("/api/permissions/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: action.actionId, currentPermission: "read_only", dryRun: true, context: { source: "approvals-ui" } }),
      });
      setNotice(payload.reason ?? `Dry-run accepté pour ${action.actionId}.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Check impossible.");
    } finally {
      setBusyAction(null);
    }
  }

  async function approve(action: PermissionAction) {
    setBusyAction(action.actionId);
    setError(null);
    setNotice(null);
    try {
      await jsonRequest("/api/permissions/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: action.actionId, approvedBy: operator || "Mohamed", confirmation: action.actionId, reason, expiresInMinutes: 30 }),
      });
      setNotice(`Approval créé pour ${action.actionId} pendant 30 minutes.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Approval impossible.");
    } finally {
      setBusyAction(null);
    }
  }

  async function deny(action: PermissionAction) {
    setBusyAction(action.actionId);
    setError(null);
    setNotice(null);
    try {
      await jsonRequest("/api/permissions/deny", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: action.actionId, deniedBy: operator || "Mohamed", reason: reason || "Refus manuel." }),
      });
      setNotice(`Refus audité pour ${action.actionId}.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Refus impossible.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:pb-10 space-y-5">
        <header className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Approbations</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">File de validation humaine</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Actions sensibles réelles déclarées par le permission model. Les refus sont audités, les approvals expirent.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-100">
              <ShieldAlert className="h-5 w-5" />
              <span className="text-sm font-semibold">{pendingActions.length} action(s) à approbation</span>
            </div>
          </div>
        </header>

        <section className="grid gap-3 rounded-3xl border border-border bg-card p-5 md:grid-cols-[220px_1fr_auto] md:items-end">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Opérateur</span>
            <input value={operator} onChange={(event) => setOperator(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Raison approval/refus</span>
            <input value={reason} onChange={(event) => setReason(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
          </label>
          <button onClick={() => void load()} disabled={loading} className="min-h-[42px] rounded-xl border border-border px-3 text-sm"><RefreshCw className={`mr-1 inline h-4 w-4 ${loading ? "animate-spin" : ""}`} />Actualiser</button>
        </section>

        {error ? <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100"><XCircle className="mr-2 inline h-4 w-4" />{error}</div> : null}
        {notice ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100"><CheckCircle2 className="mr-2 inline h-4 w-4" />{notice}</div> : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
          <section className="rounded-3xl border border-border bg-card p-5 space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="h-5 w-5 text-primary" />Actions sensibles</h2>
            {loading && actions.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">Chargement des actions...</p> : null}
            {actions.map((action) => (
              <article key={action.actionId} className="rounded-2xl border border-border bg-background/70 p-4 space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{action.label}</h3>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${riskClass(action.riskLevel)}`}>{action.riskLevel}</span>
                      <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">{action.requiredPermission}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{action.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Source: {action.source} · dry-run: {String(action.dryRunSupported)} · effet externe: {String(action.externalSideEffect)}</p>
                    {action.rollbackPlan ? <p className="mt-1 text-xs text-muted-foreground">Rollback: {action.rollbackPlan}</p> : null}
                  </div>
                  {busyAction === action.actionId ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void check(action)} disabled={!!busyAction} className="rounded-xl bg-secondary px-3 py-2 text-xs font-semibold">Tester dry-run</button>
                  <button onClick={() => void approve(action)} disabled={!!busyAction || !action.humanApprovalRequired} className="rounded-xl bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-50">Approuver 30 min</button>
                  <button onClick={() => void deny(action)} disabled={!!busyAction || !action.humanApprovalRequired} className="rounded-xl bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-100 disabled:opacity-50">Refuser</button>
                </div>
              </article>
            ))}
          </section>

          <section className="rounded-3xl border border-border bg-card p-5 space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Clock className="h-5 w-5 text-primary" />Audit sécurité</h2>
            {audit.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Aucun événement sécurité retourné.</p> : null}
            {audit.map((event, index) => (
              <article key={event.id ?? index} className="border-l-2 border-primary/40 py-1 pl-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{event.type ?? "event"}</span>
                  {event.severity ? <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">{event.severity}</span> : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{event.summary ?? "Sans résumé"}</p>
                {event.createdAt ? <p className="mt-1 text-[10px] text-muted-foreground">{new Date(event.createdAt).toLocaleString("fr-FR")}</p> : null}
              </article>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
