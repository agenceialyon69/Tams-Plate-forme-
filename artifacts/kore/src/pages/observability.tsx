import { useState } from "react";
import { Activity, AlertTriangle, Zap, Clock, CheckCircle2, XCircle, RefreshCw, PowerOff, Power, Plus, Loader2, AlertCircle, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

interface AuditLog {
  id: number;
  userId?: number | null;
  tenantId?: number | null;
  action: string;
  resource: string;
  method: string;
  path: string;
  statusCode?: number | null;
  ip?: string | null;
  createdAt: string;
}

interface KillSwitch {
  id: number;
  target: "agent" | "provider" | "workflow" | "module";
  targetName: string;
  active: boolean;
  reason?: string | null;
  activatedAt?: string | null;
  updatedAt: string;
}

interface TenantQuota {
  maxAiCallsPerDay: number;
  maxAiCallsPerMonth: number;
  aiCallsToday: number;
  aiCallsThisMonth: number;
  costBudgetCentsPerMonth: number;
  costCentsThisMonth: number;
}

interface AuditPage { logs: AuditLog[]; total: number; }

const BLANK_KS = { target: "provider" as KillSwitch["target"], targetName: "", reason: "" };

export default function Observability() {
  const [showKsForm, setShowKsForm] = useState(false);
  const [ksForm, setKsForm] = useState(BLANK_KS);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const user = getStoredUser();
  const canAdmin = user?.role === "admin" || user?.role === "owner";

  const { data: auditData } = useQuery<AuditPage>({
    queryKey: ["audit-obs"],
    queryFn: () => apiFetch<AuditPage>("/audit?limit=20"),
    refetchInterval: 60_000,
  });

  const { data: killSwitches = [], isLoading: ksLoading } = useQuery<KillSwitch[]>({
    queryKey: ["kill-switches"],
    queryFn: () => apiFetch<KillSwitch[]>("/kill-switches"),
    enabled: canAdmin,
  });

  const { data: quota } = useQuery<TenantQuota>({
    queryKey: ["quotas"],
    queryFn: () => apiFetch<TenantQuota>("/quotas"),
  });

  const createKsMutation = useMutation({
    mutationFn: (data: typeof BLANK_KS) => apiFetch<KillSwitch>("/kill-switches", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kill-switches"] });
      toast({ title: "Kill switch créé" });
      setShowKsForm(false);
      setKsForm(BLANK_KS);
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const activateMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      apiFetch<KillSwitch>(`/kill-switches/${id}/activate`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["kill-switches"] }); toast({ title: "Kill switch activé", description: "L'agent/provider/workflow est arrêté." }); },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => apiFetch<KillSwitch>(`/kill-switches/${id}/deactivate`, { method: "POST", body: "{}" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["kill-switches"] }); toast({ title: "Kill switch désactivé" }); },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const recentLogs = auditData?.logs?.slice(0, 15) ?? [];
  const activeKillSwitches = killSwitches.filter((k) => k.active);

  const aiUsagePct = quota ? Math.round((quota.aiCallsToday / quota.maxAiCallsPerDay) * 100) : 0;
  const budgetPct = quota ? Math.round((quota.costCentsThisMonth / quota.costBudgetCentsPerMonth) * 100) : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <PageHeader
        icon={Activity}
        title="Observabilité"
        subtitle="Vue santé globale — audit, quotas IA, kill switches, coûts, activité par tenant."
      />

      {activeKillSwitches.length > 0 && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
          <PowerOff className="w-4 h-4 text-red-500 shrink-0" />
          <span className="text-sm text-red-700 dark:text-red-400 font-medium">
            {activeKillSwitches.length} kill switch{activeKillSwitches.length > 1 ? "es" : ""} actif{activeKillSwitches.length > 1 ? "s" : ""} — {activeKillSwitches.map((k) => k.targetName).join(", ")}
          </span>
        </div>
      )}

      {quota && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-border/50">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Appels IA (aujourd'hui)</p>
              <p className="text-2xl font-semibold mt-1">{quota.aiCallsToday}</p>
              <p className="text-xs text-muted-foreground mt-0.5">/ {quota.maxAiCallsPerDay} max</p>
              <div className="mt-2 h-1 bg-border rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${aiUsagePct > 80 ? "bg-red-500" : aiUsagePct > 60 ? "bg-amber-400" : "bg-green-500"}`} style={{ width: `${Math.min(aiUsagePct, 100)}%` }} />
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Appels IA (ce mois)</p>
              <p className="text-2xl font-semibold mt-1">{quota.aiCallsThisMonth}</p>
              <p className="text-xs text-muted-foreground mt-0.5">/ {quota.maxAiCallsPerMonth} max</p>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Budget IA utilisé</p>
              <p className="text-2xl font-semibold mt-1">{(quota.costCentsThisMonth / 100).toFixed(2)}€</p>
              <p className="text-xs text-muted-foreground mt-0.5">/ {(quota.costBudgetCentsPerMonth / 100).toFixed(0)}€ budget</p>
              <div className="mt-2 h-1 bg-border rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${budgetPct > 80 ? "bg-red-500" : budgetPct > 60 ? "bg-amber-400" : "bg-green-500"}`} style={{ width: `${Math.min(budgetPct, 100)}%` }} />
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Kill switches actifs</p>
              <p className={`text-2xl font-semibold mt-1 ${activeKillSwitches.length > 0 ? "text-red-500" : ""}`}>{activeKillSwitches.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">/ {killSwitches.length} configurés</p>
            </CardContent>
          </Card>
        </div>
      )}

      {canAdmin && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Kill Switches d'urgence</h2>
            <Button size="sm" variant="outline" onClick={() => setShowKsForm((v) => !v)} className="gap-1.5 h-7 text-xs">
              {showKsForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {showKsForm ? "Annuler" : "Ajouter"}
            </Button>
          </div>

          {showKsForm && (
            <Card className="border-border/50">
              <CardContent className="pt-4 pb-4 space-y-3">
                <div className="grid sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Cible</label>
                    <select
                      value={ksForm.target}
                      onChange={(e) => setKsForm((f) => ({ ...f, target: e.target.value as KillSwitch["target"] }))}
                      className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-background"
                    >
                      {["agent", "provider", "workflow", "module"].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <Input placeholder="Nom (ex: Google Gemini)" value={ksForm.targetName} onChange={(e) => setKsForm((f) => ({ ...f, targetName: e.target.value }))} />
                  <Input placeholder="Raison (optionnel)" value={ksForm.reason} onChange={(e) => setKsForm((f) => ({ ...f, reason: e.target.value }))} />
                </div>
                <Button size="sm" onClick={() => createKsMutation.mutate(ksForm)} disabled={!ksForm.targetName.trim() || createKsMutation.isPending} className="gap-1.5">
                  {createKsMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Créer le kill switch
                </Button>
              </CardContent>
            </Card>
          )}

          {ksLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : killSwitches.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Aucun kill switch configuré.</p>
          ) : (
            <div className="space-y-2">
              {killSwitches.map((ks) => (
                <Card key={ks.id} className={`border-border/50 ${ks.active ? "border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-950/10" : ""}`}>
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${ks.active ? "bg-red-500 animate-pulse" : "bg-gray-300"}`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{ks.targetName}</span>
                            <span className="text-xs text-muted-foreground capitalize px-1.5 py-0.5 bg-muted rounded">{ks.target}</span>
                            {ks.active && <span className="text-xs text-red-600 font-semibold">ACTIF</span>}
                          </div>
                          {ks.reason && <p className="text-xs text-muted-foreground mt-0.5">{ks.reason}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {ks.active ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deactivateMutation.mutate(ks.id)}
                            disabled={deactivateMutation.isPending}
                            className="h-7 text-xs gap-1 border-green-200 text-green-700 hover:bg-green-50"
                          >
                            <Power className="w-3 h-3" /> Réactiver
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => activateMutation.mutate({ id: ks.id })}
                            disabled={activateMutation.isPending}
                            className="h-7 text-xs gap-1 border-red-200 text-red-700 hover:bg-red-50"
                          >
                            <PowerOff className="w-3 h-3" /> Couper
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Flux d'audit récent</CardTitle>
          <CardDescription className="text-xs">Dernières actions enregistrées sur le tenant</CardDescription>
        </CardHeader>
        <CardContent>
          {recentLogs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucune action récente.</p>
          ) : (
            <div className="space-y-1.5">
              {recentLogs.map((log) => {
                const ok = (log.statusCode ?? 200) < 400;
                return (
                  <div key={log.id} className="flex items-start gap-2.5 text-xs">
                    <span className="text-muted-foreground shrink-0 font-mono w-14">{new Date(log.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                    <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${ok ? "bg-green-500" : "bg-red-500"}`} />
                    <span className="font-mono text-muted-foreground shrink-0">{log.method}</span>
                    <span className="text-foreground/80 truncate">{log.action}</span>
                    {log.statusCode && <span className={`ml-auto shrink-0 font-mono ${ok ? "text-green-600" : "text-red-500"}`}>{log.statusCode}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
