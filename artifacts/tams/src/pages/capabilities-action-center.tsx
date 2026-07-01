import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

type RunResult = {
  capabilityId: string;
  status: string;
  mode: string;
  title: string;
  result: string;
  artifact?: { type: string; url?: string; content?: string; data?: unknown };
  limitations?: string[];
  nextActions?: string[];
  providerUsed?: string;
};

const actions = [
  ["text.generate", "Texte", "Description produit / contenu"],
  ["text.analyze", "Analyse texte", "Résumé, risques, actions"],
  ["text.translate", "Traduction", "Traduction via IA"],
  ["studio.script.generate", "Script Studio", "Script vidéo/document"],
  ["studio.storyboard.generate", "Storyboard", "Plan scène par scène"],
  ["studio.prompt.generate", "Prompt externe", "Kling / Runway / Veo"],
  ["image.generate", "Image", "Image via Pollinations"],
  ["video.generate", "Vidéo réelle", "MP4 via FFmpeg + images"],
  ["video.edit", "Montage FFmpeg", "Assemblage slideshow réel"],
  ["audio.music.generate", "Musique", "MusicGen via HF_TOKEN"],
  ["audio.synthesize", "Voix off", "TTS via HF_TOKEN"],
  ["voice.transcribe", "Transcription", "URL audio → texte via HF_TOKEN"],
  ["automation.workflow", "n8n", "Webhook N8N_WEBHOOK_URL"],
  ["memory.query", "Mémoire", "Recherche mémoire DB"],
  ["repo.audit", "Audit repo", "GitHub read-only"],
  ["repo.validate", "Validation repo", "Audit/validation read-only"],
  ["repo.patch", "Patch repo", "Désactivé sauf garde-fous explicites"],
  ["observe.health", "Santé", "Version / providers / Railway"],
] as const;

function defaultInput(id: string): string {
  if (id === "voice.transcribe") return "Colle ici une URL audio publique.";
  if (id === "audio.music.generate") return "Musique courte moderne sportive premium, énergie TikTok, sans paroles.";
  if (id === "audio.synthesize") return "Cette tenue est pensée pour bouger librement toute la journée.";
  if (id === "automation.workflow") return "Test workflow n8n depuis TAMS.";
  if (id.startsWith("repo.")) return "Analyse mon repo TAMS et propose les prochaines corrections sans toucher main.";
  return "Vidéo TikTok activewear naturel, format 9:16, style UGC crédible, sans fausse promesse.";
}

function badgeClass(status: string): string {
  if (["success", "real", "ok"].includes(status)) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (["read_only", "plan_only"].includes(status)) return "border-orange-500/30 bg-orange-500/10 text-orange-300";
  if (["missing_config", "disabled", "planned"].includes(status)) return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (status === "error") return "border-red-500/30 bg-red-500/10 text-red-300";
  return "border-border bg-muted/20 text-muted-foreground";
}

export default function CapabilitiesActionCenterPage() {
  const [active, setActive] = useState("video.generate");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, RunResult>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [running, setRunning] = useState<string | null>(null);

  async function run(id: string) {
    const input = inputs[id] ?? defaultInput(id);
    setRunning(id);
    setErrors(prev => ({ ...prev, [id]: "" }));
    try {
      const response = await fetch(`${API_BASE}/api/capabilities/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capabilityId: id, input, options: { targetLanguage: "français" } }),
      });
      const data = await response.json() as RunResult;
      if (!response.ok) throw new Error(data.result || data.title || `HTTP ${response.status}`);
      setResults(prev => ({ ...prev, [id]: data }));
    } catch (error) {
      setErrors(prev => ({ ...prev, [id]: error instanceof Error ? error.message : String(error) }));
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-8 space-y-6">
      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          Capability Action Center
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Capacités TAMS</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Mode agent senior : chaque bouton appelle vraiment /api/capabilities/execute. Si un provider manque, TAMS affiche l’erreur de configuration au lieu de mentir.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {actions.map(([id, label, description]) => {
          const result = results[id];
          const error = errors[id];
          const isActive = active === id;
          return (
            <article key={id} className="rounded-2xl border border-border bg-card/70 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-medium">{label}</h2>
                  <p className="text-xs text-muted-foreground">{id}</p>
                </div>
                {result && <span className={`rounded-full border px-2 py-0.5 text-[11px] ${badgeClass(result.status)}`}>{result.status}</span>}
              </div>
              <p className="text-sm text-muted-foreground">{description}</p>
              <button type="button" className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary" onClick={() => setActive(isActive ? "" : id)}>
                {isActive ? "Fermer" : "Tester"}
              </button>
              {isActive && (
                <div className="space-y-3 rounded-xl border border-border bg-background/60 p-3">
                  <textarea
                    rows={4}
                    value={inputs[id] ?? defaultInput(id)}
                    onChange={(event) => setInputs(prev => ({ ...prev, [id]: event.target.value }))}
                    className="w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary"
                  />
                  <button type="button" disabled={running === id} onClick={() => run(id)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60">
                    {running === id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Exécuter
                  </button>
                  {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">{error}</div>}
                  {result && <ResultView result={result} />}
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}

function ResultView({ result }: { result: RunResult }) {
  return (
    <div className="space-y-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${badgeClass(result.status)}`}>{result.status}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${badgeClass(result.mode)}`}>{result.mode}</span>
        {result.providerUsed && <span className="text-xs text-muted-foreground">Provider : {result.providerUsed}</span>}
      </div>
      <div className="font-medium">{result.title}</div>
      {result.artifact?.type === "image" && result.artifact.url && <img src={result.artifact.url} alt={result.title} className="max-h-72 w-full rounded-lg border border-border object-cover" />}
      {result.artifact?.url && <a className="inline-flex rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary underline" href={result.artifact.url} target="_blank" rel="noreferrer">Ouvrir / télécharger</a>}
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background/80 p-3 text-xs text-foreground">{result.result}</pre>
      {result.limitations && result.limitations.length > 0 && <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">{result.limitations.map(item => <li key={item}>{item}</li>)}</ul>}
      {result.nextActions && result.nextActions.length > 0 && <ul className="list-disc space-y-1 pl-4 text-xs text-primary">{result.nextActions.map(item => <li key={item}>{item}</li>)}</ul>}
    </div>
  );
}
