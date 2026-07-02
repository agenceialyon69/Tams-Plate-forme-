import { useEffect, useMemo, useState } from "react";
import { Image, Film, Music, Loader2, AlertTriangle, CheckCircle2, ExternalLink, Trash2, Activity, Cpu, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

type Mode = "image" | "video" | "audio";
type Status = "success" | "error" | "running";

type StudioResult = {
  id: string;
  type: Mode;
  title: string;
  prompt: string;
  status: Status;
  url?: string;
  content?: string;
  engine?: string;
  degraded?: boolean;
  error?: string;
  createdAt: string;
};

type SelfTestState = {
  status: "idle" | "running" | "success" | "error";
  message?: string;
  videoUrl?: string;
  audioUrl?: string;
  imageUrl?: string;
  raw?: unknown;
};

type WorkerStatus = {
  id: string;
  kind: string;
  status: "connected" | "missing_config";
  env: string | null;
  endpointConfigured: boolean;
  note: string;
};

type WorkersState = {
  status: "idle" | "loading" | "loaded" | "error";
  workers: WorkerStatus[];
  n8n: { configured: boolean; status: string } | null;
};

const STORAGE_KEY = "tams-studio-real-results-v2";

function loadResults(): StudioResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveResults(results: StudioResult[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(results.slice(0, 80)));
}

function absoluteUrl(url?: string) {
  if (!url) return undefined;
  if (/^https?:\/\//.test(url) || url.startsWith("data:")) return url;
  return `${API_BASE}${url}`;
}

async function postJson(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.detail || data?.hint || data?.error || `HTTP ${response.status}`;
    throw new Error(String(detail));
  }
  return data as Record<string, unknown>;
}

async function getJson(path: string) {
  const response = await fetch(`${API_BASE}${path}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.detail || data?.error || `HTTP ${response.status}`;
    throw new Error(String(detail));
  }
  return data as Record<string, unknown>;
}

function renderMedia(result: StudioResult) {
  const url = absoluteUrl(result.url);
  if (!url) return null;
  if (result.type === "image") {
    return <img src={url} alt={result.title} className="w-full rounded-2xl border border-white/10 bg-black/20 object-contain max-h-[420px]" />;
  }
  if (result.type === "video") {
    return <video controls src={url} className="w-full rounded-2xl border border-white/10 bg-black max-h-[520px]" />;
  }
  return <audio controls src={url} className="w-full" />;
}

export default function Studio() {
  const [mode, setMode] = useState<Mode>("video");
  const [prompt, setPrompt] = useState("génère une vidéo TikTok naturelle pour ma boutique activewear femme");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<StudioResult[]>(loadResults);
  const [activeError, setActiveError] = useState<string | null>(null);
  const [selfTest, setSelfTest] = useState<SelfTestState>({ status: "idle" });
  const [workers, setWorkers] = useState<WorkersState>({ status: "idle", workers: [], n8n: null });

  useEffect(() => saveResults(results), [results]);

  useEffect(() => {
    async function loadWorkers() {
      setWorkers(w => ({ ...w, status: "loading" }));
      try {
        const [gpuStatus, n8nStatus] = await Promise.all([
          getJson("/api/gpu/status").catch(() => null),
          getJson("/api/n8n/status").catch(() => null),
        ]);
        setWorkers({
          status: "loaded",
          workers: (gpuStatus?.workers as WorkerStatus[]) || [],
          n8n: n8nStatus ? { configured: n8nStatus.configured as boolean, status: n8nStatus.status as string } : null,
        });
      } catch {
        setWorkers(w => ({ ...w, status: "error" }));
      }
    }
    loadWorkers();
  }, []);

  const currentResults = useMemo(() => results.filter(r => r.type === mode), [results, mode]);

  async function runSelfTest() {
    setSelfTest({ status: "running", message: "Self-test réel en cours..." });
    try {
      const data = await getJson("/api/_diagnostics/studio-selftest");
      const playable = data.playable as Record<string, unknown> | undefined;
      setSelfTest({
        status: "success",
        message: data.verdict === "pass" ? "Studio backend PASS : médias réels générés." : `Studio backend ${String(data.verdict)}`,
        videoUrl: typeof playable?.videoUrl === "string" ? playable.videoUrl : undefined,
        audioUrl: typeof playable?.audioUrl === "string" ? playable.audioUrl : undefined,
        imageUrl: typeof playable?.imageUrl === "string" ? playable.imageUrl : undefined,
        raw: data,
      });
    } catch (error) {
      setSelfTest({ status: "error", message: error instanceof Error ? error.message : "Self-test échoué" });
    }
  }

  async function generate() {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || busy) return;
    setBusy(true);
    setActiveError(null);

    const pending: StudioResult = {
      id: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      type: mode,
      title: cleanPrompt.slice(0, 64),
      prompt: cleanPrompt,
      status: "running",
      createdAt: new Date().toISOString(),
    };
    setResults(prev => [pending, ...prev]);

    try {
      let data: Record<string, unknown>;
      if (mode === "video") {
        data = await postJson("/api/studio/generate-video", {
          text: cleanPrompt,
          images: [],
          secondsPerImage: 2.5,
        });
      } else if (mode === "audio") {
        data = await postJson("/api/studio/generate-music", { prompt: cleanPrompt });
      } else {
        data = await postJson("/api/studio/generate-image", {
          prompt: cleanPrompt,
          width: 1024,
          height: 1024,
          style: "photorealistic",
        });
      }

      const url = typeof data.url === "string" ? data.url : undefined;
      const final: StudioResult = {
        ...pending,
        status: "success",
        url,
        engine: typeof data.engine === "string" ? data.engine : mode === "image" ? "image_provider" : undefined,
        degraded: Boolean(data.degraded),
        content: typeof data.note === "string" ? data.note : typeof data.hint === "string" ? data.hint : undefined,
      };
      setResults(prev => prev.map(r => r.id === pending.id ? final : r));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      setActiveError(message);
      setResults(prev => prev.map(r => r.id === pending.id ? { ...pending, status: "error", error: message } : r));
    } finally {
      setBusy(false);
    }
  }

  function clearResults() {
    setResults([]);
    localStorage.removeItem(STORAGE_KEY);
  }

  const modeLabel = mode === "video" ? "Vidéo MP4" : mode === "audio" ? "Audio jouable" : "Image";

  return (
    <div className="flex-1 overflow-y-auto bg-background pb-24">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Workers Status Panel */}
        {workers.status === "loaded" && (
          <section className="rounded-3xl border border-white/10 bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Cpu className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">État des workers</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {workers.workers.map(w => (
                <div key={w.id} className={cn("rounded-xl border p-3 text-sm", w.status === "connected" ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10")}>
                  <div className="flex items-center gap-2 mb-1">
                    {w.status === "connected" ? <Wifi className="h-4 w-4 text-emerald-400" /> : <WifiOff className="h-4 w-4 text-amber-400" />}
                    <span className="font-medium capitalize">{w.kind}</span>
                  </div>
                  <p className={cn("text-xs", w.status === "connected" ? "text-emerald-300" : "text-amber-300")}>
                    {w.status === "connected" ? "Connecté" : w.env ? `Set ${w.env}` : "Non configuré"}
                  </p>
                </div>
              ))}
              {workers.n8n && (
                <div className={cn("rounded-xl border p-3 text-sm", workers.n8n.configured ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10")}>
                  <div className="flex items-center gap-2 mb-1">
                    {workers.n8n.configured ? <Wifi className="h-4 w-4 text-emerald-400" /> : <WifiOff className="h-4 w-4 text-amber-400" />}
                    <span className="font-medium">n8n</span>
                  </div>
                  <p className={cn("text-xs", workers.n8n.configured ? "text-emerald-300" : "text-amber-300")}>
                    {workers.n8n.configured ? "Connecté" : "N8N_WEBHOOK_URL"}
                  </p>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Workers non configurés ? TAMS utilise les fallbacks gratuits (Pollinations, local WAV). Connectez des workers GPU pour des résultats premium.
            </p>
          </section>
        )}

        <header className="rounded-3xl border border-white/10 bg-card p-5 space-y-3">
          <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold">Studio opérationnel</p>
          <h1 className="text-3xl font-semibold">Créer un vrai résultat</h1>
          <p className="text-sm text-muted-foreground">
            Cette version appelle directement les endpoints réels. Vidéo = MP4 généré côté serveur. Audio = fichier jouable. Image = image réelle ou erreur claire.
          </p>
          <button
            onClick={runSelfTest}
            disabled={selfTest.status === "running"}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/5 disabled:opacity-50"
          >
            {selfTest.status === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
            Tester le Studio réel
          </button>
          {selfTest.status !== "idle" && (
            <div className={cn("rounded-2xl border p-3 text-sm", selfTest.status === "error" ? "border-red-500/30 bg-red-500/10 text-red-200" : selfTest.status === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-blue-500/30 bg-blue-500/10 text-blue-200")}>
              <p>{selfTest.message}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                {selfTest.videoUrl && <a className="text-primary hover:underline" href={absoluteUrl(selfTest.videoUrl)} target="_blank" rel="noreferrer">Ouvrir vidéo self-test</a>}
                {selfTest.audioUrl && <a className="text-primary hover:underline" href={absoluteUrl(selfTest.audioUrl)} target="_blank" rel="noreferrer">Ouvrir audio self-test</a>}
                {selfTest.imageUrl && <a className="text-primary hover:underline" href={absoluteUrl(selfTest.imageUrl)} target="_blank" rel="noreferrer">Ouvrir image self-test</a>}
              </div>
            </div>
          )}
        </header>

        <section className="rounded-3xl border border-white/10 bg-card p-5 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "video" as const, label: "Vidéo", icon: Film },
              { id: "audio" as const, label: "Audio", icon: Music },
              { id: "image" as const, label: "Image", icon: Image },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setMode(item.id)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition-all",
                  mode === item.id ? "border-primary bg-primary/15 text-primary" : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Demande</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-primary/50"
              placeholder="Décris ce que tu veux générer..."
            />
          </div>

          {activeError && (
            <div className="flex gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{activeError}</span>
            </div>
          )}

          <button
            onClick={generate}
            disabled={!prompt.trim() || busy}
            className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {busy ? "Génération réelle en cours..." : `Générer ${modeLabel}`}
          </button>
        </section>

        <section className="rounded-3xl border border-white/10 bg-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Résultats réels</h2>
              <p className="text-sm text-muted-foreground">Aucune carte fantôme : chaque résultat vient d'un appel API ou affiche une erreur.</p>
            </div>
            {results.length > 0 && (
              <button onClick={clearResults} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                <Trash2 className="h-3.5 w-3.5" /> Nettoyer
              </button>
            )}
          </div>

          {currentResults.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-muted-foreground">
              Aucun résultat {mode} pour l'instant. Lance une génération réelle ci-dessus.
            </div>
          ) : (
            <div className="grid gap-4">
              {currentResults.map(result => {
                const url = absoluteUrl(result.url);
                return (
                  <article key={result.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{result.title}</h3>
                        <p className="text-xs text-muted-foreground">{new Date(result.createdAt).toLocaleString("fr-FR")}</p>
                      </div>
                      <span className={cn("rounded-full px-2 py-1 text-[10px] font-medium", result.status === "success" ? "bg-emerald-500/10 text-emerald-300" : result.status === "running" ? "bg-blue-500/10 text-blue-300" : "bg-red-500/10 text-red-300")}>{result.status}</span>
                    </div>

                    {result.status === "running" && <div className="text-sm text-muted-foreground">Génération en cours...</div>}
                    {result.status === "error" && <div className="text-sm text-red-200">{result.error}</div>}
                    {result.status === "success" && renderMedia(result)}

                    {result.content && <p className="rounded-xl bg-white/5 p-3 text-xs text-muted-foreground">{result.content}</p>}
                    {result.degraded && <p className="text-xs text-amber-300">Fallback local utilisé : résultat réel mais qualité limitée.</p>}
                    {url && <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink className="h-3 w-3" /> Ouvrir le fichier</a>}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
