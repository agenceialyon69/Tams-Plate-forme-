import { useEffect, useMemo, useState } from "react";
import { Image, Film, Music, Loader2, AlertTriangle, CheckCircle2, ExternalLink, Trash2 } from "lucide-react";
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

  useEffect(() => saveResults(results), [results]);

  const currentResults = useMemo(() => results.filter(r => r.type === mode), [results, mode]);

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
        <header className="rounded-3xl border border-white/10 bg-card p-5 space-y-3">
          <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold">Studio opérationnel</p>
          <h1 className="text-3xl font-semibold">Créer un vrai résultat</h1>
          <p className="text-sm text-muted-foreground">
            Cette version appelle directement les endpoints réels. Vidéo = MP4 généré côté serveur. Audio = fichier jouable. Image = image réelle ou erreur claire.
          </p>
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
              Aucun résultat {mode} pour l’instant. Lance une génération réelle ci-dessus.
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
