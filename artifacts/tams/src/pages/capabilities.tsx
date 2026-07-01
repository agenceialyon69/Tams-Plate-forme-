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
};

type Provider = {
  id: string;
  name: string;
  type: string;
  status: string;
  requiresAuth?: boolean;
  notes?: string;
};

type CapabilityRun = {
  capabilityId: string;
  status: string;
  mode: string;
  title: string;
  result: string;
  artifact?: {
    type: "text" | "image" | "json" | "file" | "none";
    url?: string;
    content?: string;
    data?: unknown;
  };
  limitations?: string[];
  nextActions?: string[];
  providerUsed?: string;
  debug?: { safe?: boolean; noSecrets?: boolean };
};

function statusClass(status?: string) {
  if (status === "available" || status === "configured" || status === "online" || status === "ready" || status === "ok" || status === "real" || status === "success") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "planned" || status === "plan_only" || status === "missing_config" || status === "disabled") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (status === "requires_local_gpu" || status === "requires_local" || status === "read_only") return "border-orange-500/30 bg-orange-500/10 text-orange-300";
  if (status === "experimental") return "border-blue-500/30 bg-blue-500/10 text-blue-300";
  if (status === "error") return "border-red-500/30 bg-red-500/10 text-red-300";
  return "border-muted bg-muted/40 text-muted-foreground";
}

const plannedIds = new Set([
  "search.web",
  "image.analyze",
  "video.generate",
  "voice.transcribe",
  "audio.synthesize",
  "audio.music.generate",
  "automation.workflow",
]);

const planOnlyIds = new Set([
  "studio.video.edit.plan",
  "video.edit",
  "studio.music.plan",
  "memory.query",
]);

const readOnlyIds = new Set([
  "repo.audit",
  "repo.validate",
  "deploy.check",
]);

const disabledIds = new Set(["repo.patch"]);

function capabilityMode(capability: Capability): string {
  if (disabledIds.has(capability.id) || capability.disabled) return "disabled";
  if (plannedIds.has(capability.id) || capability.plannedOnly || capability.status === "planned") return "planned";
  if (readOnlyIds.has(capability.id) || capability.readOnly) return "read_only";
  if (planOnlyIds.has(capability.id)) return "plan_only";
  if (capability.requiresLocal) return "requires_local";
  if (capability.executableNow || capability.status === "available") return "real";
  return "plan_only";
}

function canExecute(capability: Capability): boolean {
  const mode = capabilityMode(capability);
  return mode === "real" || mode === "plan_only" || mode === "read_only";
}

