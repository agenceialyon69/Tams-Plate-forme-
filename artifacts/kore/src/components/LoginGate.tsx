import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock } from "lucide-react";
import {
  getToken,
  setToken,
  clearToken,
  onAuthChange,
} from "@/lib/auth";

/**
 * Single-user access gate. The API requires a bearer token; until one is
 * stored locally the app shows a token entry screen. The token never leaves
 * the browser except as an Authorization header to our own API.
 */
export function LoginGate({ children }: { children: ReactNode }): ReactNode {
  const [authed, setAuthed] = useState<boolean>(() => Boolean(getToken()));
  const [value, setValue] = useState("");

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

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (value.trim().length === 0) return;
    setToken(value.trim());
    setValue("");
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
            Entre ton jeton d'accès pour ouvrir ton copilote.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
