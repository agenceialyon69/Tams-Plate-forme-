import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Wand2, Loader2, Download, ImageIcon, Film, Clapperboard,
  Plus, X, Sparkles, ChevronDown, ChevronUp, Music2, Palette,
  Zap, Type, Layers, Settings2, Play, Check,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";

interface GeneratedImage {
  imageBase64: string;
  mimeType: string;
  provider: string;
}

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

const VIDEO_FORMATS = [
  { label: "Story 9:16", value: "9:16", hint: "Reels / TikTok" },
  { label: "Carré 1:1", value: "1:1", hint: "Feed" },
  { label: "Paysage 16:9", value: "16:9", hint: "YouTube" },
];

const TRANSITIONS = [
  { value: "fade",      label: "Fondu" },
  { value: "dissolve",  label: "Dissoudre" },
  { value: "slide",     label: "Glissement" },
  { value: "wipeleft",  label: "Balayage →" },
  { value: "wiperight", label: "Balayage ←" },
  { value: "wipeup",    label: "Balayage ↑" },
  { value: "wipedown",  label: "Balayage ↓" },
  { value: "pixelize",  label: "Pixels" },
  { value: "radial",    label: "Radial" },
  { value: "zoomin",    label: "Zoom avant" },
  { value: "fadeblack", label: "Noir" },
  { value: "fadewhite", label: "Blanc" },
  { value: "circle",    label: "Cercle" },
  { value: "squeezeh",  label: "Compress. H" },
  { value: "none",      label: "Aucune" },
];

const STYLES = [
  { value: "none",    label: "Original", hint: "" },
  { value: "vivid",   label: "Vivid",    hint: "Saturé" },
  { value: "warm",    label: "Warm",     hint: "Chaleureux" },
  { value: "cinema",  label: "Cinéma",   hint: "Contrasté" },
  { value: "bw",      label: "N&B",      hint: "Noir & blanc" },
  { value: "golden",  label: "Golden",   hint: "Doré" },
  { value: "cool",    label: "Cool",     hint: "Froid/Bleu" },
  { value: "matte",   label: "Matte",    hint: "Doux" },
  { value: "vintage", label: "Vintage",  hint: "Rétro" },
  { value: "neon",    label: "Neon",     hint: "Hyper saturé" },
];

const KB_MODES = [
  { value: "zoom-in",   label: "Zoom avant" },
  { value: "zoom-out",  label: "Zoom arrière" },
  { value: "pan-left",  label: "Pan gauche" },
  { value: "pan-right", label: "Pan droit" },
  { value: "diagonal",  label: "Diagonal" },
  { value: "random",    label: "Aléatoire" },
];

const SPEEDS = [
  { value: "slow",   label: "Lent", hint: "+40%" },
  { value: "normal", label: "Normal", hint: "" },
  { value: "fast",   label: "Rapide", hint: "-30%" },
];

const CAP_POS = [
  { value: "bottom", label: "Bas" },
  { value: "top",    label: "Haut" },
  { value: "center", label: "Centre" },
];

const SUB_STYLES = [
  { value: "box",    label: "Box noir" },
  { value: "shadow", label: "Ombre" },
  { value: "clean",  label: "Propre" },
];

interface Photo {
  url: string;
  base64: string;
  caption: string;
}

