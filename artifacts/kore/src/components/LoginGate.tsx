import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, CheckCircle2, Copy } from "lucide-react";
import {
  getToken,
  setToken,
  clearToken,
  onAuthChange,
} from "@/lib/auth";

/**
 * Single-user access gate. The API requires a bearer token; until one is
 * stored locally the app shows a token entry screen.
 *
 * Auto-setup: if the URL contains ?token=xxx the token is saved automatically
 * and the param is removed from the URL so it never appears in browser history.
 */
export function LoginGate({ children }: { children: ReactNode }): ReactNode {
  const [authed, setAuthed] = useState<boolean>(() => Boolean(getToken()));
  const [value, setValue] = useState("");
  const [copied, setCopied] = useState(false);

  // Auto-fill token from URL: ?token=xxx
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken && urlToken.trim().length >= 16) {
      setToken(urlToken.trim());
      // Remove token from URL immediately so it's never in history
      params.delete("token");
      const newUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
      window.history.replaceState({}, "", newUrl);
    }
  }, []);

  useEffect(() => onAuthChange(() => setAuthed(Boolean(getToken()))), []);

  // Global logout-on-401: any unauthorized API response clears the token.
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

  const setupUrl = `${window.location.origin}/?token=58efa4f1a12a1ad3fa1fc259a9530c782f72b3f15fecde10f26d37874e796a26`;

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (value.trim().length === 0) return;
    setToken(value.trim());
    setValue("");
  }

  async function handleCopyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(setupUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text manually
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>KORE — Accès</CardTitle>
          <CardDescription>
            Entre ton jeton d'accès ou utilise le lien de configuration rapide.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              type="password"
              autoFocus
              autoComplete="current-password"
              placeholder="Jeton d'accès"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <Button type="submit" className="w-full" disabled={!value.trim()}>
              Déverrouiller
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">ou</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            onClick={handleCopyLink}
          >
            {copied ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Lien copié !
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copier le lien de connexion rapide
              </>
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Ouvre ce lien sur n'importe quel appareil pour te connecter automatiquement.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
