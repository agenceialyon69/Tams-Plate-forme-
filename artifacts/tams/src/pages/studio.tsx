import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Film, Music, Loader2, AlertTriangle, CheckCircle2, ExternalLink, Trash2, Activity, Cpu, Wifi, WifiOff, Upload, Play, Scissors, Photos, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

type TabMode = "generate" | "edit" | "photo-video" | "results" | "diagnostics";
type GenMode = "image" | "video" | "audio";
type Status = "success" | "error" | "running";

type UploadedAsset = {
  assetId: string;
  type: "video" | "image" | "audio";
  filename: string;
  sizeBytes: number;
  url: string;
  uploadedAt: string;
};

type StudioResult = {
  id: string;
  type: "generate" | "edit" | "photo-video";
  genMode?: GenMode;
  title: string;
  prompt?: string;
  status: Status;
  url?: string;
  engine?: string;
  degraded?: boolean;
  error?: string;
  format?: string;
  durationSec?: number;
  imageCount?: number;
  note?: string;
  createdAt: string;
};

type WorkerStatus = {
  id: string;
  kind: string;
  status: "connected" | "missing_config" | "configured_unverified" | "failed";
  env: string | null;
  note: string;
  verified?: boolean;
};

type WorkersState = {
  status: "idle" | "loading" | "loaded" | "error";
  workers: WorkerStatus[];
  n8n: { configured: boolean; status: string; verified?: boolean } | null;
};

const STORAGE_KEY = "tams-studio-results-v3";

function loadResults(): StudioResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveResults(results: StudioResult[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(results.slice(0, 100)));
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
  if (!response.ok) throw new Error(String(data?.error || data?.hint || `HTTP ${response.status}`));
  return data as Record<string, unknown>;
}

