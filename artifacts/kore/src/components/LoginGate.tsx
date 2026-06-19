import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Eye, EyeOff, AlertCircle, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { getToken, setToken, clearToken, setStoredUser, onAuthChange, type AuthUser } from "@/lib/auth";
import { getApiBase } from "@/lib/api";

function GandalMark() {
  return (
    <div className="mx-auto w-14 h-14 rounded-2xl bg-foreground flex items-center justify-center shadow-lg">
      <span className="font-serif text-3xl font-semibold text-background">G</span>
    </div>
  );
}

type Tab = "login" | "register" | "forgot" | "reset";

export function LoginGate({ children }: { children: ReactNode }): ReactNode {
  const [authed, setAuthed] = useState<boolean>(() => Boolean(getToken()));
  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => onAuthChange(() => setAuthed(Boolean(getToken()))), []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken && urlToken.trim().length >= 16) {
      setToken(urlToken.trim());
      params.delete("token");
      const newUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
      window.history.replaceState({}, "", newUrl);
    }
    const resetParam = params.get("reset");
    if (resetParam) {
      setResetToken(resetParam);
      setTab("reset");
    }
  }, []);

  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      const res = await original(...args);
      if (res.status === 401) clearToken();
      return res;
    };
    return () => { window.fetch = original; };
  }, []);

  if (authed) return <>{children}</>;

  function switchTab(t: Tab) {
    setTab(t);
    setError(null);
    setSuccess(null);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erreur de connexion."); return; }
      setStoredUser(data.user as AuthUser);
      setToken(data.token);
    } catch {
      setError("Impossible de joindre le serveur.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim() || !name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erreur d'inscription."); return; }
      setStoredUser(data.user as AuthUser);
      setToken(data.token);
    } catch {
      setError("Impossible de joindre le serveur.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      setSuccess(data.message ?? "Un lien de réinitialisation a été généré.");
      if (data.resetToken) {
        setResetToken(data.resetToken);
      }
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetToken.trim() || !newPassword.trim()) return;
    if (newPassword.length < 8) { setError("Le mot de passe doit faire au moins 8 caractères."); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken.trim(), newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erreur lors de la réinitialisation."); return; }
      setSuccess(data.message ?? "Mot de passe réinitialisé !");
      setTimeout(() => switchTab("login"), 2000);
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-3">
          <GandalMark />
          <div>
            <h1 className="font-serif text-2xl font-semibold text-foreground tracking-tight">TAMS</h1>
            <p className="text-sm text-muted-foreground mt-1">Plateforme d'intelligence commerciale</p>
          </div>
        </div>

        {tab !== "forgot" && tab !== "reset" && (
          <div className="flex rounded-lg border border-border/50 p-1 bg-muted/30">
            <button
              onClick={() => switchTab("login")}
              className={`flex-1 text-sm py-1.5 rounded-md transition-colors font-medium ${tab === "login" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Connexion
            </button>
            <button
              onClick={() => switchTab("register")}
              className={`flex-1 text-sm py-1.5 rounded-md transition-colors font-medium ${tab === "register" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Créer un compte
            </button>
          </div>
        )}

        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {(tab === "forgot" || tab === "reset") && (
                <button onClick={() => switchTab("login")} className="text-muted-foreground hover:text-foreground mr-1">
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <Lock className="w-4 h-4 text-muted-foreground" />
              {tab === "login" ? "Accès sécurisé" : tab === "register" ? "Nouveau compte" : tab === "forgot" ? "Mot de passe oublié" : "Réinitialiser le mot de passe"}
            </CardTitle>
            <CardDescription className="text-xs">
              {tab === "login" && "Connecte-toi avec ton email et mot de passe."}
              {tab === "register" && "Crée ton espace de travail TAMS."}
              {tab === "forgot" && "Saisis ton email pour recevoir un lien de réinitialisation."}
              {tab === "reset" && "Saisis ton nouveau mot de passe."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-3 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>{success}</p>
                </div>
                {resetToken && tab === "forgot" && (
                  <Button className="w-full" size="sm" onClick={() => { setSuccess(null); setTab("reset"); }}>
                    Réinitialiser maintenant
                  </Button>
                )}
              </div>
            ) : tab === "login" ? (
              <form onSubmit={handleLogin} className="space-y-3">
                <Input
                  type="email" autoComplete="email" placeholder="Email"
                  value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }}
                  disabled={loading} required
                />
                <div className="relative">
                  <Input
                    type={showPwd ? "text" : "password"} autoComplete="current-password" placeholder="Mot de passe"
                    value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    disabled={loading} required
                  />
                  <button type="button" onClick={() => setShowPwd((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {error && <p className="text-xs text-destructive flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>}
                <Button type="submit" className="w-full" disabled={loading || !email.trim() || !password.trim()}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Se connecter
                </Button>
                <button type="button" onClick={() => switchTab("forgot")} className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center pt-1">
                  Mot de passe oublié ?
                </button>
              </form>
            ) : tab === "register" ? (
              <form onSubmit={handleRegister} className="space-y-3">
                <Input
                  type="text" autoComplete="name" placeholder="Ton prénom et nom"
                  value={name} onChange={(e) => { setName(e.target.value); setError(null); }}
                  disabled={loading} required
                />
                <Input
                  type="email" autoComplete="email" placeholder="Email"
                  value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }}
                  disabled={loading} required
                />
                <div className="relative">
                  <Input
                    type={showPwd ? "text" : "password"} autoComplete="new-password" placeholder="Mot de passe (8 caractères min.)"
                    value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    disabled={loading} required minLength={8}
                  />
                  <button type="button" onClick={() => setShowPwd((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {error && <p className="text-xs text-destructive flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>}
                <Button type="submit" className="w-full" disabled={loading || !email.trim() || !password.trim() || !name.trim()}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Créer mon compte
                </Button>
              </form>
            ) : tab === "forgot" ? (
              <form onSubmit={handleForgotPassword} className="space-y-3">
                <Input
                  type="email" autoComplete="email" placeholder="Ton adresse email"
                  value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }}
                  disabled={loading} required
                />
                {error && <p className="text-xs text-destructive flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>}
                <Button type="submit" className="w-full" disabled={loading || !email.trim()}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Envoyer le lien
                </Button>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-3">
                <Input
                  type="text" placeholder="Token de réinitialisation"
                  value={resetToken} onChange={(e) => { setResetToken(e.target.value); setError(null); }}
                  disabled={loading} required
                />
                <div className="relative">
                  <Input
                    type={showPwd ? "text" : "password"} autoComplete="new-password" placeholder="Nouveau mot de passe"
                    value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setError(null); }}
                    disabled={loading} required minLength={8}
                  />
                  <button type="button" onClick={() => setShowPwd((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {error && <p className="text-xs text-destructive flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>}
                <Button type="submit" className="w-full" disabled={loading || !resetToken.trim() || !newPassword.trim()}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Réinitialiser
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground/60">
          Plateforme professionnelle — accès restreint.
        </p>
      </div>
    </div>
  );
}
