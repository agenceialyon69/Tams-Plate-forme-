import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listCapabilities,
  listApprovals,
  listAuditLog,
  grantCapability,
  revokeCapability,
  decideApproval,
  type Capability,
  type Approval,
  type AuditEntry,
} from "@/lib/policy";
import { toast } from "sonner";
import {
  ShieldCheck,
  Plus,
  X,
  CheckCircle2,
  XCircle,
  Clock,
  ScrollText,
  ChevronDown,
} from "lucide-react";
import AuthedLayout from "@/components/layout/AuthedLayout";

function statusLabel(c: Capability): { text: string; color: string } {
  if (c.revoked_at) return { text: "révoquée", color: "text-destructive" };
  if (c.expires_at && new Date(c.expires_at) < new Date())
    return { text: "expirée", color: "text-muted-foreground" };
  return { text: "active", color: "text-emerald-500" };
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}

function absTime(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SecurityPage() {
  const qc = useQueryClient();
  const [scope, setScope] = useState("");
  const [resource, setResource] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [grantOpen, setGrantOpen] = useState(false);
  const [auditExpanded, setAuditExpanded] = useState(false);

  const caps = useQuery({ queryKey: ["capabilities"], queryFn: listCapabilities });
  const apprQ = useQuery({ queryKey: ["approvals"], queryFn: listApprovals });
  const auditQ = useQuery({ queryKey: ["audit"], queryFn: listAuditLog });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["capabilities"] });
    qc.invalidateQueries({ queryKey: ["approvals"] });
    qc.invalidateQueries({ queryKey: ["audit"] });
  };

  const grantMut = useMutation({
    mutationFn: grantCapability,
    onSuccess: () => {
      toast.success("Capability accordée");
      setScope("");
      setResource("");
      setGrantOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Échec"),
  });

  const revokeMut = useMutation({
    mutationFn: revokeCapability,
    onSuccess: () => {
      toast.success("Capability révoquée");
      invalidate();
    },
  });

  const decideMut = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approved" | "rejected" }) =>
      decideApproval(id, decision),
    onSuccess: () => {
      toast.success("Décision enregistrée");
      invalidate();
    },
  });

  const pending = (apprQ.data ?? []).filter((a: Approval) => a.status === "pending");
  const activeCaps = (caps.data ?? []).filter(
    (c: Capability) => !c.revoked_at && (!c.expires_at || new Date(c.expires_at) > new Date()),
  );
  const auditEntries: AuditEntry[] = auditQ.data ?? [];

  return (
    <AuthedLayout>
      <div className="mx-auto max-w-4xl space-y-8 p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold tracking-tight">Sécurité & permissions</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Deny-by-default. Toute action sensible exige une capability explicite
              ou une validation humaine.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Stat label="Actives" value={activeCaps.length} />
            <Stat label="En attente" value={pending.length} warning={pending.length > 0} />
          </div>
        </div>

        {pending.length > 0 && (
          <section>
            <SectionTitle icon={<Clock className="h-4 w-4" />} title="Approvals en attente" />
            <ul className="divide-y divide-border/50 rounded-xl border border-border/60 bg-card/30">
              {pending.map((a: Approval) => (
                <li key={a.id} className="flex items-start gap-4 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm font-medium">{a.tool_name}</div>
                    <pre className="mt-1 max-w-md overflow-x-auto rounded bg-muted/40 p-2 text-[11px] text-muted-foreground">
                      {JSON.stringify(a.input, null, 2)}
                    </pre>
                    <div className="mt-1 text-[11px] text-muted-foreground/60">
                      {relTime(a.created_at)} · expire {absTime(a.expires_at)}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => decideMut.mutate({ id: a.id, decision: "approved" })}
                      disabled={decideMut.isPending}
                      className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-500 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Approuver
                    </button>
                    <button
                      onClick={() => decideMut.mutate({ id: a.id, decision: "rejected" })}
                      disabled={decideMut.isPending}
                      className="flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Rejeter
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <div className="mb-3 flex items-center justify-between">
            <SectionTitle icon={<ShieldCheck className="h-4 w-4" />} title="Capabilities" />
            <button
              onClick={() => setGrantOpen(!grantOpen)}
              className="flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              Accorder
            </button>
          </div>

          {grantOpen && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!scope.trim()) return;
                grantMut.mutate({ scope: scope.trim(), resource: resource.trim() || undefined, expiresInMinutes: minutes });
              }}
              className="mb-4 space-y-3 rounded-xl border border-border/60 bg-card/30 p-4"
            >
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_120px]">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                    Scope <span className="text-destructive">*</span>
                  </label>
                  <input
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                    placeholder="tool:read_file"
                    required
                    className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                    Resource <span className="text-muted-foreground/40">(optionnel)</span>
                  </label>
                  <input
                    value={resource}
                    onChange={(e) => setResource(e.target.value)}
                    placeholder="/src/**"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                    Durée (min)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={43200}
                    value={minutes}
                    onChange={(e) => setMinutes(Number(e.target.value))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setGrantOpen(false)}
                  className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={grantMut.isPending || !scope.trim()}
                  className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {grantMut.isPending ? "…" : "Accorder"}
                </button>
              </div>
            </form>
          )}

          <div className="rounded-xl border border-border/60 bg-card/30">
            {caps.isLoading ? (
              <Loading />
            ) : (caps.data ?? []).length === 0 ? (
              <Empty text="Aucune capability — deny-by-default." />
            ) : (
              <ul className="divide-y divide-border/50">
                {(caps.data ?? []).map((c: Capability) => {
                  const st = statusLabel(c);
                  return (
                    <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                      <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${st.color === "text-emerald-500" ? "bg-emerald-500" : st.color === "text-destructive" ? "bg-destructive" : "bg-muted-foreground/40"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-xs font-medium">
                          {c.scope}
                          {c.resource && (
                            <span className="ml-1.5 text-muted-foreground">· {c.resource}</span>
                          )}
                        </div>
                        <div className={`text-[11px] ${st.color}`}>
                          {st.text}
                          {c.expires_at && !c.revoked_at && ` · ${absTime(c.expires_at)}`}
                          {c.revoked_at && ` · ${absTime(c.revoked_at)}`}
                        </div>
                      </div>
                      {!c.revoked_at &&
                        (!c.expires_at || new Date(c.expires_at) > new Date()) && (
                          <button
                            onClick={() => revokeMut.mutate(c.id)}
                            disabled={revokeMut.isPending}
                            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                          >
                            <X className="h-3 w-3" />
                            Révoquer
                          </button>
                        )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section>
          <button
            onClick={() => setAuditExpanded(!auditExpanded)}
            className="mb-3 flex w-full items-center justify-between"
          >
            <SectionTitle icon={<ScrollText className="h-4 w-4" />} title="Journal d'audit" />
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${auditExpanded ? "rotate-180" : ""}`}
            />
          </button>

          {(auditExpanded || auditEntries.length > 0) && (
            <div className="rounded-xl border border-border/60 bg-card/30">
              {auditQ.isLoading ? (
                <Loading />
              ) : auditEntries.length === 0 ? (
                <Empty text="Journal vide." />
              ) : (
                <ul
                  className={`divide-y divide-border/50 overflow-auto ${auditExpanded ? "max-h-[600px]" : "max-h-[280px]"}`}
                >
                  {auditEntries.map((e: AuditEntry) => (
                    <li key={e.id} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                      <div className="min-w-0">
                        <span className="font-mono text-xs font-medium">{e.kind}</span>
                        {e.subject && (
                          <span className="ml-2 truncate text-xs text-muted-foreground">
                            {e.subject}
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 text-[11px] text-muted-foreground/60">
                        {relTime(e.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>
    </AuthedLayout>
  );
}

function Stat({
  label,
  value,
  warning,
}: {
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/30 px-3 py-2 text-center">
      <div className={`text-lg font-semibold ${warning && value > 0 ? "text-amber-400" : ""}`}>
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function SectionTitle({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <h2 className="text-sm font-medium">{title}</h2>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="p-6 text-center text-sm text-muted-foreground">{text}</div>
  );
}