function VideoPanel() {
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
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<{ videoBase64: string; mimeType: string; durationSec: number } | null>(null);
  const [musicBase64, setMusicBase64] = useState<string | null>(null);
  const [musicName, setMusicName] = useState<string | null>(null);
  const videoRef = useRef<HTMLDivElement>(null);

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
    const slots = 8 - photos.length;
    for (const file of files.slice(0, slots)) {
      if (file.size > 6 * 1024 * 1024) { setError("Photo trop lourde (max 6 Mo)."); continue; }
      const url = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error("read"));
        r.readAsDataURL(file);
      });
      setPhotos((ps) => ps.length >= 8 ? ps : [...ps, { url, base64: url.split(",").pop() ?? "", caption: "" }]);
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
        transition,
        style,
        kenBurns,
        kenBurnsMode,
        speed,
        captionPosition: capPos,
        subtitleStyle: subStyle,
        brand: brand.trim() || undefined,
        intro: introTitle.trim() || introSubtitle.trim()
          ? { title: introTitle, subtitle: introSubtitle }
          : undefined,
        outro: outroTitle.trim() || outroSubtitle.trim()
          ? { title: outroTitle, subtitle: outroSubtitle }
          : undefined,
        logoBase64: logoBase64 ?? undefined,
      };

      let res: { videoBase64: string; mimeType: string; durationSec: number };

      if (mode === "prompt") {
        const p = prompt.trim();
        if (!p) { setLoading(false); return; }
        setLoadingStep(`Génération de ${scenes} visuels IA…`);
        res = await apiFetch("/integrations/video/from-prompt", {
          method: "POST",
          body: JSON.stringify({ prompt: p, scenes, format, musicBase64: musicBase64 ?? undefined, secondsPerImage: seconds, ...fx }),
        });
      } else {
        if (photos.length === 0) { setLoading(false); return; }
        setLoadingStep("Assemblage du diaporama…");
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
      setTimeout(() => videoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Création vidéo impossible.");
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  }

  const dataUrl = video ? `data:${video.mimeType};base64,${video.videoBase64}` : null;
  const canGenerate = mode === "prompt" ? prompt.trim().length > 0 : photos.length > 0;

  return (
    <div className="space-y-4">
      {/* Step 1 — Content source */}
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
                placeholder="Décris ta vidéo produit… ex : présentation d'une bougie artisanale, ambiance cosy"
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
                  type="range" min={2} max={6} value={scenes}
                  onChange={(e) => setScenes(Number(e.target.value))}
                  className="w-full sm:w-60 accent-accent" disabled={loading}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {photos.length}/8 photos — ajoute un texte par photo (nom, prix, accroche)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {photos.map((p, i) => (
                  <div key={i} className="flex gap-2 items-start rounded-xl border border-border/50 p-2 bg-background/50">
                    <img src={p.url} alt="" className="w-14 h-14 object-cover rounded-lg shrink-0" />
                    <input
                      type="text"
                      value={p.caption}
                      onChange={(e) => setCaption(i, e.target.value)}
                      placeholder="Texte (ex : Bougie — 19,90€)"
                      maxLength={120}
                      className="flex-1 min-w-0 bg-background border border-border rounded-lg px-2 py-1.5 text-sm"
                      disabled={loading}
                    />
                    <button onClick={() => removePhoto(i)} className="text-muted-foreground hover:text-destructive mt-1.5" title="Retirer">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {photos.length < 8 && (
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
            <div className="grid grid-cols-3 gap-2 max-w-sm">
              {VIDEO_FORMATS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFormat(f.value)}
                  className={`text-left px-3 py-2.5 rounded-xl border transition-colors ${
                    format === f.value ? "border-accent bg-accent/8 shadow-sm" : "border-border/50 hover:bg-muted/40"
                  }`}
                >
                  <span className="block text-sm font-medium text-foreground">{f.label}</span>
                  <span className="block text-[10px] text-muted-foreground mt-0.5">{f.hint}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium text-muted-foreground">Durée par {mode === "prompt" ? "scène" : "photo"}</p>
                <span className="text-xs font-semibold text-foreground bg-muted/50 px-2 py-0.5 rounded">{seconds}s</span>
              </div>
              <input
                type="range" min={1.5} max={5} step={0.5} value={seconds}
                onChange={(e) => setSeconds(Number(e.target.value))}
                className="w-full accent-accent" disabled={loading}
              />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Vitesse globale</p>
              <ChoiceGrid options={SPEEDS} value={speed as "normal"} onChange={setSpeed as (v: "normal") => void} disabled={loading} />
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Step 3 — Style & Effects */}
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
              <div
                onClick={() => setKenBurns((v) => !v)}
                className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${kenBurns ? "bg-accent" : "bg-muted"}`}
              >
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

      {/* Step 4 — Text & Captions */}
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
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Bandeau de marque (haut de la vidéo)</p>
            <input
              type="text" value={brand} onChange={(e) => setBrand(e.target.value)}
              placeholder="@maboutique" maxLength={60} disabled={loading}
              className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Logo (coin haut-droit, optionnel)</p>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-background/40 hover:bg-muted/40 cursor-pointer text-sm text-foreground transition-colors">
              <ImageIcon className="w-4 h-4" />
              {logoName ? `🖼️ ${logoName.slice(0, 24)}` : "Ajouter un logo (png)"}
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
            {logoName && (
              <button onClick={() => { setLogoBase64(null); setLogoName(null); }} className="ml-2 text-xs text-muted-foreground hover:text-destructive">retirer</button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Carte d'intro</p>
              <div className="space-y-1.5">
                <input type="text" value={introTitle} onChange={(e) => setIntroTitle(e.target.value)}
                  placeholder="Titre (ex : MA BOUTIQUE)" maxLength={80} disabled={loading}
                  className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-sm" />
                <input type="text" value={introSubtitle} onChange={(e) => setIntroSubtitle(e.target.value)}
                  placeholder="Sous-titre (ex : Nouvelle collection)" maxLength={100} disabled={loading}
                  className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-sm" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Carte de fin (CTA)</p>
              <div className="space-y-1.5">
                <input type="text" value={outroTitle} onChange={(e) => setOutroTitle(e.target.value)}
                  placeholder="Titre (ex : Commandez maintenant)" maxLength={80} disabled={loading}
                  className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-sm" />
                <input type="text" value={outroSubtitle} onChange={(e) => setOutroSubtitle(e.target.value)}
                  placeholder="Sous-titre (ex : lien en bio)" maxLength={100} disabled={loading}
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
            {musicName ? `🎵 ${musicName.slice(0, 30)}` : "Ajouter un fichier audio (mp3, max 8 Mo)"}
            <input type="file" accept="audio/*" className="hidden" onChange={onMusic} disabled={loading} />
          </label>
          {musicName && (
            <button onClick={() => { setMusicBase64(null); setMusicName(null); }} className="ml-2 text-xs text-muted-foreground hover:text-destructive">
              retirer
            </button>
          )}
          <p className="text-xs text-muted-foreground">La musique est automatiquement tronquée et fondue à la durée de la vidéo.</p>
        </div>
      </SectionCard>

      {/* Generate */}
      <div className="pt-2">
        <Button onClick={generate} disabled={loading || !canGenerate} size="lg" className="w-full sm:w-auto gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clapperboard className="w-4 h-4" />}
          {loading ? (loadingStep || "Création de la vidéo…") : "Créer la vidéo"}
        </Button>
        {loading && (
          <p className="text-xs text-muted-foreground mt-2">
            {mode === "prompt" ? `Génération de ${scenes} visuels puis montage… ~1 min.` : "Assemblage en cours… ~30 s."}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-destructive bg-destructive/5 rounded-xl px-4 py-3">{error}</p>}

      {/* Result */}
      <div ref={videoRef} className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        {dataUrl ? (
          <>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/20">
              <Check className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-medium text-foreground">Vidéo prête</span>
              <span className="text-xs text-muted-foreground ml-auto">{video?.durationSec}s · prête pour Shopify / Reels / TikTok</span>
            </div>
            <video src={dataUrl} controls loop playsInline className="w-full bg-black max-h-[70vh]" />
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/40">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>FFmpeg · 100% gratuit</span>
              </div>
              <a
                href={dataUrl}
                download={`tams-video-${Date.now()}.mp4`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:underline"
              >
                <Download className="w-4 h-4" /> Télécharger
              </a>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            {loading ? (
              <>
                <div className="relative mb-4">
                  <Loader2 className="w-10 h-10 animate-spin opacity-40" />
                  <Zap className="w-4 h-4 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-accent" />
                </div>
                <p className="text-sm font-medium text-foreground">{loadingStep || "Montage en cours…"}</p>
                <p className="text-xs mt-1 opacity-60">FFmpeg assemble ta vidéo</p>
              </>
            ) : (
              <>
                <Film className="w-10 h-10 opacity-20 mb-3" />
                <p className="text-sm">Ta vidéo apparaîtra ici</p>
                <p className="text-xs mt-1 opacity-50">Configure et clique sur Créer</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Studio() {
  const [tab, setTab] = useState<"image" | "video">("video");

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-8 pb-24 md:pb-8">
      <PageHeader
        icon={Wand2}
        title="Studio"
        subtitle="Génère des visuels & vidéos produit premium — 100% gratuit, niveau pro"
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
      </div>

      {tab === "image" ? <ImagePanel /> : <VideoPanel />}
    </div>
  );
}
