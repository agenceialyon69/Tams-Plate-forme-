import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Wand2, Loader2, Download, ImageIcon, Film, Clapperboard, Plus, X, Sparkles } from "lucide-react";
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

interface Photo {
  url: string;     // data URL for preview
  base64: string;  // raw base64 for the API
  caption: string;
}

const TRANSITIONS = [
  { value: "fade", label: "Fondu" },
  { value: "dissolve", label: "Dissoudre" },
  { value: "slide", label: "Glissement" },
  { value: "circle", label: "Cercle" },
  { value: "none", label: "Aucune" },
];
const STYLES = [
  { value: "none", label: "Aucun" },
  { value: "vivid", label: "Lumineux" },
  { value: "warm", label: "Chaud" },
  { value: "cinema", label: "Cinéma" },
  { value: "bw", label: "N&B" },
];

function VideoPanel() {
  const [mode, setMode] = useState<"prompt" | "photos">("photos");
  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState("9:16");
  const [scenes, setScenes] = useState(4);
  const [seconds, setSeconds] = useState(2.5);
  const [transition, setTransition] = useState("fade");
  const [style, setStyle] = useState("none");
  const [kenBurns, setKenBurns] = useState(true);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<{ videoBase64: string; mimeType: string; durationSec: number } | null>(null);
  const [musicBase64, setMusicBase64] = useState<string | null>(null);
  const [musicName, setMusicName] = useState<string | null>(null);

  function onMusic(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setError("Musique trop volumineuse (max 8 Mo).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setMusicBase64((reader.result as string).split(",").pop() ?? null);
      setMusicName(file.name);
    };
    reader.readAsDataURL(file);
  }

  async function onPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    setError(null);
    const slots = 8 - photos.length;
    for (const file of files.slice(0, slots)) {
      if (file.size > 6 * 1024 * 1024) { setError("Photo trop lourde (max 6 Mo)."); continue; }
      const url = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error("read"));
        r.readAsDataURL(file);
      });
      setPhotos((ps) => (ps.length >= 8 ? ps : [...ps, { url, base64: url.split(",").pop() ?? "", caption: "" }]));
    }
  }

  function setCaption(i: number, caption: string) {
    setPhotos((ps) => ps.map((p, j) => (j === i ? { ...p, caption } : p)));
  }
  function removePhoto(i: number) {
    setPhotos((ps) => ps.filter((_, j) => j !== i));
  }

  async function generate() {
    if (loading) return;
    setError(null);
    setLoading(true);
    setVideo(null);
    try {
      let res: { videoBase64: string; mimeType: string; durationSec: number };
      const fx = { transition, style, kenBurns };
      if (mode === "prompt") {
        const p = prompt.trim();
        if (!p) { setLoading(false); return; }
        res = await apiFetch("/integrations/video/from-prompt", {
          method: "POST",
          body: JSON.stringify({ prompt: p, scenes, format, musicBase64: musicBase64 ?? undefined, ...fx }),
        });
      } else {
        if (photos.length === 0) { setLoading(false); return; }
        res = await apiFetch("/integrations/video/slideshow", {
          method: "POST",
          body: JSON.stringify({
            images: photos.map((p) => p.base64),
            captions: photos.map((p) => p.caption),
            format,
            secondsPerImage: seconds,
            musicBase64: musicBase64 ?? undefined,
            ...fx,
          }),
        });
      }
      setVideo(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Création vidéo impossible.");
    } finally {
      setLoading(false);
    }
  }

  const dataUrl = video ? `data:${video.mimeType};base64,${video.videoBase64}` : null;
  const canGenerate = mode === "prompt" ? prompt.trim().length > 0 : photos.length > 0;

  return (
    <div className="space-y-4">
      {/* Mode: mes photos (éditeur) vs prompt IA (générateur) */}
      <div className="inline-flex rounded-lg border border-border/60 p-0.5">
        <button
          onClick={() => setMode("photos")}
          className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md transition-colors ${
            mode === "photos" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted/40"
          }`}
        >
          <ImageIcon className="w-4 h-4" /> Mes photos
        </button>
        <button
          onClick={() => setMode("prompt")}
          className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md transition-colors ${
            mode === "prompt" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted/40"
          }`}
        >
          <Sparkles className="w-4 h-4" /> Prompt IA
        </button>
      </div>

      {mode === "prompt" ? (
        <>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Décris ta vidéo produit… ex : présentation d'une bougie artisanale, ambiance cosy, plans rapprochés"
            rows={3}
            className="resize-none"
            disabled={loading}
          />
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Scènes : {scenes}</p>
            <input type="range" min={2} max={6} value={scenes} onChange={(e) => setScenes(Number(e.target.value))} className="w-full sm:w-60 accent-accent" disabled={loading} />
          </div>
        </>
      ) : (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Tes photos produit ({photos.length}/8) — ajoute un texte par photo (nom, prix, accroche)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {photos.map((p, i) => (
              <div key={i} className="flex gap-2 items-start rounded-lg border border-border/50 p-2">
                <img src={p.url} alt="" className="w-14 h-14 object-cover rounded-md shrink-0" />
                <input
                  type="text"
                  value={p.caption}
                  onChange={(e) => setCaption(i, e.target.value)}
                  placeholder="Texte (ex : Bougie — 19,90€)"
                  maxLength={120}
                  className="flex-1 min-w-0 bg-background border border-border rounded-md px-2 py-1.5 text-sm"
                  disabled={loading}
                />
                <button onClick={() => removePhoto(i)} className="text-muted-foreground hover:text-destructive mt-1.5" title="Retirer">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            {photos.length < 8 && (
              <label className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border/60 py-6 cursor-pointer hover:bg-muted/30 text-muted-foreground">
                <Plus className="w-5 h-5" />
                <span className="text-xs">Ajouter des photos</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={onPhotos} disabled={loading} />
              </label>
            )}
          </div>
          <div className="mt-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Durée par photo : {seconds}s</p>
            <input type="range" min={1.5} max={5} step={0.5} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} className="w-full sm:w-60 accent-accent" disabled={loading} />
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Format</p>
        <div className="grid grid-cols-3 gap-2 max-w-md">
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

      {/* Effets pro */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Transition</p>
          <select value={transition} onChange={(e) => setTransition(e.target.value)} disabled={loading}
            className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-sm">
            {TRANSITIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Style couleur</p>
          <select value={style} onChange={(e) => setStyle(e.target.value)} disabled={loading}
            className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-sm">
            {STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
        <input type="checkbox" checked={kenBurns} onChange={(e) => setKenBurns(e.target.checked)} disabled={loading} className="accent-accent" />
        Mouvement « Ken Burns » (zoom doux, effet vivant)
      </label>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Musique (optionnel)</p>
        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-background/40 hover:bg-muted/40 transition-colors cursor-pointer text-sm text-foreground">
          <Film className="w-4 h-4" />
          {musicName ? `🎵 ${musicName.slice(0, 30)}` : "Ajouter un fichier audio (mp3)"}
          <input type="file" accept="audio/*" className="hidden" onChange={onMusic} disabled={loading} />
        </label>
        {musicName && (
          <button onClick={() => { setMusicBase64(null); setMusicName(null); }} className="ml-2 text-xs text-muted-foreground hover:text-destructive">
            retirer
          </button>
        )}
      </div>

      <Button onClick={generate} disabled={loading || !canGenerate} className="w-full sm:w-auto">
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Clapperboard className="w-4 h-4 mr-2" />}
        {loading ? "Création de la vidéo…" : "Créer la vidéo"}
      </Button>
      {loading && mode === "prompt" && (
        <p className="text-xs text-muted-foreground">Génération de {scenes} visuels puis montage… ~1 min.</p>
      )}

      {error && <p className="text-sm text-destructive bg-destructive/5 rounded-lg px-3 py-2">{error}</p>}

      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        {dataUrl ? (
          <div>
            <video src={dataUrl} controls loop className="w-full bg-black max-h-[70vh]" />
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/40">
              <span className="text-xs text-muted-foreground">{video?.durationSec}s · prête pour Shopify / Reels</span>
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
