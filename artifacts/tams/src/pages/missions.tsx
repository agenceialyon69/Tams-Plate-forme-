import { useCallback, useEffect, useState } from "react";
import { Bot, Loader2, Play, Plus, RefreshCw, ShieldAlert, Square, Target, XCircle } from "lucide-react";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

type Mission = {
  id: string;
  objective?: string;
  status?: string;
  priority?: string;
  createdAt?: string;
  updatedAt?: string;
  events?: Array<{ at?: string; type?: string; message?: string }>;
  [key: string]: unknown;
};

type RuntimeStatus = {
  running?: boolean;
  status?: string;
  [key: string]: unknown;
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  const raw = await response.text();
  let payload: unknown = null;
  try { payload = raw ? JSON.parse(raw) : null; }
  catch { throw new Error(`Réponse JSON invalide (${response.status}).`); }
  if (!response.ok) {
    const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    throw new Error(typeof record.error === "string" ? record.error : `HTTP ${response.status}`);
  }
  return payload as T;
}

function statusClass(status?: string) {
  if (status === "completed" || status === "success") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "running" || status === "in_progress") return "border-blue-500/30 bg-blue-500/10 text-blue-300";
  if (status === "failed" || status === "cancelled") return "border-rose-500/30 bg-rose-500/10 text-rose-200";
  return "border-border bg-secondary text-muted-foreground";
}

export default function MissionsPage() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [selected, setSelected] = useState<Mission | null>(null);
  const [objective, setObjective] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [missionPayload, runtimePayload] = await Promise.allSettled([
        requestJson<{ data?: Mission[] }>("/api/missions"),
        requestJson<RuntimeStatus>("/api/missions/runtime"),
      ]);
      if (missionPayload.status === "fulfilled") setMissions(missionPayload.value.data ?? []);
      else setError(missionPayload.reason instanceof Error ? missionPayload.reason.message : "Missions indisponibles.");
      if (runtimePayload.status === "fulfilled") setRuntime(runtimePayload.value);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createMission() {
    const clean = objective.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestJson("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objective: clean, priority: "medium" }),
      });
      setObjective("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Création mission impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelMission(id: string) {
    setBusy(true);
    setError(null);
    try {
      await requestJson(`/api/missions/${id}/cancel`, { method: "POST" });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Annulation mission impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleRuntime(path: "/api/missions/runtime/start" | "/api/missions/runtime/stop") {
    setBusy(true);
    setError(null);
    try {
      const payload = await requestJson<RuntimeStatus>(path, { method: "POST" });
      setRuntime(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Runtime indisponible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:pb-10 space-y-5">
        <header className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Missions</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Autonomous Engineer contrôlé</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Liste, création, détail et annulation des missions via le runtime existant. Aucune mission fictive n'est affichée.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs ${statusClass(runtime?.running ? "running" : runtime?.status)}`}>
                Runtime: {runtime?.running ? "running" : runtime?.status ?? "unknown"}
              </span>
              <button onClick={() => void toggleRuntime("/api/missions/runtime/start")} disabled={busy} className="min-h-[40px] rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground"><Play className="mr-1 inline h-3.5 w-3.5" />Start</button>
              <button onClick={() => void toggleRuntime("/api/missions/runtime/stop")} disabled={busy} className="min-h-[40px] rounded-xl bg-secondary px-3 text-xs font-semibold text-foreground"><Square className="mr-1 inline h-3.5 w-3.5" />Stop</button>
              <button onClick={() => void load()} disabled={loading} className="min-h-[40px] rounded-xl border border-border px-3 text-xs"><RefreshCw className={`mr-1 inline h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Actualiser</button>
            </div>
          </div>
        </header>

        {error ? <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100"><ShieldAlert className="mr-2 inline h-4 w-4" />{error}</div> : null}

        <section className="rounded-3xl border border-border bg-card p-5 space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Plus className="h-5 w-5 text-primary" />Nouvelle mission</h2>
          <textarea value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Décris une mission contrôlée..." className="min-h-[100px] w-full rounded-2xl border border-border bg-background p-3 text-sm outline-none focus:border-primary" />
          <button onClick={() => void createMission()} disabled={!objective.trim() || busy} className="min-h-[44px] rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <Bot className="mr-2 inline h-4 w-4" />}Créer la mission
          </button>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
          <section className="rounded-3xl border border-border bg-card p-5 space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Target className="h-5 w-5 text-primary" />Missions existantes</h2>
            {loading && missions.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Chargement des missions...</div> : null}
            {!loading && missions.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Aucune mission retournée par l'API.</div> : null}
            {missions.map((mission) => (
              <article key={mission.id} className="rounded-2xl border border-border bg-background/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <button onClick={() => setSelected(mission)} className="min-w-0 text-left">
                    <h3 className="font-medium text-foreground">{mission.objective ?? mission.id}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{mission.id}</p>
                  </button>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] ${statusClass(mission.status)}`}>{mission.status ?? "unknown"}</span>
                    <button onClick={() => setSelected(mission)} className="rounded-xl bg-secondary px-3 py-1.5 text-xs">Détail</button>
                    <button onClick={() => void cancelMission(mission.id)} disabled={busy} className="rounded-xl bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200"><XCircle className="mr-1 inline h-3.5 w-3.5" />Annuler</button>
                  </div>
                </div>
              </article>
            ))}
          </section>

          <section className="rounded-3xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-lg font-semibold">Détail & événements</h2>
            {selected ? (
              <pre className="max-h-[520px] overflow-auto rounded-2xl bg-secondary/50 p-4 text-xs whitespace-pre-wrap">{JSON.stringify(selected, null, 2)}</pre>
            ) : (
              <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Sélectionne une mission pour voir son détail brut et ses événements.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
