import { useCallback, useEffect, useState } from "react";
import { LogOut, RefreshCw, Settings, ShieldCheck, WifiOff } from "lucide-react";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

type ProviderStatus = {
  configured?: boolean;
  providers?: string[];
  primary?: string | null;
  hint?: string | null;
};

type VersionStatus = {
  version?: string;
  commit?: string;
  branch?: string;
  [key: string]: unknown;
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  const raw = await response.text();
  let payload: unknown = null;
  try { payload = raw ? JSON.parse(raw) : null; }
  catch { throw new Error(`Réponse JSON invalide (${response.status}).`); }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return payload as T;
}

export default function SettingsPage() {
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [version, setVersion] = useState<VersionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [providerResult, versionResult] = await Promise.allSettled([
        getJson<ProviderStatus>("/api/system/ai"),
        getJson<VersionStatus>("/api/version"),
      ]);
      if (providerResult.status === "fulfilled") setProvider(providerResult.value);
      if (versionResult.status === "fulfilled") setVersion(versionResult.value);
      if (providerResult.status === "rejected" && versionResult.status === "rejected") setError("Paramètres système indisponibles.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function logout() {
    try {
      await fetch(`${API_BASE}/personal-access/logout`, { method: "POST" });
    } finally {
      window.location.assign("/personal-access");
    }
  }

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto max-w-4xl px-4 pb-28 pt-6 md:pb-10 space-y-5">
        <header className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Paramètres</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight"><Settings className="h-6 w-6" />Configuration TAMS</h1>
          <p className="mt-2 text-sm text-muted-foreground">Statut honnête des providers et informations runtime sans exposer de secret.</p>
        </header>

        {error ? <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div> : null}

        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-3xl border border-border bg-card p-5 space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="h-5 w-5 text-primary" />Provider IA</h2>
            {provider?.configured ? (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                Configuré : {provider.primary ?? provider.providers?.[0] ?? "provider disponible"}
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                <WifiOff className="mr-2 inline h-4 w-4" />missing_config{provider?.hint ? ` · ${provider.hint}` : ""}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Providers détectés : {(provider?.providers ?? []).join(", ") || "aucun"}</p>
          </section>

          <section className="rounded-3xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-lg font-semibold">Version</h2>
            <pre className="max-h-64 overflow-auto rounded-2xl bg-secondary/50 p-4 text-xs whitespace-pre-wrap">{JSON.stringify(version ?? { status: loading ? "loading" : "unknown" }, null, 2)}</pre>
          </section>
        </div>

        <section className="rounded-3xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-lg font-semibold">Session</h2>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void load()} disabled={loading} className="min-h-[44px] rounded-2xl border border-border px-4 text-sm"><RefreshCw className={`mr-2 inline h-4 w-4 ${loading ? "animate-spin" : ""}`} />Actualiser</button>
            <button onClick={() => void logout()} className="min-h-[44px] rounded-2xl bg-secondary px-4 text-sm"><LogOut className="mr-2 inline h-4 w-4" />Logout</button>
          </div>
        </section>
      </div>
    </div>
  );
}
