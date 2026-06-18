import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Eye, EyeOff, AlertCircle, Loader2 } from "lucide-react";
import { getToken, setToken, clearToken, setStoredUser, onAuthChange, type AuthUser } from "@/lib/auth";
import { getApiBase } from "@/lib/api";

function GandalMark() {
  return (
    <div className="mx-auto w-14 h-14 rounded-2xl bg-foreground flex items-center justify-center shadow-lg">
      <span className="font-serif text-3xl font-semibold text-background">G</span>
    </div>
  );
}

export function LoginGate({ children }: { children: ReactNode }): ReactNode {
  const [authed, setAuthed] = useState<boolean>(() => Boolean(getToken()));
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => onAuthChange(() => setAuthed(Boolean(getToken()))), []);

  // Auto-login from URL ?token=xxx (legacy support)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken && urlToken.trim().length >= 16) {
      setToken(urlToken.trim());
      params.delete("token");
      const newUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
      window.history.replaceState({}, "", newUrl);
    }
  }, []);

  // Auto-logout on 401
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
      if (!res.ok) {
        setError(data.error ?? "Erreur de connexion.");
        return;
      }
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
      if (!res.ok) {
        setError(data.error ?? "Erreur d'inscription.");
        return;
      }
      setStoredUser(data.user as AuthUser);
      setToken(data.token);
    } catch {
      setError("Impossible de joindre le serveur.");
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
            <h1 className="font-serif text-2xl font-semibold text-foreground tracking-tight">GANDAL</h1>
            <p className="text-sm text-muted-foreground mt-1">Plateforme d'intelligence commerciale</p>
          </div>
        </div>

        <div className="flex rounded-lg border border-border/50 p-1 bg-muted/30">
          <button
            onClick={() => { setTab("login"); setError(null); }}
            className={`flex-1 text-sm py-1.5 rounded-md transition-colors font-medium ${tab === "login" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Connexion
          </button>
          <button
            onClick={() => { setTab("register"); setError(null); }}
            className={`flex-1 text-sm py-1.5 rounded-md transition-colors font-medium ${tab === "register" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Créer un compte
          </button>
        </div>

        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="w-4 h-4 text-muted-foreground" />
              {tab === "login" ? "Accès sécurisé" : "Nouveau compte"}
            </CardTitle>
            <CardDescription className="text-xs">
              {tab === "login"
                ? "Connecte-toi avec ton email et mot de passe."
                : "Crée ton espace de travail GANDAL."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={tab === "login" ? handleLogin : handleRegister} className="space-y-3">
              {tab === "register" && (
                <Input
                  type="text"
                  autoComplete="name"
                  placeholder="Ton prénom et nom"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError(null); }}
                  disabled={loading}
                  required
                />
              )}

              <Input
                type="email"
                autoComplete="email"
                placeholder="Email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                disabled={loading}
                required
              />

              <div className="relative">
                <Input
                  type={showPwd ? "text" : "password"}
                  autoComplete={tab === "login" ? "current-password" : "new-password"}
                  placeholder="Mot de passe"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  disabled={loading}
                  required
                  minLength={tab === "register" ? 8 : 1}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {error && (
                <p className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {error}
                </p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={loading || !email.trim() || !password.trim() || (tab === "register" && !name.trim())}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                {tab === "login" ? "Se connecter" : "Créer mon compte"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground/60">
          Plateforme professionnelle — accès restreint.
        </p>
      </div>
    </div>
  );
}
