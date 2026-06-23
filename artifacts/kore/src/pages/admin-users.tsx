import { useState, useEffect } from "react";
import { Users, UserPlus, Shield, AlertCircle, Loader2, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getToken, getStoredUser } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/PageHeader";
import { getApiBase } from "@/lib/api";

interface UserRow {
  id: number;
  email: string;
  name: string;
  role: "owner" | "admin" | "member" | "viewer";
  status: "active" | "suspended" | "pending";
  lastLoginAt?: string;
  createdAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Propriétaire",
  admin: "Admin",
  member: "Membre",
  viewer: "Lecteur",
};

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-purple-50 text-purple-600 border-purple-200",
  admin: "bg-blue-50 text-blue-600 border-blue-200",
  member: "bg-green-50 text-green-600 border-green-200",
  viewer: "bg-gray-50 text-gray-500 border-gray-200",
};

export default function AdminUsers() {
  const me = getStoredUser();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member");
  const [inviting, setInviting] = useState(false);
  const { toast } = useToast();

  async function fetchUsers() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/api/users`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        setUsers(await res.json());
      } else {
        setError("Impossible de charger les utilisateurs.");
      }
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchUsers(); }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      const res = await fetch(`${getApiBase()}/api/users/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ email: inviteEmail, name: inviteName, password: invitePassword, role: inviteRole }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Utilisateur invité", description: `${inviteEmail} a été ajouté.` });
        setShowInvite(false);
        setInviteEmail(""); setInviteName(""); setInvitePassword("");
        fetchUsers();
      } else {
        toast({ title: "Erreur", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setInviting(false);
    }
  }

  const canManage = me?.role === "owner" || me?.role === "admin";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader
        icon={Users}
        title="Gestion des utilisateurs"
        subtitle="Membres de votre workspace et leurs rôles."
        action={canManage ? (
          <Button size="sm" onClick={() => setShowInvite((s) => !s)}>
            <UserPlus className="w-4 h-4 mr-2" />
            Inviter
          </Button>
        ) : undefined}
      />

      {showInvite && canManage && (
        <Card className="border-border/50 bg-muted/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Inviter un utilisateur</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <Input placeholder="Prénom et nom" value={inviteName} onChange={(e) => setInviteName(e.target.value)} required />
                <Input type="email" placeholder="Email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
                <Input type="password" placeholder="Mot de passe temporaire (8 car. min)" value={invitePassword} onChange={(e) => setInvitePassword(e.target.value)} required minLength={8} />
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "admin" | "member" | "viewer")}
                >
                  <option value="admin">Admin</option>
                  <option value="member">Membre</option>
                  <option value="viewer">Lecteur</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={inviting}>
                  {inviting && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                  Créer le compte
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowInvite(false)}>Annuler</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-sm text-destructive p-4 bg-destructive/5 rounded-lg">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <Card key={u.id} className="border-border/50">
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="w-9 h-9 rounded-full bg-foreground/10 flex items-center justify-center text-sm font-semibold shrink-0">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{u.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${ROLE_COLORS[u.role]}`}>{ROLE_LABELS[u.role]}</span>
                      {u.status !== "active" && <span className="text-xs text-amber-500">({u.status})</span>}
                      {u.id === me?.id && <span className="text-xs text-muted-foreground">(vous)</span>}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                      <Mail className="w-3 h-3" />
                      {u.email}
                      {u.lastLoginAt && (
                        <span className="ml-2">· Dernière connexion : {new Date(u.lastLoginAt).toLocaleDateString("fr-FR")}</span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {users.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">Aucun utilisateur trouvé.</p>
          )}
        </div>
      )}
    </div>
  );
}