async function getJson(path: string) {
  const response = await fetch(`${API_BASE}${path}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data?.error || `HTTP ${response.status}`));
  return data as Record<string, unknown>;
}

async function uploadFile(file: File): Promise<UploadedAsset> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE}/api/studio/upload`, { method: "POST", body: formData });
  const data = await response.json();
  if (!response.ok) throw new Error(String(data?.error || "Upload failed"));
  return data as UploadedAsset;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getWorkerStatusDisplay(status: string, verified?: boolean) {
  if (status === "connected" && verified === true) {
    return { icon: Wifi, className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", label: "Connecté" };
  }
  if (status === "failed") {
    return { icon: WifiOff, className: "border-red-500/30 bg-red-500/10 text-red-400", label: "Échec" };
  }
  return { icon: WifiOff, className: "border-white/10 bg-white/5 text-muted-foreground", label: "Non configuré" };
}

export default function Studio() {
  // Tabs
  const [tab, setTab] = useState<TabMode>("generate");
  
  // Generate mode
  const [genMode, setGenMode] = useState<GenMode>("video");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeError, setActiveError] = useState<string | null>(null);
  
  // Results
  const [results, setResults] = useState<StudioResult[]>(loadResults);
  
  // Diagnostics
  const [selfTest, setSelfTest] = useState<{ status: string; message?: string; data?: unknown }>({ status: "idle" });
  const [workers, setWorkers] = useState<WorkersState>({ status: "idle", workers: [], n8n: null });
  
  // Edit mode - video montage
  const [editClips, setEditClips] = useState<{ assetId: string; start: number; end: number }[]>([]);
  const [editAssets, setEditAssets] = useState<UploadedAsset[]>([]);
  const [editFormat, setEditFormat] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [editDuration, setEditDuration] = useState(30);
  const [editText, setEditText] = useState("");
  const [musicAsset, setMusicAsset] = useState<UploadedAsset | null>(null);
  
  // Photo video mode
  const [photos, setPhotos] = useState<UploadedAsset[]>([]);
  const [photoDuration, setPhotoDuration] = useState(3);
  const [photoFormat, setPhotoFormat] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [photoText, setPhotoText] = useState("");
  const [photoMusic, setPhotoMusic] = useState<UploadedAsset | null>(null);
  
  // Refs
  const editFileRef = useRef<HTMLInputElement>(null);
  const photoFileRef = useRef<HTMLInputElement>(null);
  const musicFileRef = useRef<HTMLInputElement>(null);
  const photoMusicRef = useRef<HTMLInputElement>(null);
  
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
      } catch { setWorkers(w => ({ ...w, status: "error" })); }
    }
    loadWorkers();
  }, []);
  
  const currentResults = useMemo(() => results.filter(r => r.type === tab || tab === "results"), [results, tab]);
  
  // Handlers
  async function handleUploadVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setActiveError(null);
    try {
      for (const file of Array.from(files)) {
        const asset = await uploadFile(file);
        setEditAssets(prev => [...prev, asset]);
        setEditClips(prev => [...prev, { assetId: asset.assetId, start: 0, end: 10 }]);
      }
    } catch (err) {
      setActiveError(err instanceof Error ? err.message : "Upload failed");
    }
    if (editFileRef.current) editFileRef.current.value = "";
  }
  
  async function handleUploadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setActiveError(null);
    try {
      for (const file of Array.from(files)) {
        const asset = await uploadFile(file);
        setPhotos(prev => [...prev, asset]);
      }
    } catch (err) {
      setActiveError(err instanceof Error ? err.message : "Upload failed");
    }
    if (photoFileRef.current) photoFileRef.current.value = "";
  }
  
  async function handleUploadMusic(e: React.ChangeEvent<HTMLInputElement>, target: "edit" | "photo") {
    const files = e.target.files;
    if (!files?.length) return;
    try {
      const asset = await uploadFile(files[0]);
      if (target === "edit") setMusicAsset(asset);
      else setPhotoMusic(asset);
    } catch (err) {
      setActiveError(err instanceof Error ? err.message : "Upload failed");
    }
  }
  
  function removeEditAsset(idx: number) {
    const assetId = editClips[idx]?.assetId;
    setEditAssets(prev => prev.filter(a => a.assetId !== assetId));
    setEditClips(prev => prev.filter((_, i) => i !== idx));
  }
  
  function removePhoto(idx: number) {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  }
  
  async function runSelfTest() {
    setSelfTest({ status: "running", message: "Self-test en cours..." });
    try {
      const data = await getJson("/api/_diagnostics/studio-selftest");
      setSelfTest({ status: data.verdict === "pass" ? "success" : "warn", message: `Studio backend: ${data.verdict}`, data });
    } catch (err) {
      setSelfTest({ status: "error", message: err instanceof Error ? err.message : "Self-test failed" });
    }
  }
  
  async function generate() {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || busy) return;
    setBusy(true);
    setActiveError(null);
    
    const pending: StudioResult = {
      id: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      type: "generate",
      genMode,
      title: cleanPrompt.slice(0, 64),
      prompt: cleanPrompt,
      status: "running",
      createdAt: new Date().toISOString(),
    };
    setResults(prev => [pending, ...prev]);
    
    try {
      let data: Record<string, unknown>;
      if (genMode === "video") {
        data = await postJson("/api/studio/generate-video", { text: cleanPrompt, images: [], secondsPerImage: 2.5 });
      } else if (genMode === "audio") {
        data = await postJson("/api/studio/generate-music", { prompt: cleanPrompt });
      } else {
        data = await postJson("/api/studio/generate-image", { prompt: cleanPrompt, width: 1024, height: 1024 });
      }
      
      const url = typeof data.url === "string" ? data.url : undefined;
      if (!url && data.ok !== true) throw new Error(String(data.error || "No URL"));
      
      const final: StudioResult = {
        ...pending,
        status: "success",
        url,
        engine: typeof data.engine === "string" ? data.engine : undefined,
        degraded: Boolean(data.degraded),
        note: typeof data.note === "string" ? data.note : undefined,
      };
      setResults(prev => prev.map(r => r.id === pending.id ? final : r));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setActiveError(message);
      setResults(prev => prev.map(r => r.id === pending.id ? { ...pending, status: "error", error: message } : r));
    } finally {
      setBusy(false);
    }
  }
  
  async function renderEdit() {
    if (!editClips.length || busy) return;
    setBusy(true);
    setActiveError(null);
    
    const pending: StudioResult = {
      id: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      type: "edit",
      title: "Montage vidéo",
      status: "running",
      format: editFormat,
      durationSec: editDuration,
      createdAt: new Date().toISOString(),
    };
    setResults(prev => [pending, ...prev]);
    
    try {
      const data = await postJson("/api/studio/render-edit", {
        clips: editClips,
        format: editFormat,
        durationSec: editDuration,
        textOverlays: editText ? [{ text: editText, start: 0, end: Math.min(4, editDuration), position: "center" }] : [],
        musicAssetId: musicAsset?.assetId,
      });
      
      const url = typeof data.url === "string" ? data.url : undefined;
      if (!url) throw new Error(String(data.error || "No URL"));
      
      const final: StudioResult = {
        ...pending,
        status: "success",
        url,
        engine: typeof data.engine === "string" ? data.engine : undefined,
        note: typeof data.note === "string" ? data.note : undefined,
      };
      setResults(prev => prev.map(r => r.id === pending.id ? final : r));
      setTab("results");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Render failed";
      setActiveError(message);
      setResults(prev => prev.map(r => r.id === pending.id ? { ...pending, status: "error", error: message } : r));
    } finally {
      setBusy(false);
    }
  }
  
  async function renderPhotoVideo() {
    if (!photos.length || busy) return;
    setBusy(true);
    setActiveError(null);
    
    const totalDuration = photos.length * photoDuration;
    
    const pending: StudioResult = {
      id: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      type: "photo-video",
      title: "Vidéo depuis photos",
      status: "running",
      format: photoFormat,
      imageCount: photos.length,
      durationSec: totalDuration,
      createdAt: new Date().toISOString(),
    };
    setResults(prev => [pending, ...prev]);
    
    try {
      const data = await postJson("/api/studio/render-photo-video", {
        images: photos.map(p => ({ assetId: p.assetId, duration: photoDuration })),
        format: photoFormat,
        musicAssetId: photoMusic?.assetId,
        textOverlays: photoText ? [{ text: photoText, start: 0, end: Math.min(4, totalDuration), position: "bottom" }] : [],
      });
      
      const url = typeof data.url === "string" ? data.url : undefined;
      if (!url) throw new Error(String(data.error || "No URL"));
      
      const final: StudioResult = {
        ...pending,
        status: "success",
        url,
        engine: typeof data.engine === "string" ? data.engine : undefined,
        note: typeof data.note === "string" ? data.note : undefined,
      };
      setResults(prev => prev.map(r => r.id === pending.id ? final : r));
      setTab("results");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Render failed";
      setActiveError(message);
      setResults(prev => prev.map(r => r.id === pending.id ? { ...pending, status: "error", error: message } : r));
    } finally {
      setBusy(false);
    }
  }
  
  function copyUrl(url: string) {
    navigator.clipboard.writeText(absoluteUrl(url) || url);
  }
  
  function clearResults() {
    setResults([]);
    localStorage.removeItem(STORAGE_KEY);
  }
  
  const tabs = [
    { id: "generate" as const, label: "Générer", icon: Play },
    { id: "edit" as const, label: "Monter mes vidéos", icon: Scissors },
    { id: "photo-video" as const, label: "Vidéo depuis photos", icon: Photos },
    { id: "results" as const, label: "Résultats", icon: CheckCircle2 },
    { id: "diagnostics" as const, label: "Diagnostics", icon: Activity },
  ];
  
  return (
    <div className="flex-1 overflow-y-auto bg-background pb-24">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <header className="rounded-3xl border border-white/10 bg-card p-5">
          <h1 className="text-3xl font-semibold">Studio créatif</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Générer, monter vos vidéos, créer des vidéos depuis vos photos.
          </p>
        </header>
        
        {/* Tabs */}
        <nav className="flex gap-2 overflow-x-auto pb-2">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all",
                tab === t.id ? "border-primary bg-primary/15 text-primary" : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </nav>
        
        {/* Error display */}
        {activeError && (
          <div className="flex gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{activeError}</span>
            <button onClick={() => setActiveError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
          </div>
        )}
        
        {/* Tab content */}
        {tab === "generate" && (
          <section className="rounded-3xl border border-white/10 bg-card p-5 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {[{ id: "video" as const, label: "Vidéo", icon: Film }, { id: "audio" as const, label: "Audio", icon: Music }, { id: "image" as const, label: "Image", icon: Image }].map(item => (
                <button
                  key={item.id}
                  onClick={() => setGenMode(item.id)}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition-all",
                    genMode === item.id ? "border-primary bg-primary/15 text-primary" : "border-white/10 bg-white/5 text-muted-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </button>
              ))}
            </div>
            
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={3}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-primary/50"
              placeholder="Décris ce que tu veux générer..."
            />
            
            <button
              onClick={generate}
              disabled={!prompt.trim() || busy}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {busy ? "Génération..." : `Générer ${genMode === "video" ? "vidéo" : genMode === "audio" ? "audio" : "image"}`}
            </button>
            
            <p className="text-xs text-muted-foreground">
              Vidéo = FFmpeg fallback. Audio = WAV local. Image = Pollinations. Pas de génération IA premium sans worker GPU.
            </p>
          </section>
        )}
        
        {tab === "edit" && (
          <section className="rounded-3xl border border-white/10 bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Monter mes vidéos</h2>
              <label className="inline-flex items-center gap-2 rounded-2xl bg-primary/10 px-4 py-2 text-sm cursor-pointer hover:bg-primary/20">
                <Upload className="h-4 w-4" />
                Ajouter vidéo
                <input ref={editFileRef} type="file" accept="video/mp4,video/quicktime,video/webm,video/3gpp" multiple className="hidden" onChange={handleUploadVideo} />
              </label>
            </div>
            
            {editAssets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-muted-foreground">
                <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Uploadez vos vidéos (MP4, MOV, WebM)</p>
                <p className="text-xs mt-1">Max 250 MB par fichier</p>
              </div>
            ) : (
              <div className="space-y-2">
                {editAssets.map((asset, idx) => (
                  <div key={asset.assetId} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                    <Film className="h-5 w-5 text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{asset.filename}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(asset.sizeBytes)}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <input
                        type="number"
                        value={editClips[idx]?.start || 0}
                        onChange={e => setEditClips(prev => prev.map((c, i) => i === idx ? { ...c, start: Number(e.target.value) } : c))}
                        className="w-14 rounded border border-white/10 bg-white/5 px-2 py-1"
                        placeholder="Début"
                      />
                      <span>-</span>
                      <input
                        type="number"
                        value={editClips[idx]?.end || 10}
                        onChange={e => setEditClips(prev => prev.map((c, i) => i === idx ? { ...c, end: Number(e.target.value) } : c))}
                        className="w-14 rounded border border-white/10 bg-white/5 px-2 py-1"
                        placeholder="Fin"
                      />
                      <span className="text-muted-foreground">sec</span>
                    </div>
                    <button onClick={() => removeEditAsset(idx)} className="text-red-400 hover:text-red-300"><X className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            )}
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3">
              <div>
                <label className="text-xs text-muted-foreground">Format</label>
                <select value={editFormat} onChange={e => setEditFormat(e.target.value as "9:16" | "1:1" | "16:9")} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                  <option value="9:16">TikTok 9:16</option>
                  <option value="1:1">Carré 1:1</option>
                  <option value="16:9">YouTube 16:9</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Durée max (sec)</label>
                <input type="number" value={editDuration} onChange={e => setEditDuration(Number(e.target.value))} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-muted-foreground">Texte overlay (optionnel)</label>
                <input value={editText} onChange={e => setEditText(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm" placeholder="Texte sur la vidéo" />
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs cursor-pointer hover:bg-white/5">
                <Music className="h-3.5 w-3.5" />
                {musicAsset ? musicAsset.filename.slice(0, 20) : "Ajouter musique"}
                <input ref={musicFileRef} type="file" accept="audio/mpeg,audio/wav,audio/mp4" className="hidden" onChange={e => handleUploadMusic(e, "edit")} />
              </label>
              {musicAsset && <button onClick={() => setMusicAsset(null)} className="text-xs text-red-400">Supprimer</button>}
            </div>
            
            <button
              onClick={renderEdit}
              disabled={!editClips.length || busy}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Créer le montage
            </button>
            
            <p className="text-xs text-muted-foreground">
              Montage local FFmpeg : assemblage, coupe, texte, audio. Ce n'est pas une génération IA premium.
            </p>
          </section>
        )}
        
        {tab === "photo-video" && (
          <section className="rounded-3xl border border-white/10 bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Vidéo depuis photos</h2>
              <label className="inline-flex items-center gap-2 rounded-2xl bg-primary/10 px-4 py-2 text-sm cursor-pointer hover:bg-primary/20">
                <Upload className="h-4 w-4" />
                Ajouter photos
                <input ref={photoFileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={handleUploadPhoto} />
              </label>
            </div>
            
            {photos.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-muted-foreground">
                <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Uploadez vos photos (JPG, PNG, WebP)</p>
                <p className="text-xs mt-1">Max 30 photos</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                {photos.map((photo, idx) => (
                  <div key={photo.assetId} className="relative aspect-square rounded-xl overflow-hidden border border-white/10">
                    <img src={`${API_BASE}${photo.url}`} alt={photo.filename} className="w-full h-full object-cover" />
                    <button onClick={() => removePhoto(idx)} className="absolute top-1 right-1 rounded-full bg-black/50 p-1"><X className="h-3 w-3" /></button>
                    <span className="absolute bottom-1 left-1 rounded bg-black/50 px-1 text-[10px]">{idx + 1}</span>
                  </div>
                ))}
              </div>
            )}
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3">
              <div>
                <label className="text-xs text-muted-foreground">Format</label>
                <select value={photoFormat} onChange={e => setPhotoFormat(e.target.value as "9:16" | "1:1" | "16:9")} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                  <option value="9:16">TikTok 9:16</option>
                  <option value="1:1">Carré 1:1</option>
                  <option value="16:9">YouTube 16:9</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Durée/photo (sec)</label>
                <input type="number" value={photoDuration} onChange={e => setPhotoDuration(Number(e.target.value))} min={1} max={30} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-muted-foreground">Texte overlay</label>
                <input value={photoText} onChange={e => setPhotoText(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm" placeholder="Texte sur la vidéo" />
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs cursor-pointer hover:bg-white/5">
                <Music className="h-3.5 w-3.5" />
                {photoMusic ? photoMusic.filename.slice(0, 20) : "Ajouter musique"}
                <input ref={photoMusicRef} type="file" accept="audio/mpeg,audio/wav,audio/mp4" className="hidden" onChange={e => handleUploadMusic(e, "photo")} />
              </label>
              {photoMusic && <button onClick={() => setPhotoMusic(null)} className="text-xs text-red-400">Supprimer</button>}
            </div>
            
            <button
              onClick={renderPhotoVideo}
              disabled={!photos.length || busy}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Créer la vidéo
            </button>
            
            <p className="text-xs text-muted-foreground">
              Vidéo générée depuis vos photos : slideshow amélioré, pas vidéo IA premium.
            </p>
          </section>
        )}
        
        {tab === "results" && (
          <section className="rounded-3xl border border-white/10 bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Résultats</h2>
              {results.length > 0 && (
                <button onClick={clearResults} className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                  <Trash2 className="h-3.5 w-3.5" /> Tout effacer
                </button>
              )}
            </div>
            
            {results.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-muted-foreground">
                Aucun résultat pour l'instant.
              </div>
            ) : (
              <div className="space-y-4">
                {results.slice(0, 20).map(result => (
                  <article key={result.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-medium">{result.title}</h3>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mt-1">
                          <span>{new Date(result.createdAt).toLocaleString("fr-FR")}</span>
                          {result.format && <span className="rounded bg-white/10 px-1.5">{result.format}</span>}
                          {result.durationSec && <span>{result.durationSec}s</span>}
                          {result.imageCount && <span>{result.imageCount} photos</span>}
                          {result.engine && <span className="rounded bg-primary/20 px-1.5">{result.engine}</span>}
                        </div>
                      </div>
                      <span className={cn("rounded-full px-2 py-1 text-[10px] font-medium", result.status === "success" ? "bg-emerald-500/10 text-emerald-300" : result.status === "running" ? "bg-blue-500/10 text-blue-300" : "bg-red-500/10 text-red-300")}>
                        {result.status}
                      </span>
                    </div>
                    
                    {result.status === "running" && <div className="text-sm text-muted-foreground">En cours...</div>}
                    {result.status === "error" && <div className="text-sm text-red-200">{result.error}</div>}
                    
                    {result.status === "success" && result.url && (
                      <>
                        {result.type === "photo-video" || result.type === "edit" || result.genMode === "video" ? (
                          <video controls src={absoluteUrl(result.url)} className="w-full rounded-xl bg-black max-h-[400px]" />
                        ) : result.genMode === "audio" ? (
                          <audio controls src={absoluteUrl(result.url)} className="w-full" />
                        ) : (
                          <img src={absoluteUrl(result.url)} alt="" className="w-full rounded-xl max-h-[400px] object-contain" />
                        )}
                        <div className="flex items-center gap-2">
                          <button onClick={() => copyUrl(result.url!)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs hover:bg-white/5">
                            <Copy className="h-3 w-3" /> Copier URL
                          </button>
                          <a href={absoluteUrl(result.url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                            <ExternalLink className="h-3 w-3" /> Ouvrir
                          </a>
                        </div>
                      </>
                    )}
                    
                    {result.note && <p className="text-xs text-muted-foreground bg-white/5 rounded-lg p-2">{result.note}</p>}
                    {result.degraded && <p className="text-xs text-amber-300">Fallback local : résultat réel mais qualité basique.</p>}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
        
        {tab === "diagnostics" && (
          <section className="rounded-3xl border border-white/10 bg-card p-5 space-y-4">
            <button
              onClick={runSelfTest}
              disabled={selfTest.status === "running"}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {selfTest.status === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
              Lancer le self-test Studio
            </button>
            
            {selfTest.status !== "idle" && (
              <div className={cn("rounded-xl p-3 text-sm", selfTest.status === "success" ? "bg-emerald-500/10 text-emerald-300" : selfTest.status === "error" ? "bg-red-500/10 text-red-300" : "bg-blue-500/10 text-blue-300")}>
                <p>{selfTest.message}</p>
                <pre className="mt-2 text-xs overflow-auto max-h-60 bg-white/5 rounded p-2">{JSON.stringify(selfTest.data, null, 2)}</pre>
              </div>
            )}
            
            {workers.status === "loaded" && (
              <div className="space-y-3">
                <h3 className="font-medium">Workers</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {workers.workers.map(w => {
                    const d = getWorkerStatusDisplay(w.status, w.verified);
                    const Icon = d.icon;
                    return (
                      <div key={w.id} className={cn("rounded-xl border p-3 text-sm", d.className)}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <span className="font-medium capitalize">{w.kind}</span>
                        </div>
                        <p className="text-xs mt-1">{d.label}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
