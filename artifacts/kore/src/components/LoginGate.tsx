import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import { getToken, setToken, clearToken, onAuthChange } from "@/lib/auth";

/**
 * Single-user access gate.
 *
 * Security:
 * - Token stored only in localStorage under `tams_api_token`
 * - Auto-setup: ?token=xxx saves the token and removes it from URL history
 * - 401 responses auto-clear the token
 * - Token never hardcoded — reads only from storage or URL param
 */
export function LoginGate({ children }: { children: ReactNode }): ReactNode {
  const [authed, setAuthed] = useState<boolean>(() => Boolean(getToken()));
  const [value, setValue] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState(false);

  // Auto-login from URL: ?token=xxx
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken && urlToken.trim().length >= 16) {
      setToken(urlToken.trim());
      params.delete("token");
      const newUrl =
        window.location.pathname + (params.toString() ? "?" + params.toString() : "");
      window.history.replaceState({}, "", newUrl);
    }
  }, []);

  useEffect(() => onAuthChange(() => setAuthed(Boolean(getToken()))), []);

  // Auto-logout on 401
  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      const res = await original(...args);
      if (res.status === 401) clearToken();
      return res;
    };
    return () => {
      window.fetch = original;
    };
  }, []);

  if (authed) return <>{children}</>;

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!value.trim()) return;
    setToken(value.trim());
    setValue("");
    setError(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-xl bg-foreground flex items-center justify-center">
            <span className="font-serif text-2xl font-semibold text-background">T</span>
          </div>
          <h1 className="font-serif text-2xl font-semibold text-foreground">TAMS</h1>
          <p className="text-sm text-muted-foreground">Ton copilote de vie personnel</p>
        </div>

        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="w-4 h-4 text-muted-foreground" />
              Accès sécurisé
            </CardTitle>
            <CardDescription className="text-xs">
              Entre ton jeton d'accès pour déverrouiller l'application.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <Input
                  type={showToken ? "text" : "password"}
                  autoFocus
                  autoComplete="current-password"
                  placeholder="Jeton d'accès"
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setError(false);
                  }}
                  className={error ? "border-destructive" : ""}
                />
                <button
                  type="button"
                  onClick={() => setShowToken((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {error && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Jeton invalide — vérifie et réessaie.
                </p>
              )}

              <Button type="submit" className="w-full" disabled={!value.trim()}>
                Déverrouiller
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground/60">
          Application personnelle — accès restreint.
        </p>
      </div>
    </div>
  );
}
