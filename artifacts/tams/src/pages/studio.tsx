import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Cpu,
  ExternalLink,
  FileVideo,
  Film,
  Image,
  Images,
  Layers,
  Loader2,
  Music,
  Scissors,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

type Tab = "generative" | "edit" | "photos" | "templates" | "results" | "diagnostics";
type GenMode = "image" | "video" | "audio";
type ResultType = "image" | "video_ia" | "audio" | "montage" | "photos_video";
type Status = "success" | "error" | "running";
type StudioFormat = "9:16" | "1:1" | "16:9";
type Badge = "fallback" | "premium" | "montage" | "erreur" | "running";

type StudioResult = {
  id: string;
  type: ResultType;
  title: string;
  prompt?: string;
  status: Status;
  url?: string;
  error?: string;
  duration?: string;
  format?: StudioFormat;
  engine?: string;
  provider?: string;
  badge: Badge;
  content?: string;
  createdAt: string;
};

type UploadedAsset = {
  id: string;
  type: "video" | "image" | "audio";
  url: string;
  filename: string;
  bytes: number;
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
  status: "connected" | "missing_config" | "configured_unverified" | "failed";
  env: string | null;
  endpointConfigured: boolean;
  note: string;
  verified?: boolean;
  latency?: number;
};

type WorkersState = {
  status: "idle" | "loading" | "loaded" | "error";
  workers: WorkerStatus[];
  n8n: { configured: boolean; status: string; verified?: boolean; latency?: number } | null;
};

const STORAGE_KEY = "tams-studio-additive-results-v3";
const UPLOAD_STORAGE_KEY = "tams-studio-additive-uploads-v1";

const tabs: Array<{ id: Tab; label: string; icon: typeof Sparkles }> = [
  { id: "generative", label: "IA Générative", icon: Sparkles },
  { id: "edit", label: "Montage vidéo", icon: Scissors },
  { id: "photos", label: "Photos → Vidéo", icon: Images },
  { id: "templates", label: "Templates", icon: Layers },
  { id: "results", label: "Résultats", icon: FileVideo },
  { id: "diagnostics", label: "Diagnostics avancés", icon: Activity },
];

const templates = [
  {
    id: "tiktok-product",
    name: "TikTok produit",
    prompt: "Vidéo TikTok naturelle pour présenter un ensemble activewear femme, plans proches du tissu, essayage, mouvement, bénéfice confort, appel à l'action discret.",
    format: "9:16" as StudioFormat,
    duration: "30s",
    style: "UGC",
    objective: "vendre",
    overlay: "Confort + maintien pour tes séances",
  },
  {
    id: "ugc-natural",
    name: "UGC naturel",
    prompt: "Vidéo UGC réaliste comme filmée au téléphone, femme qui découvre un legging sport, parle du confort, de la taille haute et du look quotidien.",
    format: "9:16" as StudioFormat,
    duration: "30s",
    style: "naturel",
    objective: "pub TikTok",
    overlay: "Je ne pensais pas autant l'aimer",
  },
  {
    id: "activewear-women",
    name: "Activewear femme",
    prompt: "Vidéo premium activewear femme, plans sport doux, marche, salle de sport, détails matière, silhouette élégante, ambiance e-commerce française.",
    format: "9:16" as StudioFormat,
    duration: "60s",
    style: "sport",
    objective: "présenter",
    overlay: "Bouger librement, rester élégante",
  },
  {
    id: "shopify-promo",
    name: "Promo Shopify",
    prompt: "Vidéo courte pour boutique Shopify activewear, montrer produit, bénéfice, livraison offerte, paiement sécurisé, ton crédible sans promesse exagérée.",
    format: "9:16" as StudioFormat,
    duration: "15s",
    style: "e-commerce",
    objective: "vendre",
    overlay: "Nouvelle collection disponible",
  },
  {
    id: "before-after",
    name: "Avant / après",
    prompt: "Vidéo avant après : tenue basique puis ensemble activewear premium, transformation look sport chic, naturel, sans exagération.",
    format: "9:16" as StudioFormat,
    duration: "30s",
    style: "premium",
    objective: "story",
    overlay: "Avant / après tenue sport",
  },
  {
    id: "demo-product",
    name: "Démo produit",
    prompt: "Démo produit activewear : élasticité, taille haute, squat proof visuel non médical, confort, détail coutures, usage sport et quotidien.",
    format: "9:16" as StudioFormat,
    duration: "60s",
    style: "e-commerce",
    objective: "présenter",
    overlay: "Détails qui changent tout",
  },
  {
    id: "brand-story",
    name: "Storytelling marque",
    prompt: "Storytelling de marque KORE activewear : vraie vie, confiance, mouvement, femme active, simplicité premium, ton sincère et moderne.",
    format: "9:16" as StudioFormat,
    duration: "60s",
    style: "premium",
    objective: "story",
    overlay: "Des essentiels conçus pour la vraie vie",
  },
];

