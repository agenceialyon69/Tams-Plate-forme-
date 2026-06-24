import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Wand2, Loader2, Download, ImageIcon, Film, Clapperboard,
  Plus, X, Sparkles, ChevronDown, ChevronUp, Music2, Palette,
  Zap, Type, Layers, Settings2, Play, Check, Maximize2,
  TrendingUp, ShoppingBag, BookOpen, Star, Clock, Share2,
  Mic, MicOff, Volume2, Cpu, AlertCircle, Radio, History,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";

// ─── Shared types ────────────────────────────────────────────────────────────

interface GeneratedImage {
  imageBase64: string;
  mimeType: string;
  provider: string;
}

interface NexusJob {
  id: string;
  type: "video" | "music";
  model: string;
  status: "pending" | "processing" | "done" | "failed";
  prompt: string;
  hasResult: boolean;
  resultBase64?: string;
  resultMime?: string;
  error: string | null;
  createdAt: string;
}

interface NexusStatus {
  configured: boolean;
  models: {
    video: { available: boolean };
    music: { available: boolean };
  };
}

interface VideoHistoryItem {
  id: string;
  dataUrl: string;
  prompt: string;
  format: string;
  durationSec: number;
  createdAt: number;
}

// ─── Shared components ───────────────────────────────────────────────────────

const IMAGE_SIZES = [
  { label: "Carré 1:1", width: 1024, height: 1024, hint: "Post / vignette", ratio: "square" },
  { label: "Portrait 4:5", width: 1024, height: 1280, hint: "Fiche produit", ratio: "portrait" },
  { label: "Story 9:16", width: 768, height: 1344, hint: "Reels / TikTok", ratio: "story" },
  { label: "Paysage 16:9", width: 1344, height: 768, hint: "Bannière", ratio: "landscape" },
];

const IMG_EXAMPLES = [
  "Photo produit d'une bougie parfumée artisanale sur fond beige, lumière douce, style premium",
  "Mug en céramique blanc sur table en bois, vapeur de café, ambiance cosy du matin",
  "Sac à dos en cuir marron en studio, fond dégradé, éclairage professionnel",
];