function defaultInput(capability: Capability): string {
  if (capability.id.startsWith("text.")) return "Écris une description produit activewear féminine premium, naturelle et crédible pour TikTok.";
  if (capability.id.startsWith("studio.") || capability.id === "video.edit" || capability.id === "image.generate") return "Vidéo TikTok activewear naturel, format 9:16, style UGC crédible, sans fausse promesse.";
  if (capability.id.startsWith("repo.")) return "Analyse mon repo TAMS et propose les corrections à faire sans modifier main.";
  if (capability.id === "deploy.check" || capability.id === "observe.health") return "Vérifie la santé système, version, readiness et limites de production.";
  if (capability.id === "memory.query") return "Que sais-tu du projet TAMS et de son objectif Dev Agent proche de Claude Code ?";
  return "Prépare un plan utile et honnête pour cette capacité.";
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [runningId, setRunningId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, CapabilityRun>>({});
  const [runErrors, setRunErrors] = useState<Record<string, string>>({});

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

  async function executeCapability(capability: Capability) {
    const input = inputs[capability.id] ?? defaultInput(capability);
    setRunningId(capability.id);
    setRunErrors(prev => ({ ...prev, [capability.id]: "" }));
    try {
      const response = await fetch(`${API_BASE}/api/capabilities/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capabilityId: capability.id, input, options: { targetLanguage: "français" } }),
      });
      const data = await response.json() as CapabilityRun;
      if (!response.ok) throw new Error(data.result || data.title || `HTTP ${response.status}`);
      setResults(prev => ({ ...prev, [capability.id]: data }));
    } catch (err) {
      setRunErrors(prev => ({ ...prev, [capability.id]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setRunningId(null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-8 space-y-6">
      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          Capability Registry + Action Bus
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Capacités TAMS</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Centre d’action : une capacité marquée real/read_only/plan_only doit avoir un test visible. Les fonctions non prêtes restent planned/disabled au lieu de faire semblant.
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
            <StatCard icon={CheckCircle2} label="Actionnables" value={String(capabilities.filter(canExecute).length)} />
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

          <section className="rounded-2xl border border-border bg-card/70 p-4 text-sm text-muted-foreground">
            <p><span className="font-medium text-emerald-300">real</span> = test actionnable maintenant avec résultat affiché.</p>
            <p><span className="font-medium text-orange-300">read_only</span> = action sûre, diagnostic ou plan sans écriture.</p>
            <p><span className="font-medium text-amber-300">plan_only</span> = produit un plan utile, pas un fichier final.</p>
            <p><span className="font-medium text-amber-300">planned/disabled</span> = pas de bouton trompeur.</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Capacités</h2>
            {Object.entries(groupedCapabilities).map(([category, items]) => (
              <div key={category} className="rounded-2xl border border-border bg-card/70 p-4 md:p-5">
                <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">{category}</h3>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((capability) => {
                    const mode = capabilityMode(capability);
                    const executable = canExecute(capability);
                    const isActive = activeId === capability.id;
                    const result = results[capability.id];
                    const runError = runErrors[capability.id];
                    return (
                      <article key={capability.id} className="rounded-xl border border-border bg-background/60 p-4">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div>
                            <h4 className="font-medium">{capability.label}</h4>
                            <p className="text-xs text-muted-foreground">{capability.id}</p>
                          </div>
                          <span className={cn("rounded-full border px-2 py-0.5 text-[11px]", statusClass(mode))}>{mode}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{capability.description}</p>
                        <p className="mt-2 text-xs text-muted-foreground">Déclarée : {capability.status} · Action UI : {executable ? "oui" : "non"}</p>
                        {capability.validationNotes && <p className="mt-3 text-xs text-muted-foreground">{capability.validationNotes}</p>}

                        {executable ? (
                          <div className="mt-4 space-y-3">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveId(isActive ? null : capability.id);
                                setInputs(prev => ({ ...prev, [capability.id]: prev[capability.id] ?? defaultInput(capability) }));
                              }}
                              className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                            >
                              {isActive ? "Fermer le test" : mode === "real" ? "Tester" : "Tester en mode " + mode}
                            </button>

                            {isActive && (
                              <div className="space-y-3 rounded-lg border border-border bg-card/70 p-3">
                                <textarea
                                  value={inputs[capability.id] ?? defaultInput(capability)}
                                  onChange={(event) => setInputs(prev => ({ ...prev, [capability.id]: event.target.value }))}
                                  rows={4}
                                  className="w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary"
                                />
                                <button
                                  type="button"
                                  disabled={runningId === capability.id}
                                  onClick={() => executeCapability(capability)}
                                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
                                >
                                  {runningId === capability.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                  Exécuter
                                </button>
                                {runError && (
                                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">{runError}</div>
                                )}
                                {result && (
                                  <CapabilityResult result={result} />
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                            Non disponible pour l’instant : aucun bouton n’est affiché tant qu’un handler réel n’est pas branché.
                          </div>
                        )}
                      </article>
                    );
                  })}
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

function CapabilityResult({ result }: { result: CapabilityRun }) {
  return (
    <div className="space-y-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full border px-2 py-0.5 text-[11px]", statusClass(result.status))}>{result.status}</span>
        <span className={cn("rounded-full border px-2 py-0.5 text-[11px]", statusClass(result.mode))}>{result.mode}</span>
        {result.providerUsed && <span className="text-xs text-muted-foreground">Provider : {result.providerUsed}</span>}
      </div>
      <div className="font-medium">{result.title}</div>
      {result.artifact?.type === "image" && result.artifact.url && (
        <div className="space-y-2">
          <img src={result.artifact.url} alt={result.title} className="max-h-72 w-full rounded-lg border border-border object-cover" />
          <a className="text-xs text-primary underline" href={result.artifact.url} target="_blank" rel="noreferrer">Ouvrir l’image</a>
        </div>
      )}
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background/80 p-3 text-xs text-foreground">{result.result}</pre>
      {result.limitations && result.limitations.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium text-amber-300">Limitations</div>
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            {result.limitations.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}
      {result.nextActions && result.nextActions.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium text-primary">Prochaines actions</div>
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            {result.nextActions.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
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
