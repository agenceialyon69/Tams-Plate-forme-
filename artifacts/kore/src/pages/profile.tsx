import { useState } from "react";
import { User, Shield, Mail, Building, KeyRound, Pencil, Check, X, Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStoredUser, clearToken, setStoredUser } from "@/lib/auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";

const ROLE_LABELS: Record<string, string> = {
  owner: "Propriétaire",
  admin: "Administrateur",
  member: "Membre",
  viewer: "Lecteur",
};

export default function Profile() {
  const user = getStoredUser();
  const [_, navigate] = useLocation();
  const { toast } = useToast();

  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(user?.name ?? "");
  const [nameLoading, setNameLoading] = useState(false);

  const [changingPwd, setChangingPwd] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);

  function handleLogout() {
    clearToken();
    navigate("/");
  }

  async function handleSaveName() {
    if (!newName.trim() || !user) return;
    setNameLoading(true);
    try {
      const updated = await apiFetch<{ id: number; name: string; email: string }>("/profile", {
        method: "PATCH",
        body: JSON.stringify({ name: newName.trim() }),
      });
      setStoredUser({ ...user, name: updated.name });
      toast({ title: "Nom mis à jour" });
      setEditingName(false);
    } catch (e: unknown) {
      toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" });
    } finally {
      setNameLoading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError(null);
    if (newPwd !== confirmPwd) {
      setPwdError("Les mots de passe ne correspondent pas.");
      return;
    }
    if (newPwd.length < 8) {
      setPwdError("Le nouveau mot de passe doit faire au moins 8 caractères.");
      return;
    }
    setPwdLoading(true);
    try {
      await apiFetch("/profile/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
      });
      toast({ title: "Mot de passe modifié", description: "Tu vas être déconnecté." });
      setTimeout(() => { clearToken(); navigate("/"); }, 1500);
    } catch (e: unknown) {
      setPwdError((e as Error).message);
    } finally {
      setPwdLoading(false);
    }
  }

  if (!user) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Profil non disponible. <button className="underline" onClick={() => navigate("/")}>Retour</button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <User className="w-5 h-5 text-accent" />
          <h1 className="text-2xl font-serif font-semibold">Mon profil</h1>
        </div>
        <p className="text-sm text-muted-foreground">Informations de compte et accès.</p>
      </div>

      <Card className="border-border/50">
        <CardContent className="pt-6 pb-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-foreground/10 flex items-center justify-center text-xl font-semibold">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="h-8 text-sm"
                    disabled={nameLoading}
                    autoFocus
                  />
                  <button onClick={handleSaveName} disabled={nameLoading} className="text-green-600 hover:text-green-700">
                    {nameLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </button>
                  <button onClick={() => { setEditingName(false); setNewName(user.name); }} className="text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-lg">{user.name}</p>
                  <button
                    onClick={() => setEditingName(true)}
                    className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                    title="Modifier le nom"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>

          <div className="grid gap-3 pt-2">
            <div className="flex items-center gap-3 text-sm">
              <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Rôle :</span>
              <Badge variant="outline" className="capitalize">{ROLE_LABELS[user.role] ?? user.role}</Badge>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Building className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Workspace :</span>
              <span className="font-medium">{user.tenantName ?? user.tenantSlug}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Email :</span>
              <span>{user.email}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-muted-foreground" />
            Changer le mot de passe
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!changingPwd ? (
            <Button variant="outline" size="sm" onClick={() => setChangingPwd(true)}>
              Modifier le mot de passe
            </Button>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-3">
              <Input
                type="password"
                placeholder="Mot de passe actuel"
                value={currentPwd}
                onChange={(e) => { setCurrentPwd(e.target.value); setPwdError(null); }}
                disabled={pwdLoading}
                required
              />
              <Input
                type="password"
                placeholder="Nouveau mot de passe (8 caractères min.)"
                value={newPwd}
                onChange={(e) => { setNewPwd(e.target.value); setPwdError(null); }}
                disabled={pwdLoading}
                required
                minLength={8}
              />
              <Input
                type="password"
                placeholder="Confirmer le nouveau mot de passe"
                value={confirmPwd}
                onChange={(e) => { setConfirmPwd(e.target.value); setPwdError(null); }}
                disabled={pwdLoading}
                required
              />
              {pwdError && (
                <p className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {pwdError}
                </p>
              )}
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={pwdLoading} className="gap-1.5">
                  {pwdLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Changer
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => { setChangingPwd(false); setCurrentPwd(""); setNewPwd(""); setConfirmPwd(""); setPwdError(null); }}
                  disabled={pwdLoading}
                >
                  Annuler
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Permissions actives</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            {user.role === "owner" || user.role === "admin" ? (
              <>
                <p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500 shrink-0" /> Lire toutes les données du workspace</p>
                <p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500 shrink-0" /> Créer et modifier des données</p>
                <p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500 shrink-0" /> Exporter des données</p>
                <p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500 shrink-0" /> Gérer les utilisateurs</p>
                {user.role === "owner" && (
                  <p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" /> Administration complète du workspace</p>
                )}
              </>
            ) : user.role === "member" ? (
              <>
                <p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500 shrink-0" /> Lire et créer des données</p>
                <p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" /> Export limité (avec validation)</p>
                <p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-400 shrink-0" /> Pas d'accès administration</p>
              </>
            ) : (
              <p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" /> Lecture seule</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Button variant="outline" onClick={handleLogout} className="w-full text-destructive border-destructive/30 hover:bg-destructive/5">
        Se déconnecter
      </Button>
    </div>
  );
}
