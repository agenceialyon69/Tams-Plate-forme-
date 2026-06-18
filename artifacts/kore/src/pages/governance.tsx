import { Shield, Users, Lock, Activity, CheckCircle2, AlertTriangle, Settings2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getStoredUser } from "@/lib/auth";

const ROLES = [
  { name: "owner", label: "Propriétaire", color: "bg-purple-500/10 text-purple-600 border-purple-200", perms: ["Tout faire, gérer le workspace, supprimer"] },
  { name: "admin", label: "Admin", color: "bg-blue-500/10 text-blue-600 border-blue-200", perms: ["Gérer les utilisateurs, accéder à tout sauf supprimer"] },
  { name: "member", label: "Membre", color: "bg-green-500/10 text-green-600 border-green-200", perms: ["Lire, créer, modifier ses propres données"] },
  { name: "viewer", label: "Lecteur", color: "bg-gray-500/10 text-gray-600 border-gray-200", perms: ["Lecture seule — aucune modification"] },
];

const POLICIES = [
  { id: "p1", name: "Isolation tenant stricte", status: "active", description: "Aucune donnée ne peut traverser les frontières de workspace." },
  { id: "p2", name: "Audit trail immuable", status: "active", description: "Toute action sensible est journalisée et non effaçable depuis l'UI." },
  { id: "p3", name: "Contrôle backend des permissions", status: "active", description: "Toutes les vérifications RBAC sont effectuées côté serveur." },
  { id: "p4", name: "Pas de secret en dur", status: "active", description: "Les credentials sont injectés via variables d'environnement." },
  { id: "p5", name: "Mode simulation IA", status: "planned", description: "Les actions IA sensibles doivent pouvoir être rejouées en dry-run." },
  { id: "p6", name: "Workflow d'approbation", status: "planned", description: "Actions externes requièrent une validation explicite." },
];

const MODULES = [
  { name: "Audit Trail", read: true, write: true, admin: true, export: true },
  { name: "Red Team", read: true, write: true, admin: false, export: true },
  { name: "Mémoire IA", read: true, write: true, admin: false, export: false },
  { name: "Prospection", read: true, write: true, admin: false, export: true },
  { name: "Export", read: true, write: false, admin: true, export: true },
  { name: "Paramètres IA", read: true, write: false, admin: true, export: false },
  { name: "Gestion Utilisateurs", read: false, write: false, admin: true, export: false },
];

export default function Governance() {
  const user = getStoredUser();

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-accent" />
          <h1 className="text-2xl font-serif font-semibold">Gouvernance</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Vue centralisée des rôles, permissions, politiques actives et état de sécurité de la plateforme.
        </p>
      </div>

      {user && (
        <Card className="border-border/50 bg-muted/20">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Connecté en tant que</span>
                <span className="font-medium">{user.name}</span>
                <span className="text-muted-foreground">({user.email})</span>
              </div>
              <Badge variant="outline" className="capitalize">{user.role}</Badge>
              <span className="text-xs text-muted-foreground">Workspace : {user.tenantSlug}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              Rôles et permissions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ROLES.map((role) => (
              <div key={role.name} className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${role.color}`}>
                    {role.label}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground pl-1">{role.perms[0]}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="w-4 h-4 text-muted-foreground" />
              Politiques actives
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {POLICIES.map((p) => (
              <div key={p.id} className="flex items-start gap-2.5">
                {p.status === "active"
                  ? <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  : <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                }
                <div>
                  <p className="text-xs font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.description}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            Matrice des accès par module
          </CardTitle>
          <CardDescription className="text-xs">
            Indique si un rôle <strong>Member</strong> peut effectuer chaque action.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Module</th>
                  <th className="text-center py-2 px-3 font-medium text-muted-foreground">Lecture</th>
                  <th className="text-center py-2 px-3 font-medium text-muted-foreground">Écriture</th>
                  <th className="text-center py-2 px-3 font-medium text-muted-foreground">Admin</th>
                  <th className="text-center py-2 px-3 font-medium text-muted-foreground">Export</th>
                </tr>
              </thead>
              <tbody>
                {MODULES.map((m) => (
                  <tr key={m.name} className="border-b border-border/30 last:border-0">
                    <td className="py-2 pr-4 font-medium">{m.name}</td>
                    {[m.read, m.write, m.admin, m.export].map((allowed, i) => (
                      <td key={i} className="text-center py-2 px-3">
                        {allowed
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mx-auto" />
                          : <span className="text-muted-foreground/40">—</span>
                        }
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
