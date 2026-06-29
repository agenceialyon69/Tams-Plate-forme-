import { useState } from "react";
import { Music, Loader2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

/**
 * Génération de MUSIQUE réelle (MusicGen via Hugging Face, gratuit avec un token
 * HF_TOKEN). À partir d'une description, produit une piste audio téléchargeable.
 */
export function MusicMaker() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  async function generate() {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setAudioUrl(null);
    try {
      const res = await fetch(`${API_BASE}/api/studio/generate-music`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Musique indisponible", description: data.hint || data.error || `HTTP ${res.status}`, variant: "destructive" });
      } else {
        setAudioUrl(`${API_BASE}${data.url}`);
        toast({ title: "Musique générée 🎵" });
      }
    } catch {
      toast({ title: "Génération échouée", description: "Vérifie ta connexion.", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="bg-gradient-to-br from-emerald-500/[0.07] to-teal-500/[0.07] border border-emerald-500/20 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
          <Music className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Musique IA — gratuite (MusicGen)</h3>
          <p className="text-[11px] text-muted-foreground">Décris l'ambiance → piste audio générée</p>
        </div>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="ex: musique électro entraînante pour une pub mode, 120 BPM, énergique"
        rows={3}
        className="w-full bg-background rounded-lg px-3 py-2 text-sm border border-border outline-none focus:border-emerald-500/40 resize-none"
        style={{ fontSize: "16px" }}
      />

      <button
        onClick={generate}
        disabled={generating || !prompt.trim()}
        className="w-full py-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white text-sm font-medium disabled:opacity-40 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
      >
        {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Génération (≈15-30s)...</> : <><Music className="w-4 h-4" /> Générer la musique</>}
      </button>

      {audioUrl && (
        <div className="space-y-2">
          <audio src={audioUrl} controls className="w-full" />
          <a href={audioUrl} download className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-secondary text-foreground text-sm font-medium border border-border">
            <Download className="w-4 h-4" /> Télécharger la musique
          </a>
        </div>
      )}
    </div>
  );
}