function SectionCard({
  step,
  title,
  icon: Icon,
  children,
  collapsible = false,
  defaultOpen = true,
}: {
  step?: number;
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => collapsible && setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-5 py-4 ${collapsible ? "cursor-pointer hover:bg-muted/30" : "cursor-default"}`}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {step !== undefined && (
            <span className="w-6 h-6 rounded-full bg-accent/15 text-accent text-xs font-semibold flex items-center justify-center shrink-0">
              {step}
            </span>
          )}
          <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-accent" />
          </div>
          <span className="font-medium text-sm text-foreground">{title}</span>
        </div>
        {collapsible && (
          <span className="text-muted-foreground shrink-0">
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        )}
      </button>
      {open && <div className="px-5 pb-5 border-t border-border/40 pt-4">{children}</div>}
    </div>
  );
}

function ChoiceGrid<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
            value === o.value
              ? "border-accent bg-accent/10 text-foreground font-medium"
              : "border-border/50 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          }`}
        >
          {o.label}
          {o.hint && <span className="ml-1 text-xs opacity-60">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}

// ─── Image Panel ─────────────────────────────────────────────────────────────

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
      <SectionCard step={1} title="Décris l'image" icon={Type}>
        <div className="space-y-3">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Décris l'image voulue… ex : photo produit d'une bougie sur fond beige, lumière douce"
            rows={3}
            className="resize-none"
            disabled={loading}
          />
          <div className="flex flex-wrap gap-1.5">
            {IMG_EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setPrompt(ex)}
                className="text-[11px] px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground hover:bg-muted/40 transition-colors text-left"
              >
                {ex.length > 50 ? ex.slice(0, 50) + "…" : ex}
              </button>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard step={2} title="Format" icon={Layers}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {IMAGE_SIZES.map((s) => (
            <button
              key={s.label}
              onClick={() => setSize(s)}
              className={`text-left px-3 py-2.5 rounded-xl border transition-colors ${
                size.label === s.label
                  ? "border-accent bg-accent/8 shadow-sm"
                  : "border-border/50 hover:bg-muted/40"
              }`}
            >
              <span className="block text-sm font-medium text-foreground">{s.label}</span>
              <span className="block text-[10px] text-muted-foreground mt-0.5">{s.hint}</span>
            </button>
          ))}
        </div>
      </SectionCard>

      <Button onClick={generate} disabled={loading || !prompt.trim()} className="w-full sm:w-auto gap-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
        {loading ? "Génération…" : "Générer l'image"}
      </Button>

      {error && <p className="text-sm text-destructive bg-destructive/5 rounded-lg px-3 py-2">{error}</p>}

      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        {dataUrl ? (
          <>
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
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            {loading ? (
              <>
                <Loader2 className="w-8 h-8 animate-spin opacity-40 mb-3" />
                <p className="text-sm">Génération IA en cours…</p>
              </>
            ) : (
              <>
                <ImageIcon className="w-8 h-8 opacity-30 mb-2" />
                <p className="text-sm">Ton image apparaîtra ici</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Video Panel ─────────────────────────────────────────────────────────────

const VIDEO_FORMATS = [
  { label: "Story 9:16", value: "9:16", hint: "Reels / TikTok" },
  { label: "Carré 1:1", value: "1:1", hint: "Feed" },
  { label: "Paysage 16:9", value: "16:9", hint: "YouTube" },
];

const TRANSITIONS = [
  { value: "fade", label: "Fondu" }, { value: "dissolve", label: "Dissoudre" },
  { value: "slide", label: "Glissement" }, { value: "wipeleft", label: "Balayage →" },
  { value: "wiperight", label: "Balayage ←" }, { value: "wipeup", label: "Balayage ↑" },
  { value: "wipedown", label: "Balayage ↓" }, { value: "pixelize", label: "Pixels" },
  { value: "radial", label: "Radial" }, { value: "zoomin", label: "Zoom avant" },
  { value: "fadeblack", label: "Noir" }, { value: "fadewhite", label: "Blanc" },
  { value: "circle", label: "Cercle" }, { value: "squeezeh", label: "Compress. H" },
  { value: "none", label: "Aucune" },
];

const STYLES = [
  { value: "none", label: "Original", hint: "" }, { value: "vivid", label: "Vivid", hint: "Saturé" },
  { value: "warm", label: "Warm", hint: "Chaleureux" }, { value: "cinema", label: "Cinéma", hint: "Contrasté" },
  { value: "bw", label: "N&B", hint: "Noir & blanc" }, { value: "golden", label: "Golden", hint: "Doré" },
  { value: "cool", label: "Cool", hint: "Froid/Bleu" }, { value: "matte", label: "Matte", hint: "Doux" },
  { value: "vintage", label: "Vintage", hint: "Rétro" }, { value: "neon", label: "Neon", hint: "Hyper saturé" },
];

const KB_MODES = [
  { value: "zoom-in", label: "Zoom avant" }, { value: "zoom-out", label: "Zoom arrière" },
  { value: "pan-left", label: "Pan gauche" }, { value: "pan-right", label: "Pan droit" },
  { value: "diagonal", label: "Diagonal" }, { value: "random", label: "Aléatoire" },
];

const SPEEDS = [
  { value: "slow", label: "Lent", hint: "+40%" },
  { value: "normal", label: "Normal", hint: "" },
  { value: "fast", label: "Rapide", hint: "-30%" },
];

const QUALITIES = [
  { value: "fast", label: "Rapide", hint: "Preview" },
  { value: "balanced", label: "Équilibré", hint: "Standard" },
  { value: "pro", label: "Pro", hint: "Haute qualité" },
];

const CAP_POS = [
  { value: "bottom", label: "Bas" }, { value: "top", label: "Haut" }, { value: "center", label: "Centre" },
];

const SUB_STYLES = [
  { value: "box", label: "Box noir" }, { value: "shadow", label: "Ombre" }, { value: "clean", label: "Propre" },
];

interface Photo {
  url: string;
  base64: string;
  caption: string;
}

const VIDEO_TEMPLATES = [
  {
    id: "tiktok-viral", label: "TikTok Viral", icon: TrendingUp,
    color: "from-rose-500/15 to-orange-500/10 border-rose-500/20",
    hint: "9:16 · 4 scènes · Vivid · Fade",
    apply: { mode: "prompt" as const, format: "9:16", scenes: 4, seconds: 2.5, style: "vivid", transition: "fade", kenBurns: true, kenBurnsMode: "zoom-in", speed: "fast" },
  },
  {
    id: "reels-story", label: "Reels Story", icon: Star,
    color: "from-purple-500/15 to-pink-500/10 border-purple-500/20",
    hint: "9:16 · 3 scènes · Warm · Slide",
    apply: { mode: "prompt" as const, format: "9:16", scenes: 3, seconds: 3, style: "warm", transition: "slide", kenBurns: true, kenBurnsMode: "pan-right", speed: "normal" },
  },
  {
    id: "youtube-showcase", label: "YouTube", icon: BookOpen,
    color: "from-red-500/15 to-orange-500/10 border-red-500/20",
    hint: "16:9 · 5 scènes · Cinéma · Fondu",
    apply: { mode: "prompt" as const, format: "16:9", scenes: 5, seconds: 4, style: "cinema", transition: "fade", kenBurns: true, kenBurnsMode: "diagonal", speed: "slow" },
  },
  {
    id: "product-promo", label: "Produit", icon: ShoppingBag,
    color: "from-emerald-500/15 to-teal-500/10 border-emerald-500/20",
    hint: "1:1 · Photos · Golden · Glissement",
    apply: { mode: "photos" as const, format: "1:1", scenes: 4, seconds: 3, style: "golden", transition: "slide", kenBurns: true, kenBurnsMode: "zoom-in", speed: "normal" },
  },
  {
    id: "lookbook", label: "Lookbook", icon: Clock,
    color: "from-amber-500/15 to-yellow-500/10 border-amber-500/20",
    hint: "4:5 · Photos · Matte · Dissoudre",
    apply: { mode: "photos" as const, format: "4:5", scenes: 6, seconds: 3.5, style: "matte", transition: "dissolve", kenBurns: false, kenBurnsMode: "zoom-in", speed: "slow" },
  },
];

const LOADING_STEPS_PROMPT = [
  { label: "Génération des visuels IA", detail: "Modèle diffusion…" },
  { label: "Traitement des scènes", detail: "Mise en composition…" },
  { label: "Assemblage FFmpeg", detail: "Encodage vidéo…" },
  { label: "Mixage audio", detail: "Normalisation + fade…" },
  { label: "Export final", detail: "Optimisation…" },
];

const LOADING_STEPS_PHOTOS = [
  { label: "Lecture des photos", detail: "Décodage base64…" },
  { label: "Effets visuels", detail: "Ken Burns + couleur…" },
  { label: "Assemblage FFmpeg", detail: "Encodage vidéo…" },
  { label: "Mixage audio", detail: "Normalisation + fade…" },
  { label: "Export final", detail: "Optimisation…" },
];

function WanBadge({ nexusConfigured }: { nexusConfigured: boolean }) {
  return (
    <div className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full font-medium border ${
      nexusConfigured
        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
        : "bg-muted/60 text-muted-foreground border-border/40"
    }`}>
      <Cpu className="w-3 h-3" />
      Wan 2.1 + FramePack {nexusConfigured ? "— GPU actif" : "— GPU optionnel"}
    </div>
  );
}

function VideoPanel({ nexusConfigured }: { nexusConfigured: boolean }) {
  const [mode, setMode] = useState<"photos" | "prompt">("photos");
  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState("9:16");
  const [scenes, setScenes] = useState(4);
  const [seconds, setSeconds] = useState(2.5);
  const [transition, setTransition] = useState("fade");
  const [style, setStyle] = useState("none");
  const [kenBurns, setKenBurns] = useState(true);
  const [kenBurnsMode, setKenBurnsMode] = useState("zoom-in");
  const [speed, setSpeed] = useState("normal");
  const [quality, setQuality] = useState("balanced");
  const [capPos, setCapPos] = useState("bottom");
  const [subStyle, setSubStyle] = useState("box");
  const [brand, setBrand] = useState("");
  const [introTitle, setIntroTitle] = useState("");
  const [introSubtitle, setIntroSubtitle] = useState("");
  const [outroTitle, setOutroTitle] = useState("");
  const [outroSubtitle, setOutroSubtitle] = useState("");
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStepIdx, setLoadingStepIdx] = useState(0);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<{ videoBase64: string; mimeType: string; durationSec: number } | null>(null);
  const [musicBase64, setMusicBase64] = useState<string | null>(null);
  const [musicName, setMusicName] = useState<string | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  // Session-only video history (cleared on page refresh)
  const [videoHistory, setVideoHistory] = useState<VideoHistoryItem[]>([]);
  const videoRef = useRef<HTMLDivElement>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadingSteps = mode === "prompt" ? LOADING_STEPS_PROMPT : LOADING_STEPS_PHOTOS;

  useEffect(() => {
    if (!loading) {
      if (progressTimer.current) clearInterval(progressTimer.current);
      setLoadingProgress(0);
      setLoadingStepIdx(0);
      return;
    }
    setLoadingProgress(0);
    setLoadingStepIdx(0);
    const totalMs = mode === "prompt" ? 65000 : 32000;
    const tickMs = 400;
    const totalTicks = totalMs / tickMs;
    let tick = 0;
    progressTimer.current = setInterval(() => {
      tick++;
      const pct = Math.min(96, (tick / totalTicks) * 100);
      setLoadingProgress(pct);
      const stepIdx = Math.min(loadingSteps.length - 1, Math.floor((pct / 100) * loadingSteps.length));
      setLoadingStepIdx(stepIdx);
    }, tickMs);
    return () => { if (progressTimer.current) clearInterval(progressTimer.current); };
  }, [loading]);

  function applyTemplate(tpl: typeof VIDEO_TEMPLATES[0]) {
    setActiveTemplate(tpl.id);
    setMode(tpl.apply.mode);
    setFormat(tpl.apply.format);
    setScenes(tpl.apply.scenes);
    setSeconds(tpl.apply.seconds);
    setStyle(tpl.apply.style);
    setTransition(tpl.apply.transition);
    setKenBurns(tpl.apply.kenBurns);
    setKenBurnsMode(tpl.apply.kenBurnsMode);
    setSpeed(tpl.apply.speed);
  }

  function onMusic(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setError("Musique trop volumineuse (max 8 Mo)."); return; }
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
    const slots = 20 - photos.length;
    for (const file of files.slice(0, slots)) {
      if (file.size > 6 * 1024 * 1024) { setError("Photo trop lourde (max 6 Mo)."); continue; }
      const url = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error("read"));
        r.readAsDataURL(file);
      });
      setPhotos((ps) => ps.length >= 20 ? ps : [...ps, { url, base64: url.split(",").pop() ?? "", caption: "" }]);
    }
  }

  function setCaption(i: number, caption: string) {
    setPhotos((ps) => ps.map((p, j) => j === i ? { ...p, caption } : p));
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
      const fx = {
        transition, style, kenBurns, kenBurnsMode, speed, quality,
        captionPosition: capPos, subtitleStyle: subStyle,
        brand: brand.trim() || undefined,
        intro: introTitle.trim() || introSubtitle.trim() ? { title: introTitle, subtitle: introSubtitle } : undefined,
        outro: outroTitle.trim() || outroSubtitle.trim() ? { title: outroTitle, subtitle: outroSubtitle } : undefined,
        logoBase64: logoBase64 ?? undefined,
      };

      let res: { videoBase64: string; mimeType: string; durationSec: number };

      if (mode === "prompt") {
        const p = prompt.trim();
        if (!p) { setLoading(false); return; }
        res = await apiFetch("/integrations/video/from-prompt", {
          method: "POST",
          body: JSON.stringify({ prompt: p, scenes, format, musicBase64: musicBase64 ?? undefined, secondsPerImage: seconds, ...fx }),
        });
      } else {
        if (photos.length === 0) { setLoading(false); return; }
        res = await apiFetch("/integrations/video/slideshow", {
          method: "POST",
          body: JSON.stringify({
            images: photos.map((p) => p.base64),
            captions: photos.map((p) => p.caption),
            format, secondsPerImage: seconds,
            musicBase64: musicBase64 ?? undefined,
            ...fx,
          }),
        });
      }
      setLoadingProgress(100);
      setVideo(res);
      const historyItem: VideoHistoryItem = {
        id: `vid-${Date.now()}`,
        dataUrl: `data:${res.mimeType};base64,${res.videoBase64}`,
        prompt: mode === "prompt" ? prompt.trim() : `Slideshow ${photos.length} photos`,
        format,
        durationSec: res.durationSec,
        createdAt: Date.now(),
      };
      setVideoHistory((prev) => [historyItem, ...prev].slice(0, 12));
      setTimeout(() => videoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Création vidéo impossible.");
    } finally {
      setLoading(false);
    }
  }

  const dataUrl = video ? `data:${video.mimeType};base64,${video.videoBase64}` : null;
  const canGenerate = mode === "prompt" ? prompt.trim().length > 0 : photos.length > 0;
  const formatMeta = VIDEO_FORMATS.find((f) => f.value === format) ?? VIDEO_FORMATS[0];

  return (
    <div className="space-y-4">
      {/* NexusAI Wan 2.1 badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <WanBadge nexusConfigured={nexusConfigured} />
        {!nexusConfigured && (
          <span className="text-[10px] text-muted-foreground">
            Mode slideshow FFmpeg actif — définissez NEXUS_AI_URL pour activer la génération vidéo GPU.
          </span>
        )}
      </div>

      {/* Templates rapides */}
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-foreground">Templates rapides</span>
            <span className="text-xs text-muted-foreground ml-1">— pré-configure tous les réglages</span>
          </div>
        </div>
        <div className="px-5 py-4 flex gap-2.5 overflow-x-auto pb-4 scrollbar-none">
          {VIDEO_TEMPLATES.map((tpl) => {
            const Icon = tpl.icon;
            const active = activeTemplate === tpl.id;
            return (
              <button
                key={tpl.id}
                onClick={() => applyTemplate(tpl)}
                disabled={loading}
                className={`shrink-0 flex flex-col items-start gap-1.5 px-4 py-3 rounded-xl border bg-gradient-to-br transition-all text-left min-w-[130px] ${tpl.color} ${
                  active ? "ring-2 ring-accent shadow-sm scale-[1.02]" : "hover:scale-[1.01] hover:shadow-sm"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${active ? "text-accent" : "text-foreground/70"}`} />
                  <span className="text-sm font-semibold text-foreground">{tpl.label}</span>
                  {active && <Check className="w-3.5 h-3.5 text-accent ml-auto" />}
                </div>
                <span className="text-[10px] text-muted-foreground leading-tight">{tpl.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 1 — Content */}
      <SectionCard step={1} title="Contenu" icon={ImageIcon}>
        <div className="space-y-4">
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
            <div className="space-y-3">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Décris ta vidéo produit… ex : présentation d'une bougie artisanale, ambiance cosy, fond beige"
                rows={3}
                className="resize-none"
                disabled={loading}
              />
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Nombre de scènes</p>
                  <span className="text-xs font-semibold text-foreground bg-muted/50 px-2 py-0.5 rounded">{scenes}</span>
                </div>
                <input
                  type="range" min={2} max={12} value={scenes}
                  onChange={(e) => setScenes(Number(e.target.value))}
                  className="w-full sm:w-60 accent-accent" disabled={loading}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {photos.length}/20 photos — ajoute un texte par photo (nom, prix, accroche)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {photos.map((p, i) => (
                  <div key={i} className="flex gap-2 items-start rounded-xl border border-border/50 p-2 bg-background/50">
                    <img src={p.url} alt="" className="w-14 h-14 object-cover rounded-lg shrink-0" />
                    <input
                      type="text" value={p.caption}
                      onChange={(e) => setCaption(i, e.target.value)}
                      placeholder="Texte (ex : Bougie — 19,90€)" maxLength={120}
                      className="flex-1 min-w-0 bg-background border border-border rounded-lg px-2 py-1.5 text-sm"
                      disabled={loading}
                    />
                    <button onClick={() => removePhoto(i)} className="text-muted-foreground hover:text-destructive mt-1.5" title="Retirer">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {photos.length < 20 && (
                  <label className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/60 py-6 cursor-pointer hover:bg-muted/30 text-muted-foreground transition-colors">
                    <Plus className="w-5 h-5" />
                    <span className="text-xs">Ajouter des photos</span>
                    <input type="file" accept="image/*" multiple className="hidden" onChange={onPhotos} disabled={loading} />
                  </label>
                )}
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Step 2 — Format */}
      <SectionCard step={2} title="Format & durée" icon={Layers}>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Format vidéo</p>
            <div className="flex gap-2 flex-wrap">
              {VIDEO_FORMATS.map((f) => {
                const isSelected = format === f.value;
                const previewW = f.value === "9:16" ? 18 : f.value === "1:1" ? 28 : 44;
                const previewH = f.value === "9:16" ? 32 : f.value === "1:1" ? 28 : 25;
                return (
                  <button
                    key={f.value} onClick={() => setFormat(f.value)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                      isSelected ? "border-accent bg-accent/8 shadow-sm" : "border-border/50 hover:bg-muted/40"
                    }`}
                  >
                    <div className={`rounded border-2 transition-colors shrink-0 ${isSelected ? "border-accent" : "border-muted-foreground/30"}`}
                      style={{ width: previewW, height: previewH }} />
                    <div className="text-left">
                      <span className="block text-sm font-medium text-foreground">{f.label}</span>
                      <span className="block text-[10px] text-muted-foreground">{f.hint}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium text-muted-foreground">Durée par {mode === "prompt" ? "scène" : "photo"}</p>
                <span className="text-xs font-semibold text-foreground bg-muted/50 px-2 py-0.5 rounded">{seconds}s</span>
              </div>
              <input type="range" min={1.5} max={5} step={0.5} value={seconds}
                onChange={(e) => setSeconds(Number(e.target.value))}
                className="w-full accent-accent" disabled={loading} />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Vitesse globale</p>
              <ChoiceGrid options={SPEEDS} value={speed as "normal"} onChange={setSpeed as (v: "normal") => void} disabled={loading} />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Qualité d'encodage</p>
              <ChoiceGrid options={QUALITIES} value={quality as "balanced"} onChange={setQuality as (v: "balanced") => void} disabled={loading} />
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Step 3 — Style */}
      <SectionCard step={3} title="Style & Effets" icon={Palette} collapsible defaultOpen>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Étalonnage couleur</p>
            <ChoiceGrid options={STYLES} value={style as "none"} onChange={setStyle as (v: "none") => void} disabled={loading} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Transition</p>
            <ChoiceGrid options={TRANSITIONS} value={transition as "fade"} onChange={setTransition as (v: "fade") => void} disabled={loading} />
          </div>
          <div>
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <div onClick={() => setKenBurns((v) => !v)}
                className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${kenBurns ? "bg-accent" : "bg-muted"}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${kenBurns ? "translate-x-4" : "translate-x-0"}`} />
              </div>
              <span className="text-sm text-foreground">Mouvement Ken Burns (zoom/pan cinématique)</span>
            </label>
            {kenBurns && (
              <div className="mt-3 ml-11">
                <p className="text-xs font-medium text-muted-foreground mb-2">Variation</p>
                <ChoiceGrid options={KB_MODES} value={kenBurnsMode as "zoom-in"} onChange={setKenBurnsMode as (v: "zoom-in") => void} disabled={loading} />
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Step 4 — Text */}
      <SectionCard step={4} title="Sous-titres & Texte" icon={Type} collapsible defaultOpen>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Position du texte</p>
              <ChoiceGrid options={CAP_POS} value={capPos as "bottom"} onChange={setCapPos as (v: "bottom") => void} disabled={loading} />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Style de rendu</p>
              <ChoiceGrid options={SUB_STYLES} value={subStyle as "box"} onChange={setSubStyle as (v: "box") => void} disabled={loading} />
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Step 5 — Branding */}
      <SectionCard step={5} title="Branding & Cartes" icon={Settings2} collapsible defaultOpen={false}>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Bandeau de marque</p>
            <input type="text" value={brand} onChange={(e) => setBrand(e.target.value)}
              placeholder="@maboutique" maxLength={60} disabled={loading}
              className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Logo (optionnel)</p>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-background/40 hover:bg-muted/40 cursor-pointer text-sm text-foreground transition-colors">
              <ImageIcon className="w-4 h-4" />
              {logoName ? `${logoName.slice(0, 24)}` : "Ajouter un logo (png)"}
              <input type="file" accept="image/*" className="hidden" disabled={loading}
                onChange={(e) => {
                  const f = e.target.files?.[0]; e.target.value = "";
                  if (!f) return;
                  if (f.size > 4 * 1024 * 1024) { setError("Logo trop lourd (max 4 Mo)."); return; }
                  const r = new FileReader();
                  r.onload = () => { setLogoBase64((r.result as string).split(",").pop() ?? null); setLogoName(f.name); };
                  r.readAsDataURL(f);
                }} />
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Carte d'intro</p>
              <div className="space-y-1.5">
                <input type="text" value={introTitle} onChange={(e) => setIntroTitle(e.target.value)}
                  placeholder="Titre" maxLength={80} disabled={loading}
                  className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-sm" />
                <input type="text" value={introSubtitle} onChange={(e) => setIntroSubtitle(e.target.value)}
                  placeholder="Sous-titre" maxLength={100} disabled={loading}
                  className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-sm" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Carte de fin (CTA)</p>
              <div className="space-y-1.5">
                <input type="text" value={outroTitle} onChange={(e) => setOutroTitle(e.target.value)}
                  placeholder="Titre" maxLength={80} disabled={loading}
                  className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-sm" />
                <input type="text" value={outroSubtitle} onChange={(e) => setOutroSubtitle(e.target.value)}
                  placeholder="Sous-titre" maxLength={100} disabled={loading}
                  className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-sm" />
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Step 6 — Audio */}
      <SectionCard step={6} title="Musique (optionnel)" icon={Music2} collapsible defaultOpen={false}>
        <div className="space-y-3">
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-background/40 hover:bg-muted/40 transition-colors cursor-pointer text-sm text-foreground">
            <Music2 className="w-4 h-4" />
            {musicName ? `${musicName.slice(0, 30)}` : "Ajouter un fichier audio (mp3, max 8 Mo)"}
            <input type="file" accept="audio/*" className="hidden" onChange={onMusic} disabled={loading} />
          </label>
          {musicName && (
            <button onClick={() => { setMusicBase64(null); setMusicName(null); }} className="ml-2 text-xs text-muted-foreground hover:text-destructive">retirer</button>
          )}
          <p className="text-xs text-muted-foreground">Musique tronquée et fondue à la durée de la vidéo.</p>
        </div>
      </SectionCard>

      {/* Generate */}
      <div className="pt-2 flex items-center gap-4 flex-wrap">
        <Button onClick={generate} disabled={loading || !canGenerate} size="lg" className="gap-2 min-w-[180px]">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clapperboard className="w-4 h-4" />}
          {loading ? "Création en cours…" : "Créer la vidéo"}
        </Button>
        <span className="text-xs text-muted-foreground">
          {mode === "prompt" ? `~${Math.round(scenes * 12 + 15)}s · Format ${formatMeta.label}` : `~${Math.round(photos.length * 4 + 10)}s · ${photos.length} photo${photos.length > 1 ? "s" : ""}`}
        </span>
      </div>

      {error && <p className="text-sm text-destructive bg-destructive/5 rounded-xl px-4 py-3">{error}</p>}

      {/* Video History Gallery (session-only) */}
      {videoHistory.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/20">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">Videos de la session</span>
              <span className="text-[10px] text-muted-foreground">({videoHistory.length})</span>
            </div>
            <button
              onClick={() => setVideoHistory([])}
              className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
            >
              Effacer
            </button>
          </div>
          <div className="p-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
            {videoHistory.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setVideo({ videoBase64: item.dataUrl.split(",")[1] ?? "", mimeType: "video/mp4", durationSec: item.durationSec });
                  videoRef.current?.scrollIntoView({ behavior: "smooth" });
                }}
                className="relative aspect-video rounded-lg overflow-hidden bg-black group border border-border/40 hover:border-accent/60 transition-colors"
              >
                <video src={item.dataUrl} className="w-full h-full object-cover" muted playsInline />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Play className="w-6 h-6 text-white" />
                </div>
                <div className="absolute bottom-1 right-1 text-[9px] font-mono bg-black/70 text-white px-1.5 py-0.5 rounded">
                  {item.durationSec}s
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Result */}
      <div ref={videoRef} className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        {dataUrl ? (
          <>
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border/40 bg-emerald-500/5">
              <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <Check className="w-3 h-3 text-emerald-500" />
              </div>
              <span className="text-sm font-semibold text-foreground">Vidéo prête</span>
              <div className="ml-auto flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{video?.durationSec}s · {formatMeta.label}</span>
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-medium">
                  <Share2 className="w-3 h-3" /> Prête TikTok / Reels
                </span>
              </div>
            </div>
            <div className="relative bg-black group">
              <video ref={videoElRef} src={dataUrl} controls loop playsInline className="w-full max-h-[72vh] object-contain" />
              <button onClick={() => videoElRef.current?.requestFullscreen?.()}
                className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-border/40 bg-muted/10">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Zap className="w-3.5 h-3.5 text-accent" />
                <span>FFmpeg · 100% gratuit · aucune watermark</span>
              </div>
              <a href={dataUrl} download={`tams-video-${Date.now()}.mp4`}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-accent transition-colors">
                <Download className="w-4 h-4" /> Télécharger .mp4
              </a>
            </div>
          </>
        ) : loading ? (
          <div className="px-6 py-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Loader2 className="w-8 h-8 animate-spin text-accent/40" />
                <Clapperboard className="w-3.5 h-3.5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-accent" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{loadingSteps[loadingStepIdx]?.label ?? "Traitement…"}</p>
                <p className="text-xs text-muted-foreground">{loadingSteps[loadingStepIdx]?.detail ?? ""}</p>
              </div>
              <span className="ml-auto text-xs font-mono text-accent font-semibold">{Math.round(loadingProgress)}%</span>
            </div>
            <div className="w-full h-1.5 bg-muted/40 rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${loadingProgress}%` }} />
            </div>
            <div className="space-y-2.5">
              {loadingSteps.map((step, i) => {
                const done = i < loadingStepIdx;
                const active = i === loadingStepIdx;
                return (
                  <div key={i} className={`flex items-center gap-3 text-sm transition-opacity ${done || active ? "opacity-100" : "opacity-30"}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border transition-colors ${
                      done ? "bg-emerald-500/15 border-emerald-500/40" : active ? "bg-accent/15 border-accent/40" : "border-border/40"}`}>
                      {done ? <Check className="w-3 h-3 text-emerald-500" />
                        : active ? <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                        : <div className="w-2 h-2 rounded-full bg-muted-foreground/20" />}
                    </div>
                    <span className={done ? "line-through text-muted-foreground" : active ? "text-foreground font-medium" : "text-muted-foreground"}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
              <Film className="w-7 h-7 opacity-30" />
            </div>
            <p className="text-sm font-medium text-foreground/60">Ta vidéo apparaîtra ici</p>
            <p className="text-xs mt-1 opacity-50">Choisis un template et clique sur Créer</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Music Panel (ACE-Step 1.5) ──────────────────────────────────────────────

const MUSIC_GENRES = [
  { value: "electronic", label: "Electronic" }, { value: "pop", label: "Pop" },
  { value: "hip-hop", label: "Hip-Hop" }, { value: "rock", label: "Rock" },
  { value: "jazz", label: "Jazz" }, { value: "ambient", label: "Ambient" },
  { value: "classical", label: "Classique" }, { value: "rnb", label: "R&B" },
  { value: "lofi", label: "Lo-Fi" }, { value: "cinematic", label: "Cinématique" },
  { value: "trap", label: "Trap" }, { value: "house", label: "House" },
];

const MUSIC_MOODS = [
  { value: "energetic", label: "Energique" }, { value: "calm", label: "Calme" },
  { value: "melancholic", label: "Mélancolique" }, { value: "festive", label: "Festif" },
  { value: "dramatic", label: "Dramatique" }, { value: "romantic", label: "Romantique" },
  { value: "mysterious", label: "Mystérieux" }, { value: "uplifting", label: "Motivant" },
];

const MUSIC_DURATIONS = [
  { value: "15", label: "15s", hint: "Reel" },
  { value: "30", label: "30s", hint: "Short" },
  { value: "60", label: "1 min", hint: "Track" },
  { value: "90", label: "1m30", hint: "Long" },
];

const MUSIC_LOADING_STEPS = [
  { label: "Analyse du prompt", detail: "Compréhension musicale…" },
  { label: "Génération de la structure", detail: "Accords & mélodie…" },
  { label: "Synthèse ACE-Step 1.5", detail: "Diffusion audio GPU…" },
  { label: "Mixage & mastering", detail: "Normalisation…" },
  { label: "Export final", detail: "Encodage MP3…" },
];

function MusicPanel({ nexusConfigured }: { nexusConfigured: boolean }) {
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState("electronic");
  const [mood, setMood] = useState("energetic");
  const [duration, setDuration] = useState("30");
  const [vocal, setVocal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<NexusJob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadingStepIdx, setLoadingStepIdx] = useState(0);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => {
    return () => {
      stopPoll();
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, [stopPoll]);

  async function pollJob(jobId: string) {
    try {
      const data = await apiFetch<NexusJob>(`/nexus/jobs/${jobId}`);
      setJob(data);
      if (data.status === "done") {
        stopPoll();
        if (progressTimer.current) clearInterval(progressTimer.current);
        setLoadingProgress(100);
        setLoading(false);
        if (data.resultBase64 && data.resultMime) {
          setAudioUrl(`data:${data.resultMime};base64,${data.resultBase64}`);
        }
      } else if (data.status === "failed") {
        stopPoll();
        if (progressTimer.current) clearInterval(progressTimer.current);
        setLoading(false);
        setError(data.error ?? "Génération échouée.");
      }
    } catch {
      // Keep polling on transient network errors.
    }
  }

  async function generate() {
    const p = prompt.trim();
    if (!p || loading) return;
    setError(null);
    setLoading(true);
    setJob(null);
    setAudioUrl(null);
    setLoadingProgress(0);
    setLoadingStepIdx(0);

    // Start progress animation.
    const totalMs = 60_000;
    const tickMs = 500;
    const totalTicks = totalMs / tickMs;
    let tick = 0;
    progressTimer.current = setInterval(() => {
      tick++;
      const pct = Math.min(92, (tick / totalTicks) * 100);
      setLoadingProgress(pct);
      setLoadingStepIdx(Math.min(MUSIC_LOADING_STEPS.length - 1, Math.floor((pct / 100) * MUSIC_LOADING_STEPS.length)));
    }, tickMs);

    try {
      const res = await apiFetch<{ jobId: string }>("/nexus/music/generate", {
        method: "POST",
        body: JSON.stringify({ prompt: p, genre, mood, duration: Number(duration), vocal }),
      });
      // Start polling.
      pollRef.current = setInterval(() => pollJob(res.jobId), 3000);
      // Poll immediately.
      await pollJob(res.jobId);
    } catch (e) {
      if (progressTimer.current) clearInterval(progressTimer.current);
      setLoading(false);
      setError(e instanceof Error ? e.message : "Génération impossible.");
    }
  }

  const MUSIC_EXAMPLES = [
    "Musique d'intro épique pour vidéo corporate, montée progressive, orchestral moderne",
    "Beat lo-fi relaxant pour fond de travail, piano doux, crépitement vinyle",
    "Hymne festif pour lancement produit, cuivres, cordes, rythme entraînant",
  ];

  const canGenerate = prompt.trim().length > 0;

  return (
    <div className="space-y-4">
      {/* ACE-Step badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full font-medium border ${
          nexusConfigured
            ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
            : "bg-muted/60 text-muted-foreground border-border/40"
        }`}>
          <Radio className="w-3 h-3" />
          ACE-Step 1.5 {nexusConfigured ? "— GPU actif" : "— GPU optionnel"}
        </div>
        {!nexusConfigured && (
          <span className="text-[10px] text-muted-foreground">
            Définissez NEXUS_AI_URL pour activer la génération musicale GPU.
          </span>
        )}
      </div>

      {/* Info card si non configuré */}
      {!nexusConfigured && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">Worker NexusAI non connecté</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Les jobs sont enregistrés et resteront en file d'attente. Configurez{" "}
              <code className="font-mono bg-muted/60 px-1 rounded">NEXUS_AI_URL</code>{" "}
              dans les variables d'environnement Railway pour activer la génération GPU.
            </p>
          </div>
        </div>
      )}

      {/* Step 1 — Prompt */}
      <SectionCard step={1} title="Décris la musique" icon={Type}>
        <div className="space-y-3">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Décris la musique voulue… ex : musique épique pour intro vidéo, orchestrale, montée progressive"
            rows={3}
            className="resize-none"
            disabled={loading}
          />
          <div className="flex flex-wrap gap-1.5">
            {MUSIC_EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setPrompt(ex)}
                className="text-[11px] px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground hover:bg-muted/40 transition-colors text-left"
              >
                {ex.length > 55 ? ex.slice(0, 55) + "…" : ex}
              </button>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* Step 2 — Genre */}
      <SectionCard step={2} title="Genre musical" icon={Music2}>
        <ChoiceGrid
          options={MUSIC_GENRES as { value: string; label: string }[]}
          value={genre}
          onChange={setGenre}
          disabled={loading}
        />
      </SectionCard>

      {/* Step 3 — Mood */}
      <SectionCard step={3} title="Ambiance / Mood" icon={Palette}>
        <ChoiceGrid
          options={MUSIC_MOODS as { value: string; label: string }[]}
          value={mood}
          onChange={setMood}
          disabled={loading}
        />
      </SectionCard>

      {/* Step 4 — Duration + vocal */}
      <SectionCard step={4} title="Durée & Format" icon={Clock}>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Durée</p>
            <div className="flex gap-2 flex-wrap">
              {MUSIC_DURATIONS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDuration(d.value)}
                  disabled={loading}
                  className={`px-4 py-2 rounded-xl border text-sm transition-colors ${
                    duration === d.value
                      ? "border-accent bg-accent/10 font-medium text-foreground"
                      : "border-border/50 text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  <span className="block font-semibold">{d.label}</span>
                  <span className="block text-[10px] opacity-60">{d.hint}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <div
                onClick={() => !loading && setVocal((v) => !v)}
                className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${vocal ? "bg-accent" : "bg-muted"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${vocal ? "translate-x-4" : "translate-x-0"}`} />
              </div>
              <div className="flex items-center gap-1.5">
                {vocal ? <Mic className="w-4 h-4 text-accent" /> : <MicOff className="w-4 h-4 text-muted-foreground" />}
                <span className="text-sm text-foreground">{vocal ? "Avec voix / chant" : "Instrumental uniquement"}</span>
              </div>
            </label>
          </div>
        </div>
      </SectionCard>

      {/* Generate button */}
      <div className="pt-2 flex items-center gap-4 flex-wrap">
        <Button onClick={generate} disabled={loading || !canGenerate} size="lg" className="gap-2 min-w-[200px]">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
          {loading ? "Génération GPU…" : "Générer la musique"}
        </Button>
        <span className="text-xs text-muted-foreground">
          {duration}s · {vocal ? "vocal" : "instrumental"} · {MUSIC_GENRES.find((g) => g.value === genre)?.label} / {MUSIC_MOODS.find((m) => m.value === mood)?.label}
        </span>
      </div>

      {error && <p className="text-sm text-destructive bg-destructive/5 rounded-xl px-4 py-3">{error}</p>}

      {/* Result card */}
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        {audioUrl ? (
          <>
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border/40 bg-blue-500/5">
              <div className="w-5 h-5 rounded-full bg-blue-500/15 flex items-center justify-center">
                <Check className="w-3 h-3 text-blue-500" />
              </div>
              <span className="text-sm font-semibold text-foreground">Musique générée</span>
              <span className="ml-auto text-xs text-muted-foreground">ACE-Step 1.5 · {duration}s</span>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/20 border border-border/40">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Music2 className="w-5 h-5 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{prompt.slice(0, 60)}…</p>
                  <p className="text-xs text-muted-foreground">{MUSIC_GENRES.find((g) => g.value === genre)?.label} · {MUSIC_MOODS.find((m) => m.value === mood)?.label} · {duration}s</p>
                </div>
              </div>
              <audio ref={audioRef} src={audioUrl} controls className="w-full" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-border/40 bg-muted/10">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Cpu className="w-3.5 h-3.5 text-blue-500" />
                <span>ACE-Step 1.5 · Apache 2.0 · Open Source</span>
              </div>
              <a
                href={audioUrl}
                download={`tams-music-${Date.now()}.mp3`}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-accent transition-colors"
              >
                <Download className="w-4 h-4" /> Télécharger .mp3
              </a>
            </div>
          </>
        ) : loading ? (
          <div className="px-6 py-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400/40" />
                <Music2 className="w-3.5 h-3.5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {MUSIC_LOADING_STEPS[loadingStepIdx]?.label ?? "Traitement…"}
                </p>
                <p className="text-xs text-muted-foreground">{MUSIC_LOADING_STEPS[loadingStepIdx]?.detail ?? ""}</p>
              </div>
              <span className="ml-auto text-xs font-mono text-blue-500 font-semibold">{Math.round(loadingProgress)}%</span>
            </div>
            <div className="w-full h-1.5 bg-muted/40 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${loadingProgress}%` }} />
            </div>
            <div className="space-y-2.5">
              {MUSIC_LOADING_STEPS.map((step, i) => {
                const done = i < loadingStepIdx;
                const active = i === loadingStepIdx;
                return (
                  <div key={i} className={`flex items-center gap-3 text-sm transition-opacity ${done || active ? "opacity-100" : "opacity-30"}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border transition-colors ${
                      done ? "bg-emerald-500/15 border-emerald-500/40" : active ? "bg-blue-500/15 border-blue-500/40" : "border-border/40"}`}>
                      {done ? <Check className="w-3 h-3 text-emerald-500" />
                        : active ? <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                        : <div className="w-2 h-2 rounded-full bg-muted-foreground/20" />}
                    </div>
                    <span className={done ? "line-through text-muted-foreground" : active ? "text-foreground font-medium" : "text-muted-foreground"}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
            {job && (
              <p className="text-[10px] text-muted-foreground text-center font-mono">
                Job {job.id.slice(0, 8)}… · statut: {job.status}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-blue-500/5 border border-blue-500/10 flex items-center justify-center mb-4">
              <Music2 className="w-7 h-7 text-blue-400/40" />
            </div>
            <p className="text-sm font-medium text-foreground/60">Ta musique apparaîtra ici</p>
            <p className="text-xs mt-1 opacity-50">ACE-Step 1.5 · Génération GPU · Apache 2.0</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Studio root ─────────────────────────────────────────────────────────────

export default function Studio() {
  const [tab, setTab] = useState<"image" | "video" | "music">("video");
  const [nexusStatus, setNexusStatus] = useState<NexusStatus | null>(null);

  useEffect(() => {
    apiFetch<NexusStatus>("/nexus/status")
      .then(setNexusStatus)
      .catch(() => setNexusStatus({ configured: false, models: { video: { available: false }, music: { available: false } } }));
  }, []);

  const nexusConfigured = nexusStatus?.configured ?? false;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-8 pb-24 md:pb-8">
      <PageHeader
        icon={Wand2}
        title="Studio IA"
        subtitle="Image · Vidéo Pro · Musique IA — Stack NexusAI 2026"
        className="mb-6"
      />

      <div className="inline-flex rounded-xl border border-border/60 p-0.5 mb-6 bg-muted/20">
        <button
          onClick={() => setTab("image")}
          className={`inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg transition-colors ${
            tab === "image" ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-muted/40"
          }`}
        >
          <ImageIcon className="w-4 h-4" /> Image IA
        </button>
        <button
          onClick={() => setTab("video")}
          className={`inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg transition-colors ${
            tab === "video" ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-muted/40"
          }`}
        >
          <Play className="w-4 h-4" /> Vidéo Pro
        </button>
        <button
          onClick={() => setTab("music")}
          className={`inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg transition-colors ${
            tab === "music" ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-muted/40"
          }`}
        >
          <Music2 className="w-4 h-4" /> Musique IA
          {nexusConfigured && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-0.5" />
          )}
        </button>
      </div>

      {tab === "image" && <ImagePanel />}
      {tab === "video" && <VideoPanel nexusConfigured={nexusConfigured} />}
      {tab === "music" && <MusicPanel nexusConfigured={nexusConfigured} />}
    </div>
  );
}
