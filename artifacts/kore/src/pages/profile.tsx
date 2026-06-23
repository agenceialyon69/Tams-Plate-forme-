import { useState, useEffect } from "react";
import { User, Shield, Mail, Building, KeyRound, Pencil, Check, X, Loader2, AlertCircle, Monitor, Smartphone, Tablet, LogOut, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStoredUser, clearToken, setStoredUser, getAccessToken } from "@/lib/auth";
import { useLocation } from "wouter";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Session {
  id: number;
  deviceName: string | null;
  ipAddress: string | null;
  lastActiveAt: string;
  createdAt: string;
  expiresAt: string;
}

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

  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [logoutOthersLoading, setLogoutOthersLoading] = useState(false);

  useEffect(() => {
    async function fetchSessions() {
      try {
        const data = await apiFetch<{ sessions: Session[] }>("/auth/sessions");
        setSessions(data.sessions);
      } catch (e) {
        setSessionsError((e as Error).message);
      } finally {
        setSessionsLoading(false);
      }
    }
    fetchSessions();
  }, []);

  async function handleRevokeSession(sessionId: number) {
    setRevokingId(sessionId);
    try {
      await apiFetch(`/auth/sessions/${sessionId}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      toast({ title: "Session révoquée" });
    } catch (e) {
      toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" });
    } finally {
      setRevokingId(null);
    }
  }

  async function handleLogoutOthers() {
    setLogoutOthersLoading(true);
    try {
      const result = await apiFetch<{ revokedCount: number }>("/auth/logout-others", {
        method: "POST",
        headers: { "X-Access-Token": getAccessToken() || "" },
      });
      setSessions((prev) => {
        const currentSession = prev.find((s) => s.deviceName?.includes("cet appareil") || s === prev[0]);
        return currentSession ? [currentSession] : prev.slice(0, 1);
      });
      toast({ title: `${result.revokedCount} autre(s) session(s) déconnectée(s)` });
    } catch (e) {
      toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLogoutOthersLoading(false);
    }
  }

  function handleLogout() {
    clearToken();
    navigate("/");
  }

  function getDeviceIcon(deviceName: string | null) {
    if (!deviceName) return Monitor;
    const name = deviceName.toLowerCase();
    if (name.includes("iphone") || name.includes("android phone")) return Smartphone;
    if (name.includes("ipad") || name.includes("android tablet") || name.includes("tablet")) return Tablet;
    return Monitor;
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
      <PageHeader icon={User} title="Mon profil" subtitle="Informations de compte et accès." />

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

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Monitor className="w-4 h-4 text-muted-foreground" />
              Sessions actives
            </CardTitle>
            {sessions.length > 1 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5 text-amber-600 border-amber-600/30 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                    disabled={logoutOthersLoading}
                  >
                    {logoutOthersLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
                    Déconnecter les autres
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Déconnecter toutes les autres sessions ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tu seras déconnecté de tous les autres appareils. Cette action est irréversible.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={handleLogoutOthers}>Confirmer</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {sessionsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : sessionsError ? (
            <p className="text-sm text-destructive">{sessionsError}</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune session active.</p>
          ) : (
            <div className="space-y-2">
              {sessions.map((session, idx) => {
                const DeviceIcon = getDeviceIcon(session.deviceName);
                const isCurrent = idx === 0;
                return (
                  <div
                    key={session.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="shrink-0 w-9 h-9 rounded-full bg-background flex items-center justify-center">
                      <DeviceIcon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{session.deviceName || "Appareil inconnu"}</p>
                        {isCurrent && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-accent/10 text-accent border-accent/30">
                            Cet appareil
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Actif {formatDistanceToNow(new Date(session.lastActiveAt), { addSuffix: true, locale: fr })}
                        {session.ipAddress && <span className="ml-2">· {session.ipAddress}</span>}
                      </p>
                    </div>
                    {!isCurrent && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                            disabled={revokingId === session.id}
                          >
                            {revokingId === session.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Révoquer cette session ?</AlertDialogTitle>
                            <AlertDialogDescription>
                              L&apos;appareil "{session.deviceName || "inconnu"}" sera déconnecté immédiatement.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleRevokeSession(session.id)}>
                              Révoquer
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Button variant="outline" onClick={handleLogout} className="w-full text-destructive border-destructive/30 hover:bg-destructive/5">
        Se déconnecter
      </Button>
    </div>
  );
}
