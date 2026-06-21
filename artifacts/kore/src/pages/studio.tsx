import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Wand2, Loader2, Download, ImageIcon, Film, Clapperboard } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface GeneratedImage {
  imageBase64: string;
  mimeType: string;
  provider: string;
}

const IMAGE_SIZES = [
  { label: "Carré 1:1", width: 1024, height: 1024, hint: "Post / vignette" },
  { label: "Portrait 4:5", width: 1024, height: 1280, hint: "Fiche produit" },
  { label: "Story 9:16", width: 768, height: 1344, hint: "Reels / TikTok" },
  { label: "Paysage 16:9", width: 1344, height: 768, hint: "Bannière" },
];

const EXAMPLES = [
  "Photo produit d'une bougie parfumée artisanale sur fond beige, lumière douce, style premium",
  "Mug en céramique blanc sur une table en bois, vapeur de café, ambiance cosy du matin",
  "Sac à dos en cuir marron en studio, fond dégradé, éclairage professionnel e-commerce",
];

function ImagePanel() {
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState(IMAGE_SIZES[1]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<GeneratedImage | null>(null);

  async function generate() {
    const p = prompt.trim();
    if (!p || loading) return;
    setError(null);
    setLoading(true);
    setImage(null);
    try {
      const res = await apiFetch<GeneratedImage>("/integrations/image/generate", {
        method: "POST",
        body: JSON.stringify({ prompt: p, width: size.width, height: size.height }),
      });
      setImage(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Génération impossible.");
    } finally {
      setLoading(false);
    }
  }

  const dataUrl = image ? `data:${image.mimeType};base64,${image.imageBase64}` : null;

  return (
    <div className="space-y-4">
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Décris l'image voulue… ex : photo produit d'une bougie sur fond beige, lumière douce"
        rows={3}
        className="resize-none"
        disabled={loading}
      />

      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => setPrompt(ex)}
            className="text-[11px] px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground hover:bg-muted/40 transition-colors text-left"
          >
            {ex.length > 48 ? ex.slice(0, 48) + "…" : ex}
          </button>
        ))}
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Format</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {IMAGE_SIZES.map((s) => (
            <button
              key={s.label}
              onClick={() => setSize(s)}
              className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                size.label === s.label ? "border-accent bg-accent/5" : "border-border/50 hover:bg-muted/40"
              }`}
            >
              <span className="block text-sm text-foreground">{s.label}</span>
              <span className="block text-[10px] text-muted-foreground">{s.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <Button onClick={generate} disabled={loading || !prompt.trim()} className="w-full sm:w-auto">
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
        {loading ? "Génération…" : "Générer l'image"}
      </Button>

      {error && <p className="text-sm text-destructive bg-destructive/5 rounded-lg px-3 py-2">{error}</p>}

      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        {dataUrl ? (
          <div>
            <img src={dataUrl} alt={prompt} className="w-full object-contain bg-muted/20" />
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/40">
              <span className="text-xs text-muted-foreground">Généré via {image?.provider}</span>
              <a
                href={dataUrl}
                download={`tams-studio-${Date.now()}.png`}
                className="inline-flex items-center gap-1.5 text-sm text-foreground hover:underline"
              >
                <Download className="w-4 h-4" /> Télécharger
              </a>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            {loading ? (
              <Loader2 className="w-8 h-8 animate-spin opacity-40" />
            ) : (
              <>
                <ImageIcon className="w-8 h-8 opacity-30 mb-2" />
                <p className="text-sm">Ton image apparaîtra ici.</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const VIDEO_FORMATS = [
  { label: "Story 9:16", value: "9:16", hint: "Reels / TikTok" },
  { label: "Carré 1:1", value: "1:1", hint: "Feed" },
  { label: "Paysage 16:9", value: "16:9", hint: "YouTube" },
];

function VideoPanel() {
  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState("9:16");
  const [scenes, setScenes] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<{ videoBase64: string; mimeType: string; durationSec: number } | null>(null);

  async function generate() {
    const p = prompt.trim();
    if (!p || loading) return;
    setError(null);
    setLoading(true);
    setVideo(null);
    try {
      const res = await apiFetch<{ videoBase64: string; mimeType: string; durationSec: number }>(
        "/integrations/video/from-prompt",
        { method: "POST", body: JSON.stringify({ prompt: p, scenes, format }) }
      );
      setVideo(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Génération vidéo impossible.");
    } finally {
      setLoading(false);
    }
  }

  const dataUrl = video ? `data:${video.mimeType};base64,${video.videoBase64}` : null;

  return (
    <div className="space-y-4">
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Décris ta vidéo produit… ex : présentation d'une bougie artisanale, ambiance cosy, plans rapprochés"
        rows={3}
        className="resize-none"
        disabled={loading}
      />

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <p className="text-xs font-medium text-muted-foreground mb-2">Format</p>
          <div className="grid grid-cols-3 gap-2">
            {VIDEO_FORMATS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFormat(f.value)}
                className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                  format === f.value ? "border-accent bg-accent/5" : "border-border/50 hover:bg-muted/40"
                }`}
              >
                <span className="block text-sm text-foreground">{f.label}</span>
                <span className="block text-[10px] text-muted-foreground">{f.hint}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="sm:w-40">
          <p className="text-xs font-medium text-muted-foreground mb-2">Scènes : {scenes}</p>
          <input
            type="range"
            min={2}
            max={6}
            value={scenes}
            onChange={(e) => setScenes(Number(e.target.value))}
            className="w-full accent-accent"
            disabled={loading}
          />
          <p className="text-[10px] text-muted-foreground mt-1">~{(scenes * 2.5).toFixed(0)}s de vidéo</p>
        </div>
      </div>

      <Button onClick={generate} disabled={loading || !prompt.trim()} className="w-full sm:w-auto">
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Clapperboard className="w-4 h-4 mr-2" />}
        {loading ? "Création de la vidéo…" : "Créer la vidéo"}
      </Button>
      {loading && (
        <p className="text-xs text-muted-foreground">
          Génération de {scenes} visuels puis montage… cela peut prendre une minute.
        </p>
      )}

      {error && <p className="text-sm text-destructive bg-destructive/5 rounded-lg px-3 py-2">{error}</p>}

      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        {dataUrl ? (
          <div>
            <video src={dataUrl} controls loop className="w-full bg-black max-h-[70vh]" />
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/40">
              <span className="text-xs text-muted-foreground">{video?.durationSec}s · prête pour Shopify</span>
              <a
                href={dataUrl}
                download={`tams-video-${Date.now()}.mp4`}
                className="inline-flex items-center gap-1.5 text-sm text-foreground hover:underline"
              >
                <Download className="w-4 h-4" /> Télécharger
              </a>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            {loading ? (
              <Loader2 className="w-8 h-8 animate-spin opacity-40" />
            ) : (
              <>
                <Film className="w-8 h-8 opacity-30 mb-2" />
                <p className="text-sm">Ta vidéo apparaîtra ici.</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Studio() {
  const [tab, setTab] = useState<"image" | "video">("image");

  return (
    <div className="max-w-3xl mx-auto px-6 md:px-8 py-8 pb-24 md:pb-8">
      <header className="flex items-center gap-2.5 mb-6">
        <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
          <Wand2 className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-serif font-semibold text-foreground leading-none">Studio</h1>
          <p className="text-xs text-muted-foreground mt-1">Génère visuels et vidéos à partir d'un prompt (gratuit)</p>
        </div>
      </header>

      <div className="inline-flex rounded-lg border border-border/60 p-0.5 mb-6">
        <button
          onClick={() => setTab("image")}
          className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md transition-colors ${
            tab === "image" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted/40"
          }`}
        >
          <ImageIcon className="w-4 h-4" /> Image
        </button>
        <button
          onClick={() => setTab("video")}
          className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md transition-colors ${
            tab === "video" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted/40"
          }`}
        >
          <Film className="w-4 h-4" /> Vidéo
        </button>
      </div>

      {tab === "image" ? <ImagePanel /> : <VideoPanel />}
    </div>
  );
}