function loadResults(): StudioResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveResults(results: StudioResult[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(results.slice(0, 100)));
}

function loadUploads() {
  try {
    const raw = localStorage.getItem(UPLOAD_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : { videos: [], photos: [], audios: [] };
    return {
      videos: Array.isArray(parsed.videos) ? parsed.videos as UploadedAsset[] : [],
      photos: Array.isArray(parsed.photos) ? parsed.photos as UploadedAsset[] : [],
      audios: Array.isArray(parsed.audios) ? parsed.audios as UploadedAsset[] : [],
    };
  } catch {
    return { videos: [] as UploadedAsset[], photos: [] as UploadedAsset[], audios: [] as UploadedAsset[] };
  }
}

function absoluteUrl(url?: string) {
  if (!url) return undefined;
  if (/^https?:\/\//.test(url) || url.startsWith("data:")) return url;
  return `${API_BASE}${url}`;
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

async function postJson(path: string, body: Record<string, unknown>, allowError = false) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && !allowError) {
    const detail = data?.detail || data?.hint || data?.error || `HTTP ${response.status}`;
    throw new Error(String(detail));
  }
  return data as Record<string, unknown>;
}

async function uploadForm(files: FileList | File[]) {
  const form = new FormData();
  Array.from(files).forEach(file => form.append("files", file));
  const response = await fetch(`${API_BASE}/api/studio/upload`, { method: "POST", body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data.error || `HTTP ${response.status}`));
  return data as { ok: boolean; files?: UploadedAsset[]; error?: string };
}

function getWorkerStatusDisplay(status: string, verified?: boolean) {
  if (status === "connected" && verified === true) {
    return { icon: Wifi, className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", label: "Connecté" };
  }
  if (status === "connected" || status === "configured_unverified") {
    return { icon: WifiOff, className: "border-amber-500/30 bg-amber-500/10 text-amber-400", label: "Non vérifié" };
  }
  if (status === "failed") {
    return { icon: WifiOff, className: "border-red-500/30 bg-red-500/10 text-red-400", label: "Échec" };
  }
  return { icon: WifiOff, className: "border-white/10 bg-white/5 text-muted-foreground", label: "Non configuré" };
}

function formatBytes(bytes: number) {
  if (bytes > 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} Mo`;
  if (bytes > 1_000) return `${Math.round(bytes / 1_000)} Ko`;
  return `${bytes} o`;
}

function resultMediaKind(type: ResultType) {
  if (type === "image") return "image";
  if (type === "audio") return "audio";
  return "video";
}

function renderMedia(result: StudioResult) {
  const url = absoluteUrl(result.url);
  if (!url) return null;
  const kind = resultMediaKind(result.type);
  if (kind === "image") {
    return <img src={url} alt={result.title} className="w-full rounded-2xl border border-white/10 bg-black/20 object-contain max-h-[420px]" />;
  }
  if (kind === "video") {
    return <video controls src={url} className="w-full rounded-2xl border border-white/10 bg-black max-h-[520px]" />;
  }
  return <audio controls src={url} className="w-full" />;
}

export default function Studio() {
  const uploads = useMemo(loadUploads, []);
  const [activeTab, setActiveTab] = useState<Tab>("generative");
  const [genMode, setGenMode] = useState<GenMode>("video");
  const [prompt, setPrompt] = useState("génère une vidéo TikTok naturelle pour ma boutique activewear femme");
  const [format, setFormat] = useState<StudioFormat>("9:16");
  const [imageStyle, setImageStyle] = useState("photorealistic");
  const [videoDuration, setVideoDuration] = useState("30s");
  const [videoStyle, setVideoStyle] = useState("UGC");
  const [videoObjective, setVideoObjective] = useState("vendre");
  const [audioType, setAudioType] = useState("musique");
  const [audioDuration, setAudioDuration] = useState("60s");
  const [busy, setBusy] = useState<string | null>(null);
  const [activeError, setActiveError] = useState<string | null>(null);
  const [results, setResults] = useState<StudioResult[]>(loadResults);
  const [videos, setVideos] = useState<UploadedAsset[]>(uploads.videos);
  const [photos, setPhotos] = useState<UploadedAsset[]>(uploads.photos);
  const [audios, setAudios] = useState<UploadedAsset[]>(uploads.audios);
  const [editFormat, setEditFormat] = useState<StudioFormat>("9:16");
  const [editOverlay, setEditOverlay] = useState("Nouveau drop activewear");
  const [trimStart, setTrimStart] = useState("0");
  const [trimEnd, setTrimEnd] = useState("");
  const [editMusicId, setEditMusicId] = useState("");
  const [photoFormat, setPhotoFormat] = useState<StudioFormat>("9:16");
  const [secondsPerPhoto, setSecondsPerPhoto] = useState("2.5");
  const [photoOverlay, setPhotoOverlay] = useState("Nouvelle collection");
  const [photoMusicId, setPhotoMusicId] = useState("");
  const [selfTest, setSelfTest] = useState<SelfTestState>({ status: "idle" });
  const [workers, setWorkers] = useState<WorkersState>({ status: "idle", workers: [], n8n: null });

  useEffect(() => saveResults(results), [results]);
  useEffect(() => {
    localStorage.setItem(UPLOAD_STORAGE_KEY, JSON.stringify({ videos, photos, audios }));
  }, [videos, photos, audios]);

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
          n8n: n8nStatus ? {
            configured: n8nStatus.configured as boolean,
            status: n8nStatus.status as string,
            verified: n8nStatus.verified as boolean | undefined,
            latency: n8nStatus.latency as number | undefined,
          } : null,
        });
      } catch {
        setWorkers(w => ({ ...w, status: "error" }));
      }
    }
    loadWorkers();
  }, []);

  const sortedResults = useMemo(() => [...results].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [results]);

  function workerFor(kind: GenMode) {
    return workers.workers.find(w => w.kind === kind);
  }

  function premiumMessage(kind: GenMode) {
    const worker = workerFor(kind);
    if (!worker || worker.status === "missing_config") return "Premium non configuré — fallback disponible";
    if (worker.status === "configured_unverified") return "Premium configuré mais non vérifié";
    if (worker.status === "failed") return "Premium configuré mais en échec";
    return "Premium configuré";
  }

  function addResult(result: Omit<StudioResult, "id" | "createdAt">) {
    const item: StudioResult = {
      ...result,
      id: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      createdAt: new Date().toISOString(),
    };
    setResults(prev => [item, ...prev]);
    return item.id;
  }

  function updateResult(id: string, patch: Partial<StudioResult>) {
    setResults(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item));
  }

  async function runSelfTest() {
    setSelfTest({ status: "running", message: "Self-test réel en cours..." });
    try {
      const data = await getJson("/api/_diagnostics/studio-selftest");
      const playable = data.playable as Record<string, unknown> | undefined;
      setSelfTest({
        status: data.verdict === "pass" ? "success" : "error",
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

  async function generateFallback() {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || busy) return;
    setBusy(`fallback-${genMode}`);
    setActiveError(null);
    const type: ResultType = genMode === "video" ? "video_ia" : genMode;
    const pendingId = addResult({
      type,
      title: cleanPrompt.slice(0, 64),
      prompt: cleanPrompt,
      status: "running",
      badge: "running",
      format: genMode === "audio" ? undefined : format,
      duration: genMode === "video" ? videoDuration : genMode === "audio" ? audioDuration : undefined,
      provider: "pending",
    });

    try {
      let data: Record<string, unknown>;
      if (genMode === "video") {
        const durationNumber = Number(videoDuration.replace("s", "")) || 30;
        data = await postJson("/api/studio/generate-video", {
          text: `${cleanPrompt}\nStyle: ${videoStyle}. Objectif: ${videoObjective}. Format: ${format}. Durée cible: ${videoDuration}.`,
          images: [],
          imageCount: 4,
          secondsPerImage: Math.max(1.5, durationNumber / 4),
        });
      } else if (genMode === "audio") {
        if (audioType === "voix off") data = await postJson("/api/studio/tts", { text: cleanPrompt, duration: audioDuration });
        else data = await postJson("/api/studio/generate-music", { prompt: `${cleanPrompt}. Type: ${audioType}. Durée cible: ${audioDuration}.` });
      } else {
        const dims = format === "9:16" ? { width: 720, height: 1280 } : format === "16:9" ? { width: 1280, height: 720 } : { width: 1024, height: 1024 };
        data = await postJson("/api/studio/generate-image", { prompt: `${cleanPrompt}. Style: ${imageStyle}.`, ...dims });
      }

      const url = typeof data.url === "string" ? data.url : undefined;
      if (!url) throw new Error(String(data.error || "Génération sans média réel refusée"));
      updateResult(pendingId, {
        status: "success",
        url,
        badge: Boolean(data.degraded) || data.badge === "fallback" ? "fallback" : "fallback",
        engine: typeof data.engine === "string" ? data.engine : undefined,
        provider: typeof data.provider === "string" ? data.provider : genMode === "image" ? "pollinations" : undefined,
        content: typeof data.honesty === "string" ? data.honesty : typeof data.hint === "string" ? data.hint : undefined,
      });
      setActiveTab("results");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      setActiveError(message);
      updateResult(pendingId, { status: "error", badge: "erreur", error: message, provider: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function generatePremium() {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || busy) return;
    setBusy(`premium-${genMode}`);
    setActiveError(null);
    const type: ResultType = genMode === "video" ? "video_ia" : genMode;
    const pendingId = addResult({
      type,
      title: `Premium — ${cleanPrompt.slice(0, 52)}`,
      prompt: cleanPrompt,
      status: "running",
      badge: "running",
      format: genMode === "audio" ? undefined : format,
      duration: genMode === "video" ? videoDuration : genMode === "audio" ? audioDuration : undefined,
      provider: "premium",
    });

    try {
      const data = await postJson(`/api/studio/premium/${genMode}`, {
        prompt: cleanPrompt,
        format,
        style: genMode === "video" ? videoStyle : genMode === "image" ? imageStyle : audioType,
        duration: genMode === "video" ? videoDuration : audioDuration,
        objective: videoObjective,
      }, true);
      if (data.ok === false || data.missingConfig === true) {
        const message = String(data.error || "Premium non configuré");
        updateResult(pendingId, { status: "error", badge: "erreur", error: message, content: "Premium non configuré — fallback disponible." });
        setActiveError(message);
        return;
      }
      const url = typeof data.url === "string" ? data.url : undefined;
      if (!url) throw new Error("Premium a répondu sans média réel");
      updateResult(pendingId, {
        status: "success",
        url,
        badge: "premium",
        engine: typeof data.engine === "string" ? data.engine : `premium_${genMode}`,
        provider: typeof data.provider === "string" ? data.provider : "premium",
      });
      setActiveTab("results");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur premium inconnue";
      updateResult(pendingId, { status: "error", badge: "erreur", error: message });
      setActiveError(message);
    } finally {
      setBusy(null);
    }
  }

  async function handleUpload(files: FileList | null, target: "video" | "image" | "audio") {
    if (!files || files.length === 0) return;
    setBusy(`upload-${target}`);
    setActiveError(null);
    try {
      const data = await uploadForm(files);
      const uploaded = data.files || [];
      if (target === "video") setVideos(prev => [...prev, ...uploaded.filter(file => file.type === "video")]);
      if (target === "image") setPhotos(prev => [...prev, ...uploaded.filter(file => file.type === "image")]);
      if (target === "audio") setAudios(prev => [...prev, ...uploaded.filter(file => file.type === "audio")]);
    } catch (error) {
      setActiveError(error instanceof Error ? error.message : "Upload échoué");
    } finally {
      setBusy(null);
    }
  }

  async function renderEdit() {
    if (videos.length === 0 || busy) {
      setActiveError("Ajoute au moins une vidéo téléphone avant le montage.");
      return;
    }
    setBusy("render-edit");
    setActiveError(null);
    const pendingId = addResult({
      type: "montage",
      title: "Montage depuis mes vidéos",
      prompt: editOverlay,
      status: "running",
      badge: "running",
      format: editFormat,
      provider: "local_ffmpeg",
    });
    try {
      const data = await postJson("/api/studio/render-edit", {
        clipIds: videos.map(video => video.id),
        format: editFormat,
        trimStart: Number(trimStart) || 0,
        trimEnd: Number(trimEnd) || 0,
        overlayText: editOverlay,
        musicId: editMusicId || undefined,
      });
      const url = typeof data.url === "string" ? data.url : undefined;
      if (!url) throw new Error("Montage sans MP4 réel refusé");
      updateResult(pendingId, {
        status: "success",
        url,
        badge: "montage",
        engine: typeof data.engine === "string" ? data.engine : "ffmpeg_edit",
        provider: typeof data.provider === "string" ? data.provider : "local_ffmpeg",
      });
      setActiveTab("results");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Montage échoué";
      setActiveError(message);
      updateResult(pendingId, { status: "error", badge: "erreur", error: message });
    } finally {
      setBusy(null);
    }
  }

  async function renderPhotos() {
    if (photos.length === 0 || busy) {
      setActiveError("Ajoute au moins une photo avant de créer la vidéo.");
      return;
    }
    setBusy("render-photos");
    setActiveError(null);
    const pendingId = addResult({
      type: "photos_video",
      title: "Vidéo depuis mes photos",
      prompt: photoOverlay,
      status: "running",
      badge: "running",
      format: photoFormat,
      duration: `${photos.length} × ${secondsPerPhoto}s`,
      provider: "local_ffmpeg",
    });
    try {
      const data = await postJson("/api/studio/render-photo-video", {
        imageIds: photos.map(photo => photo.id),
        format: photoFormat,
        secondsPerPhoto: Number(secondsPerPhoto) || 2.5,
        overlayText: photoOverlay,
        musicId: photoMusicId || undefined,
      });
      const url = typeof data.url === "string" ? data.url : undefined;
      if (!url) throw new Error("Vidéo photos sans MP4 réel refusée");
      updateResult(pendingId, {
        status: "success",
        url,
        badge: "montage",
        engine: typeof data.engine === "string" ? data.engine : "ffmpeg_photo_video",
        provider: typeof data.provider === "string" ? data.provider : "local_ffmpeg",
      });
      setActiveTab("results");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Vidéo photos échouée";
      setActiveError(message);
      updateResult(pendingId, { status: "error", badge: "erreur", error: message });
    } finally {
      setBusy(null);
    }
  }

  function applyTemplate(template: typeof templates[number]) {
    setPrompt(template.prompt);
    setFormat(template.format);
    setVideoDuration(template.duration);
    setVideoStyle(template.style);
    setVideoObjective(template.objective);
    setEditOverlay(template.overlay);
    setPhotoOverlay(template.overlay);
    setGenMode("video");
    setActiveTab("generative");
  }

  function deleteResult(id: string) {
    setResults(prev => prev.filter(item => item.id !== id));
  }

  function clearResults() {
    setResults([]);
    localStorage.removeItem(STORAGE_KEY);
  }

  function copyResultUrl(url?: string) {
    const full = absoluteUrl(url);
    if (full) void navigator.clipboard?.writeText(full);
  }

  const fieldClass = "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-primary/50";
  const buttonClass = "inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold disabled:opacity-50";

  return (
    <div className="flex-1 overflow-y-auto bg-background pb-24">
      <div className="max-w-6xl mx-auto px-4 py-5 space-y-5">
        <header className="rounded-3xl border border-white/10 bg-card p-5 space-y-3">
          <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold">Studio additif</p>
          <h1 className="text-2xl md:text-3xl font-semibold">Créer, monter et exporter sans perdre l’existant</h1>
          <p className="text-sm text-muted-foreground">
            IA, montage, photos, templates et résultats sont séparés en modules. Les diagnostics sont rangés dans l’onglet avancé.
          </p>
        </header>

        <nav className="overflow-x-auto rounded-3xl border border-white/10 bg-card p-2">
          <div className="flex min-w-max gap-2">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-all",
                    activeTab === tab.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </nav>

        {activeError && (
          <div className="flex gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{activeError}</span>
          </div>
        )}

        {activeTab === "generative" && (
          <section className="rounded-3xl border border-white/10 bg-card p-5 space-y-5">
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "image" as const, label: "Image IA", icon: Image },
                { id: "video" as const, label: "Vidéo IA", icon: Film },
                { id: "audio" as const, label: "Audio IA", icon: Music },
              ].map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setGenMode(item.id)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-medium transition-all",
                      genMode === item.id ? "border-primary bg-primary/15 text-primary" : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{item.label}</span>
                    <span className="sm:hidden">{item.label.split(" ")[0]}</span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Prompt</label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                rows={5}
                className={fieldClass}
                placeholder="Décris ce que tu veux générer..."
              />
            </div>

            {genMode === "image" && (
              <div className="grid md:grid-cols-2 gap-3">
                <label className="space-y-2 text-sm font-medium">Format
                  <select value={format} onChange={e => setFormat(e.target.value as StudioFormat)} className={fieldClass}>
                    <option value="9:16">9:16 vertical</option>
                    <option value="1:1">1:1 carré</option>
                    <option value="16:9">16:9 horizontal</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm font-medium">Style
                  <select value={imageStyle} onChange={e => setImageStyle(e.target.value)} className={fieldClass}>
                    <option value="photorealistic">Photorealistic</option>
                    <option value="premium e-commerce">Premium e-commerce</option>
                    <option value="UGC naturel">UGC naturel</option>
                    <option value="sport lifestyle">Sport lifestyle</option>
                  </select>
                </label>
              </div>
            )}

            {genMode === "video" && (
              <div className="grid md:grid-cols-4 gap-3">
                <label className="space-y-2 text-sm font-medium">Format
                  <select value={format} onChange={e => setFormat(e.target.value as StudioFormat)} className={fieldClass}>
                    <option value="9:16">9:16 TikTok/Reels</option>
                    <option value="1:1">1:1 carré</option>
                    <option value="16:9">16:9 horizontal</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm font-medium">Durée
                  <select value={videoDuration} onChange={e => setVideoDuration(e.target.value)} className={fieldClass}>
                    {['15s', '30s', '60s', '90s', '120s', 'personnalisé'].map(value => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-sm font-medium">Style
                  <select value={videoStyle} onChange={e => setVideoStyle(e.target.value)} className={fieldClass}>
                    {['naturel', 'UGC', 'premium', 'e-commerce', 'sport'].map(value => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-sm font-medium">Objectif
                  <select value={videoObjective} onChange={e => setVideoObjective(e.target.value)} className={fieldClass}>
                    {['vendre', 'présenter', 'story', 'pub TikTok'].map(value => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              </div>
            )}

            {genMode === "audio" && (
              <div className="grid md:grid-cols-2 gap-3">
                <label className="space-y-2 text-sm font-medium">Type
                  <select value={audioType} onChange={e => setAudioType(e.target.value)} className={fieldClass}>
                    {['musique', 'voix off', 'ambiance', 'effet sonore'].map(value => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-sm font-medium">Durée
                  <select value={audioDuration} onChange={e => setAudioDuration(e.target.value)} className={fieldClass}>
                    {['15s', '30s', '60s', '120s', '180s'].map(value => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              </div>
            )}

            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-200">
              {premiumMessage(genMode)}. Le fallback reste disponible et n’est jamais présenté comme premium.
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={generateFallback} disabled={!prompt.trim() || Boolean(busy)} className={cn(buttonClass, "bg-primary text-primary-foreground")}>
                {busy?.startsWith("fallback") ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Générer avec fallback réel
              </button>
              <button onClick={generatePremium} disabled={!prompt.trim() || Boolean(busy)} className={cn(buttonClass, "border border-white/10 bg-white/5 text-foreground hover:bg-white/10")}>
                {busy?.startsWith("premium") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                Générer premium
              </button>
            </div>
          </section>
        )}

        {activeTab === "edit" && (
          <section className="rounded-3xl border border-white/10 bg-card p-5 space-y-5">
            <div>
              <h2 className="text-xl font-semibold">Montage depuis mes vidéos</h2>
              <p className="text-sm text-muted-foreground">Upload téléphone, assemblage, découpe simple, texte overlay, musique optionnelle, export MP4.</p>
            </div>
            <label className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/15 bg-white/5 p-8 text-center cursor-pointer hover:bg-white/10">
              <Upload className="h-8 w-8 text-primary" />
              <span className="font-semibold">Ajouter des vidéos téléphone</span>
              <span className="text-xs text-muted-foreground">MP4, MOV, WEBM — ordre d’upload conservé</span>
              <input className="hidden" type="file" accept="video/mp4,video/quicktime,video/webm" multiple onChange={e => void handleUpload(e.target.files, "video")} />
            </label>
            {videos.length > 0 && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {videos.map((video, index) => (
                  <div key={video.id} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm">
                    <p className="font-medium">Clip {index + 1}</p>
                    <p className="truncate text-xs text-muted-foreground">{video.filename} · {formatBytes(video.bytes)}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="grid md:grid-cols-4 gap-3">
              <label className="space-y-2 text-sm font-medium">Format
                <select value={editFormat} onChange={e => setEditFormat(e.target.value as StudioFormat)} className={fieldClass}>
                  <option value="9:16">9:16 vertical</option>
                  <option value="1:1">1:1 carré</option>
                  <option value="16:9">16:9 horizontal</option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium">Couper début
                <input value={trimStart} onChange={e => setTrimStart(e.target.value)} inputMode="decimal" className={fieldClass} placeholder="0" />
              </label>
              <label className="space-y-2 text-sm font-medium">Fin à garder
                <input value={trimEnd} onChange={e => setTrimEnd(e.target.value)} inputMode="decimal" className={fieldClass} placeholder="vide = tout" />
              </label>
              <label className="space-y-2 text-sm font-medium">Musique optionnelle
                <select value={editMusicId} onChange={e => setEditMusicId(e.target.value)} className={fieldClass}>
                  <option value="">Aucune</option>
                  {audios.map(audio => <option key={audio.id} value={audio.id}>{audio.filename}</option>)}
                </select>
              </label>
            </div>
            <label className="space-y-2 text-sm font-medium block">Texte overlay
              <input value={editOverlay} onChange={e => setEditOverlay(e.target.value)} className={fieldClass} />
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={renderEdit} disabled={videos.length === 0 || Boolean(busy)} className={cn(buttonClass, "bg-primary text-primary-foreground")}>
                {busy === "render-edit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
                Exporter MP4
              </button>
              <label className={cn(buttonClass, "border border-white/10 bg-white/5 text-foreground cursor-pointer hover:bg-white/10")}>
                <Music className="h-4 w-4" /> Ajouter audio
                <input className="hidden" type="file" accept="audio/*" onChange={e => void handleUpload(e.target.files, "audio")} />
              </label>
            </div>
          </section>
        )}

        {activeTab === "photos" && (
          <section className="rounded-3xl border border-white/10 bg-card p-5 space-y-5">
            <div>
              <h2 className="text-xl font-semibold">Vidéo depuis mes photos</h2>
              <p className="text-sm text-muted-foreground">Plusieurs photos, ordre conservé, durée par photo, transition simple, texte overlay, export MP4.</p>
            </div>
            <label className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/15 bg-white/5 p-8 text-center cursor-pointer hover:bg-white/10">
              <Images className="h-8 w-8 text-primary" />
              <span className="font-semibold">Ajouter des photos</span>
              <span className="text-xs text-muted-foreground">JPG, PNG, WEBP — l’ordre sélectionné est conservé</span>
              <input className="hidden" type="file" accept="image/*" multiple onChange={e => void handleUpload(e.target.files, "image")} />
            </label>
            {photos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {photos.map((photo, index) => (
                  <div key={photo.id} className="rounded-2xl border border-white/10 bg-white/5 p-2 text-xs">
                    <img src={absoluteUrl(photo.url)} alt={photo.filename} className="aspect-square w-full rounded-xl object-cover bg-black/20" />
                    <p className="mt-2 truncate">{index + 1}. {photo.filename}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="grid md:grid-cols-4 gap-3">
              <label className="space-y-2 text-sm font-medium">Format
                <select value={photoFormat} onChange={e => setPhotoFormat(e.target.value as StudioFormat)} className={fieldClass}>
                  <option value="9:16">9:16 vertical</option>
                  <option value="1:1">1:1 carré</option>
                  <option value="16:9">16:9 horizontal</option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium">Durée par photo
                <input value={secondsPerPhoto} onChange={e => setSecondsPerPhoto(e.target.value)} inputMode="decimal" className={fieldClass} />
              </label>
              <label className="space-y-2 text-sm font-medium md:col-span-2">Musique optionnelle
                <select value={photoMusicId} onChange={e => setPhotoMusicId(e.target.value)} className={fieldClass}>
                  <option value="">Aucune</option>
                  {audios.map(audio => <option key={audio.id} value={audio.id}>{audio.filename}</option>)}
                </select>
              </label>
            </div>
            <label className="space-y-2 text-sm font-medium block">Texte overlay
              <input value={photoOverlay} onChange={e => setPhotoOverlay(e.target.value)} className={fieldClass} />
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={renderPhotos} disabled={photos.length === 0 || Boolean(busy)} className={cn(buttonClass, "bg-primary text-primary-foreground")}>
                {busy === "render-photos" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
                Créer vidéo MP4
              </button>
              <label className={cn(buttonClass, "border border-white/10 bg-white/5 text-foreground cursor-pointer hover:bg-white/10")}>
                <Music className="h-4 w-4" /> Ajouter audio
                <input className="hidden" type="file" accept="audio/*" onChange={e => void handleUpload(e.target.files, "audio")} />
              </label>
            </div>
          </section>
        )}

        {activeTab === "templates" && (
          <section className="rounded-3xl border border-white/10 bg-card p-5 space-y-5">
            <div>
              <h2 className="text-xl font-semibold">Templates TikTok / Reels / Shopify</h2>
              <p className="text-sm text-muted-foreground">Un template pré-remplit les champs. Rien n’est généré sans validation.</p>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {templates.map(template => (
                <article key={template.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{template.name}</h3>
                      <p className="text-xs text-muted-foreground">{template.format} · {template.duration} · {template.style} · {template.objective}</p>
                    </div>
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] text-primary">template</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{template.prompt}</p>
                  <p className="rounded-xl bg-white/5 p-3 text-xs text-muted-foreground">Overlay suggéré : {template.overlay}</p>
                  <button onClick={() => applyTemplate(template)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/5">
                    <Sparkles className="h-3.5 w-3.5" /> Utiliser ce template
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === "results" && (
          <section className="rounded-3xl border border-white/10 bg-card p-5 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Résultats centralisés</h2>
                <p className="text-sm text-muted-foreground">Aucune carte success sans média : un résultat doit afficher un fichier réel ou une erreur claire.</p>
              </div>
              {results.length > 0 && (
                <button onClick={clearResults} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                  <Trash2 className="h-3.5 w-3.5" /> Nettoyer
                </button>
              )}
            </div>
            {sortedResults.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-muted-foreground">Aucun résultat pour l’instant.</div>
            ) : (
              <div className="grid gap-4">
                {sortedResults.map(result => {
                  const url = absoluteUrl(result.url);
                  return (
                    <article key={result.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">{result.title}</h3>
                          <p className="text-xs text-muted-foreground">{new Date(result.createdAt).toLocaleString("fr-FR")}</p>
                        </div>
                        <span className={cn(
                          "rounded-full px-2 py-1 text-[10px] font-medium",
                          result.badge === "premium" ? "bg-purple-500/10 text-purple-300" : result.badge === "montage" ? "bg-blue-500/10 text-blue-300" : result.badge === "erreur" ? "bg-red-500/10 text-red-300" : "bg-amber-500/10 text-amber-300",
                        )}>{result.badge}</span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs text-muted-foreground">
                        <span>Type : {result.type}</span>
                        {result.format && <span>Format : {result.format}</span>}
                        {result.duration && <span>Durée : {result.duration}</span>}
                        {result.engine && <span>Engine : {result.engine}</span>}
                        {result.provider && <span>Provider : {result.provider}</span>}
                      </div>

                      {result.prompt && <p className="rounded-xl bg-white/5 p-3 text-xs text-muted-foreground">{result.prompt}</p>}
                      {result.status === "running" && <div className="text-sm text-muted-foreground">Génération en cours...</div>}
                      {result.status === "error" && <div className="text-sm text-red-200">{result.error}</div>}
                      {result.status === "success" && url && renderMedia(result)}
                      {result.status === "success" && !url && <div className="text-sm text-red-200">Résultat refusé : aucun média réel.</div>}
                      {result.content && <p className="rounded-xl bg-white/5 p-3 text-xs text-muted-foreground">{result.content}</p>}

                      <div className="flex flex-wrap gap-2">
                        {url && <button onClick={() => copyResultUrl(result.url)} className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs hover:bg-white/5"><Copy className="h-3 w-3" /> Copier URL</button>}
                        {url && <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs hover:bg-white/5"><ExternalLink className="h-3 w-3" /> Ouvrir</a>}
                        <button onClick={() => deleteResult(result.id)} className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs text-red-200 hover:bg-red-500/10"><Trash2 className="h-3 w-3" /> Supprimer</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {activeTab === "diagnostics" && (
          <section className="space-y-5">
            {workers.status === "loaded" && (
              <div className="rounded-3xl border border-white/10 bg-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Cpu className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">Workers / premium / n8n</h2>
                  <span className="text-xs text-muted-foreground">avancé</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
                  {workers.workers.map(w => {
                    const display = getWorkerStatusDisplay(w.status, w.verified);
                    const Icon = display.icon;
                    return (
                      <div key={w.id} className={cn("rounded-xl border p-3 text-sm", display.className)}>
                        <div className="flex items-center gap-2 mb-1"><Icon className="h-4 w-4" /><span className="font-medium capitalize">{w.kind}</span></div>
                        <p className="text-xs">{display.label}</p>
                        {w.status === "missing_config" && w.env && <p className="text-[10px] mt-1 opacity-70">Set {w.env}</p>}
                      </div>
                    );
                  })}
                  {workers.n8n && (() => {
                    const display = getWorkerStatusDisplay(workers.n8n.status, workers.n8n.verified);
                    const Icon = display.icon;
                    return (
                      <div className={cn("rounded-xl border p-3 text-sm", display.className)}>
                        <div className="flex items-center gap-2 mb-1"><Icon className="h-4 w-4" /><span className="font-medium">n8n</span></div>
                        <p className="text-xs">{display.label}</p>
                        {workers.n8n.latency && <p className="text-[10px] opacity-70">{workers.n8n.latency}ms</p>}
                      </div>
                    );
                  })()}
                </div>
                <p className="text-xs text-muted-foreground mt-3">Workers absents : TAMS utilise les fallbacks gratuits Pollinations, FFmpeg et WAV local.</p>
              </div>
            )}

            <div className="rounded-3xl border border-white/10 bg-card p-5 space-y-3">
              <h2 className="text-lg font-semibold">Self-test Studio réel</h2>
              <p className="text-sm text-muted-foreground">Teste les vrais endpoints backend sans afficher de faux succès.</p>
              <button onClick={runSelfTest} disabled={selfTest.status === "running"} className={cn(buttonClass, "border border-white/10 bg-white/5 hover:bg-white/10")}>
                {selfTest.status === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                Tester le Studio réel
              </button>
              {selfTest.status !== "idle" && (
                <div className={cn("rounded-2xl border p-3 text-sm", selfTest.status === "error" ? "border-red-500/30 bg-red-500/10 text-red-200" : selfTest.status === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-blue-500/30 bg-blue-500/10 text-blue-200")}>
                  <p>{selfTest.message}</p>
                  {selfTest.status === "success" && (
                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                      {selfTest.videoUrl && <a className="text-primary hover:underline" href={absoluteUrl(selfTest.videoUrl)} target="_blank" rel="noreferrer">Vidéo self-test</a>}
                      {selfTest.audioUrl && <a className="text-primary hover:underline" href={absoluteUrl(selfTest.audioUrl)} target="_blank" rel="noreferrer">Audio self-test</a>}
                      {selfTest.imageUrl && <a className="text-primary hover:underline" href={selfTest.imageUrl} target="_blank" rel="noreferrer">Image self-test</a>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
