import { useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, CheckCircle2, Layers, Loader2, Server, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

type RegistryStatus = {
  status?: string;
  providers?: { total?: number; available?: number; planned?: number };
  capabilities?: { total?: number; available?: number; planned?: number };
  runtime?: { enabled?: boolean; unsafeActionsEnabled?: boolean };
};

type Capability = {
  id: string;
  label: string;
  description: string;
  category: string;
  status: string;
  riskLevel?: string;
  validationNotes?: string;
  executableNow?: boolean;
  plannedOnly?: boolean;
  requiresLocal?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  mode?: string;
  actionAvailable?: boolean;
};

type Provider = {
  id: string;
  name: string;
  type: string;
  status: string;
  requiresAuth?: boolean;
  notes?: string;
};

type CapabilityActionResponse = {
  capabilityId: string;
  status: string;
  mode: string;
  title: string;
  result: string;
  artifact: { type: "text" | "image" | "json" | "file" | "none"; url?: string; content?: string };
  limitations: string[];
  nextActions: string[];
  providerUsed?: string;
};

function statusClass(status?: string) {
  if (status === "available" || status === "configured" || status === "online" || status === "ready" || status === "ok" || status === "real") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "planned" || status === "plan_only" || status === "missing_config" || status === "disabled") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (status === "requires_local_gpu" || status === "requires_local" || status === "read_only") return "border-orange-500/30 bg-orange-500/10 text-orange-300";
  if (status === "experimental") return "border-blue-500/30 bg-blue-500/10 text-blue-300";
  return "border-muted bg-muted/40 text-muted-foreground";
}

