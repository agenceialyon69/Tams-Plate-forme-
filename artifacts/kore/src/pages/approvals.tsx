import { useState } from "react";
import { CheckCircle2, XCircle, Clock, AlertTriangle, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface ApprovalItem {
  id: string;
  action: string;
  resource: string;
  requestedBy: string;
  requestedAt: string;
  risk: "low" | "medium" | "high" | "critical";
  status: "pending" | "approved" | "rejected";
  details: string;
}

const MOCK_APPROVALS: ApprovalItem[] = [
  { id: "a1", action: "Export massif de contacts", resource: "leads (247 entrées)", requestedBy: "alice@example.com", requestedAt: "2025-06-18T10:23:00Z", risk: "high", status: "pending", details: "Export CSV de 247 contacts qualifiés vers CRM externe." },
  { id: "a2", action: "Déclenchement séquence email", resource: "Playbook Outbound Enterprise", requestedBy: "bob@example.com", requestedAt: "2025-06-18T09:45:00Z", risk: "medium", status: "pending", details: "Lancement d'une séquence automatisée pour 38 prospects chauds." },
  { id: "a3", action: "Modification politique d'accès", resource: "Policy: No Cross-Tenant Access", requestedBy: "alice@example.com", requestedAt: "2025-06-17T16:10:00Z", risk: "critical", status: "pending", details: "Proposition de relaxer la politique d'isolation tenant pour un cas test." },
  { id: "a4", action: "Export de l'audit trail", resource: "audit_logs (6 mois)", requestedBy: "admin@gandal.local", requestedAt: "2025-06-17T11:30:00Z", risk: "medium", status: "approved", details: "Export JSON complet de l'audit trail pour audit externe." },
  { id: "a5", action: "Test Red Team injection", resource: "Prompt: Briefing System", requestedBy: "admin@gandal.local", requestedAt: "2025-06-16T14:20:00Z", risk: "high", status: "rejected", details: "Simulation d'une attaque par prompt injection sur le briefing." },
];

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
};

export default function Approvals() {
  const [items, setItems] = useState<ApprovalItem[]>(MOCK_APPROVALS);
  const { toast } = useToast();

  function decide(id: string, decision: "approved" | "rejected") {
    setItems((prev) => prev.map((a) => a.id === id ? { ...a, status: decision } : a));
    toast({
      title: decision === "approved" ? "Action approuvée" : "Action rejetée",
      description: `La décision a été enregistrée dans l'audit trail.`,
    });
  }

  const pending = items.filter((a) => a.status === "pending");
  const resolved = items.filter((a) => a.status !== "pending");

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-accent" />
          <h1 className="text-2xl font-serif font-semibold">Approbations</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Actions sensibles en attente de validation. Chaque décision est journalisée.
        </p>
      </div>

      {pending.length > 0 && (
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
                    <p className="text-xs text-muted-foreground">{item.details}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Par : {item.requestedBy}</span>
                      <span>{new Date(item.requestedAt).toLocaleString("fr-FR")}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => decide(item.id, "approved")}
                    className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Approuver
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => decide(item.id, "rejected")}
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
            const cfg = STATUS_CONFIG[item.status];
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
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {cfg.label} · {item.requestedBy} · {new Date(item.requestedAt).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {items.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Aucune action en attente de validation.
        </div>
      )}
    </div>
  );
}
