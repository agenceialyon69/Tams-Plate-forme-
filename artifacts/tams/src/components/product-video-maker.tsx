import { useEffect, useState } from "react";
import { Film, Loader2, Download, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

interface ImageAsset {
  id: number;
  name: string;
  url: string | null;
}

/**
 * Générateur de VIDÉO réelle (TikTok/Reels 9:16) — 100 % gratuit (FFmpeg côté
 * serveur). Sélectionne des images (produits Shopify importés, images générées),
 * ajoute un texte, et obtiens un mp4 vertical téléchargeable.
 */
export function ProductVideoMaker() {
  const { toast } = useToast();
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [spi, setSpi] = useState(2.5);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/assets?type=image`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const list = (Array.isArray(data) ? data : []).filter((a: ImageAsset) => a.url);
        setAssets(list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggle(url: string) {
    setSelected((prev) => (prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]));
  }

  async function generate() {
    if (selected.length === 0 || generating) return;
    setGenerating(true);
    setVideoUrl(null);
    try {
      const res = await fetch(`${API_BASE}/api/studio/generate-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: selected, text: text.trim() || undefined, secondsPerImage: spi }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Génération échouée", description: data.detail || data.error || `HTTP ${res.status}`, variant: "destructive" });
      } else {
        setVideoUrl(`${API_BASE}${data.url}`);
        toast({ title: "Vidéo générée 🎬", description: `${data.images} images · ${data.durationSec}s · 9:16` });
      }
    } catch {
      toast({ title: "Génération échouée", description: "Vérifie ta connexion.", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="bg-gradient-to-br from-violet-500/[0.07] to-fuchsia-500/[0.07] border border-violet-500/20 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center border border-violet-500/20">
          <Film className="w-4 h-4 text-violet-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Vidéo TikTok (9:16) — gratuite</h3>
          <p className="text-[11px] text-muted-foreground">Sélectionne tes images produits → mp4 vertical</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : assets.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          Aucune image dans tes Assets. Génère des images (bouton Image) ou importe ta boutique Shopify (Système → Connecter Shopify).
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
          {assets.map((a) => {
            const idx = selected.indexOf(a.url!);
            const sel = idx !== -1;
            return (
              <button
                key={a.id}
                onClick={() => toggle(a.url!)}
                className={cn("relative aspect-square rounded-lg overflow-hidden border-2 transition-all", sel ? "border-violet-500" : "border-transparent opacity-80")}
              >
                <img src={a.url!} alt={a.name} className="w-full h-full object-cover" loading="lazy" />
                {sel && (
                  <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-violet-500 text-white text-[10px] flex items-center justify-center font-bold">{idx + 1}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Texte à afficher (ex: Nouvelle collection -20%)"
        className="w-full bg-background rounded-lg px-3 py-2 text-sm border border-border outline-none focus:border-violet-500/40"
        style={{ fontSize: "16px" }}
      />

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>Durée / image : {spi.toFixed(1)}s</span>
        <input type="range" min={1} max={5} step={0.5} value={spi} onChange={(e) => setSpi(Number(e.target.value))} className="flex-1 accent-violet-500" />
      </div>

      <button
        onClick={generate}
        disabled={generating || selected.length === 0}
        className="w-full py-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white text-sm font-medium disabled:opacity-40 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
      >
        {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Génération de la vidéo...</> : <><Film className="w-4 h-4" /> Générer la vidéo ({selected.length} image{selected.length > 1 ? "s" : ""})</>}
      </button>

      {videoUrl && (
        <div className="space-y-2">
          <video src={videoUrl} controls playsInline className="w-full rounded-xl max-h-96 bg-black" />
          <a href={videoUrl} download className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-secondary text-foreground text-sm font-medium border border-border">
            <Download className="w-4 h-4" /> Télécharger la vidéo
          </a>
        </div>
      )}
    </div>
  );
}