function capabilityMode(capability: Capability): string {
  if (capability.mode) return capability.mode;
  if (capability.disabled) return "disabled";
  if (capability.requiresLocal) return "requires_local";
  if (capability.plannedOnly || capability.status === "planned") return "planned";
  if (capability.readOnly) return "read_only";
  if (capability.executableNow) return "real";
  return "plan_only";
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export default function CapabilitiesPage() {
  const [status, setStatus] = useState<RegistryStatus | null>(null);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCapability, setSelectedCapability] = useState<Capability | null>(null);
  const [actionInput, setActionInput] = useState("");
  const [actionResult, setActionResult] = useState<CapabilityActionResponse | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  async function executeCapability() {
    if (!selectedCapability || actionLoading) return;
    setActionLoading(true);
    setActionError(null);
    setActionResult(null);
    try {
      const response = await fetch(`${API_BASE}/api/capabilities/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capabilityId: selectedCapability.id,
          input: actionInput,
          options: {
            platform: /tiktok/i.test(actionInput) ? "tiktok" : "generic",
            targetLanguage: selectedCapability.id === "text.translate" ? "anglais" : undefined,
          },
        }),
      });
      const data = await response.json() as CapabilityActionResponse | { error?: string };
      if (!response.ok || !("capabilityId" in data)) throw new Error("error" in data ? data.error : `HTTP ${response.status}`);
      setActionResult(data);
    } catch (actionFailure) {
      setActionError(actionFailure instanceof Error ? actionFailure.message : "Action indisponible");
    } finally {
      setActionLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([
      getJson<RegistryStatus>("/api/registry/status"),
      getJson<{ data?: Capability[]; capabilities?: Capability[] }>("/api/registry/capabilities"),
      getJson<{ data?: Provider[]; providers?: Provider[] }>("/api/registry/providers"),
    ])
      .then(([statusData, capsData, providersData]) => {
        if (!mounted) return;
        setStatus(statusData);
        setCapabilities(capsData.data ?? capsData.capabilities ?? []);
        setProviders(providersData.data ?? providersData.providers ?? []);
        setError(null);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const groupedCapabilities = useMemo(() => {
    return capabilities.reduce<Record<string, Capability[]>>((groups, capability) => {
      const key = capability.category || "autre";
      groups[key] = groups[key] ?? [];
      groups[key].push(capability);
      return groups;
    }, {});
  }, [capabilities]);

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-8 space-y-6">
      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          Capability Registry
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Capacités TAMS</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Vue simple des capacités, providers et limites connues. Les fonctions non prêtes restent marquées planned au lieu de casser l’interface.
        </p>
      </header>

      {loading && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement du registry…
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Registry indisponible</div>
            <div className="text-red-200/80">{error}</div>
          </div>
        </div>
      )}

      {!loading && !error && (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            <StatCard icon={Activity} label="Statut" value={status?.status ?? (capabilities.length > 0 ? "partial" : "offline")} />
            <StatCard icon={Layers} label="Capacités" value={String(status?.capabilities?.total ?? capabilities.length)} />
            <StatCard icon={CheckCircle2} label="Disponibles" value={String(status?.capabilities?.available ?? capabilities.filter(c => c.status === "available").length)} />
            <StatCard icon={Server} label="Providers" value={String(status?.providers?.total ?? providers.length)} />
          </section>

          <section className="rounded-2xl border border-border bg-card/70 p-4 md:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Runtime</h2>
                <p className="text-sm text-muted-foreground">Le Runtime dangereux doit rester désactivé ou read_only en production.</p>
              </div>
              <span className={cn("rounded-full border px-3 py-1 text-xs", status?.runtime?.enabled ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300")}>
                {status?.runtime?.enabled ? "runtime actif" : "runtime désactivé / sûr"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Actions dangereuses : {status?.runtime?.unsafeActionsEnabled ? "actives — à corriger" : "désactivées"}.
            </p>
          </section>

          {selectedCapability && (
            <section className="rounded-2xl border border-primary/30 bg-card p-4 md:p-5 space-y-4" data-testid="capability-action-panel">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Tester — {selectedCapability.label}</h2>
                  <p className="text-sm text-muted-foreground">{selectedCapability.id} · mode {capabilityMode(selectedCapability)}</p>
                </div>
                <button onClick={() => { setSelectedCapability(null); setActionResult(null); setActionError(null); }} className="text-xs text-muted-foreground hover:text-foreground">Fermer</button>
              </div>
              <textarea
                value={actionInput}
                onChange={event => setActionInput(event.target.value)}
                rows={4}
                placeholder="Décrivez ce que TAMS doit faire…"
                className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary"
                data-testid="capability-action-input"
              />
              <button
                onClick={executeCapability}
                disabled={actionLoading}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                data-testid="capability-action-submit"
              >
                {actionLoading ? "Exécution…" : "Exécuter"}
              </button>
              {actionError && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{actionError}</div>}
              {actionResult && (
                <div className="space-y-3 rounded-xl border border-border bg-background/70 p-4" data-testid="capability-action-result">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{actionResult.title}</strong>
                    <span className={cn("rounded-full border px-2 py-0.5 text-xs", statusClass(actionResult.mode))}>{actionResult.status} · {actionResult.mode}</span>
                    {actionResult.providerUsed && <span className="text-xs text-muted-foreground">provider : {actionResult.providerUsed}</span>}
                  </div>
                  {actionResult.artifact.type === "image" && actionResult.artifact.url && (
                    <img src={actionResult.artifact.url} alt={actionResult.title} className="max-h-96 w-full rounded-xl border border-border object-contain" />
                  )}
                  <pre className="whitespace-pre-wrap break-words text-sm font-sans">{actionResult.result}</pre>
                  {actionResult.limitations.length > 0 && <div className="text-sm text-amber-300">Limitations : {actionResult.limitations.join(" · ")}</div>}
                  {actionResult.nextActions.length > 0 && <div className="text-sm text-muted-foreground">Prochaines actions : {actionResult.nextActions.join(" · ")}</div>}
                </div>
              )}
            </section>
          )}

          <section className="rounded-2xl border border-border bg-card/70 p-4 text-sm text-muted-foreground">
            <p><span className="font-medium text-emerald-300">Available</span> = utilisable maintenant.</p>
            <p><span className="font-medium text-amber-300">Planned</span> = visible mais pas encore exécutable.</p>
            <p><span className="font-medium text-orange-300">Requires local GPU</span> = nécessite un worker GPU local.</p>
            <p><span className="font-medium text-blue-300">Experimental</span> = disponible avec limites.</p>
            <p><span className="font-medium">Disabled</span> = volontairement désactivé.</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Capacités</h2>
            {Object.entries(groupedCapabilities).map(([category, items]) => (
              <div key={category} className="rounded-2xl border border-border bg-card/70 p-4 md:p-5">
                <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">{category}</h3>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((capability) => (
                    <article key={capability.id} className="rounded-xl border border-border bg-background/60 p-4">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div>
                          <h4 className="font-medium">{capability.label}</h4>
                          <p className="text-xs text-muted-foreground">{capability.id}</p>
                        </div>
                        <span className={cn("rounded-full border px-2 py-0.5 text-[11px]", statusClass(capabilityMode(capability)))}>{capabilityMode(capability)}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{capability.description}</p>
                      <p className="mt-2 text-xs text-muted-foreground">Déclarée : {capability.status} · Exécutable maintenant : {capability.executableNow ? "oui" : "non"}</p>
                      {capability.validationNotes && <p className="mt-3 text-xs text-muted-foreground">{capability.validationNotes}</p>}
                      {capability.actionAvailable ? (
                        <button
                          onClick={() => { setSelectedCapability(capability); setActionInput(""); setActionResult(null); setActionError(null); }}
                          className="mt-4 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                          data-testid={`test-capability-${capability.id}`}
                        >
                          Tester
                        </button>
                      ) : (
                        <p className="mt-4 text-xs text-muted-foreground">
                          {capabilityMode(capability) === "plan_only" ? "Mode plan uniquement" : "Non disponible pour l’instant"}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Providers</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {providers.map((provider) => (
                <article key={provider.id} className="rounded-xl border border-border bg-card/70 p-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium">{provider.name}</h3>
                      <p className="text-xs text-muted-foreground">{provider.id} · {provider.type}</p>
                    </div>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[11px]", statusClass(provider.status))}>{provider.status}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{provider.notes ?? "Disponible bientôt / planned"}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4">
      <Icon className="mb-3 h-5 w-5 text-primary" />
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
