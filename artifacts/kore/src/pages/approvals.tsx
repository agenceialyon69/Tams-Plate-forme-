import { useState } from "react";
import { CheckCircle2, XCircle, Clock, AlertTriangle, Plus, X, Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";

interface ApprovalRequest {
  id: number;
  tenantId: number;
  requestedById?: number | null;
  reviewedById?: number | null;
  action: string;
  resource: string;
  details: string;
  risk: "low" | "medium" | "high" | "critical";
  status: "pending" | "approved" | "rejected" | "cancelled" | "expired";
  reviewNote?: string | null;
  expiresAt?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

const RISK_COLORS: Record<string, string> = {
  low: "bg-green-50 text-green-600 border-green-200",
  medium: "bg-amber-50 text-amber-600 border-amber-200",
  high: "bg-orange-50 text-orange-600 border-orange-200",
  critical: "bg-red-50 text-red-600 border-red-200",
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.FC<{ className?: string }>; color: string }> = {
  pending: { label: "En attente", icon: Clock, color: "text-amber-500" },
  approved: { label: "Approuvé", icon: CheckCircle2, color: "text-green-500" },
  rejected: { label: "Rejeté", icon: XCircle, color: "text-red-500" },
  cancelled: { label: "Annulé", icon: XCircle, color: "text-gray-400" },
  expired: { label: "Expiré", icon: Clock, color: "text-gray-400" },
};

const BLANK_FORM = {
  action: "",
  resource: "",
  details: "",
  risk: "medium" as "low" | "medium" | "high" | "critical",
};

export default function Approvals() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [reviewNote, setReviewNote] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const user = getStoredUser();

  const { data: items = [], isLoading, error } = useQuery<ApprovalRequest[]>({
    queryKey: ["approvals"],
    queryFn: () => apiFetch<ApprovalRequest[]>("/approvals"),
    refetchInterval: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof BLANK_FORM) => apiFetch<ApprovalRequest>("/approvals", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      toast({ title: "Demande créée", description: "En attente de validation." });
      setShowForm(false);
      setForm(BLANK_FORM);
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, decision, note }: { id: number; decision: "approved" | "rejected" | "cancelled"; note?: string }) =>
      apiFetch<ApprovalRequest>(`/approvals/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ decision, note }),
      }),
    onSuccess: (_, { decision }) => {
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      toast({
        title: decision === "approved" ? "Action approuvée" : "Action rejetée",
        description: "La décision a été enregistrée dans l'audit trail.",
      });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const pending = items.filter((a) => a.status === "pending");
  const resolved = items.filter((a) => a.status !== "pending");

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-accent" />
            <h1 className="text-2xl font-serif font-semibold">Approbations</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Actions sensibles en attente de validation. Chaque décision est journalisée.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)} className="gap-1.5">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "Annuler" : "Nouvelle demande"}
        </Button>
      </div>

      {showForm && (
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-4 space-y-3">
            <h3 className="text-sm font-semibold">Nouvelle demande d'approbation</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <Input
                placeholder="Action (ex: Export massif de contacts)"
                value={form.action}
                onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))}
                className="sm:col-span-2"
              />
              <Input
                placeholder="Ressource concernée"
                value={form.resource}
                onChange={(e) => setForm((f) => ({ ...f, resource: e.target.value }))}
              />
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Niveau de risque</label>
                <select
                  value={form.risk}
                  onChange={(e) => setForm((f) => ({ ...f, risk: e.target.value as typeof form.risk }))}
                  className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-background"
                >
                  {["low", "medium", "high", "critical"].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <textarea
                placeholder="Détails / justification..."
                value={form.details}
                onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
                rows={3}
                className="sm:col-span-2 text-sm border border-border rounded-md px-3 py-2 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <Button
              size="sm"
              onClick={() => createMutation.mutate(form)}
              disabled={!form.action.trim() || !form.resource.trim() || createMutation.isPending}
              className="gap-1.5"
            >
              {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Soumettre
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/5 rounded-lg border border-destructive/20">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Impossible de charger les demandes.
        </div>
      )}

      {!isLoading && !error && pending.length > 0 && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">
            {pending.length} action{pending.length > 1 ? "s" : ""} en attente de validation
          </span>
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">En attente</h2>
          {pending.map((item) => (
            <Card key={item.id} className="border-border/50">
              <CardContent className="pt-4 pb-3 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{item.action}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${RISK_COLORS[item.risk]}`}>
                        risque {item.risk}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">Ressource : {item.resource}</p>
                    {item.details && <p className="text-xs text-muted-foreground">{item.details}</p>}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{new Date(item.createdAt).toLocaleString("fr-FR")}</span>
                      {item.expiresAt && <span>Expire : {new Date(item.expiresAt).toLocaleDateString("fr-FR")}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => reviewMutation.mutate({ id: item.id, decision: "approved" })}
                    disabled={reviewMutation.isPending}
                    className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Approuver
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => reviewMutation.mutate({ id: item.id, decision: "rejected" })}
                    disabled={reviewMutation.isPending}
                    className="border-red-200 text-red-600 hover:bg-red-50 h-7 text-xs"
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    Rejeter
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Historique</h2>
          {resolved.map((item) => {
            const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pending;
            const Icon = cfg.icon;
            return (
              <Card key={item.id} className="border-border/30 opacity-75">
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Icon className={`w-4 h-4 shrink-0 ${cfg.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{item.action}</span>
                        <span className="text-xs text-muted-foreground">— {item.resource}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full border capitalize ${RISK_COLORS[item.risk]}`}>
                          {item.risk}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {cfg.label} · {new Date(item.createdAt).toLocaleDateString("fr-FR")}
                        {item.reviewNote && ` · Note : ${item.reviewNote}`}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!isLoading && !error && items.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Aucune demande d'approbation pour l'instant.
        </div>
      )}
    </div>
  );
}
