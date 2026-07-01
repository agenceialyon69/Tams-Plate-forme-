import { useState, useRef, useEffect, useCallback } from "react";
import {
  useListAssets, useCreateAsset, useDeleteAsset, useUpdateAsset, useGenerateMediaScript,
  useListProjects,
  getListAssetsQueryKey,
  type Asset, type Project, type AssetInput, type AssetUpdate,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ProductVideoMaker } from "@/components/product-video-maker";
import { MusicMaker } from "@/components/music-maker";
import {
  Plus, Image, Film, Mic, FileText, Sparkles, Layout, Star, Trash2, Wand2,
  Link, ExternalLink, Copy, Check, Send, MessageSquare, Palette, Bot,
  ChevronRight, Download, Maximize2, X, Lightbulb, Wrench, Zap, Music,
  Upload, CloudUpload, Loader2, ArrowLeft, ArrowRight, User, History,
  GitCompare, ChevronLeft, ImagePlus, RotateCcw, StopCircle, SlidersHorizontal,
  Volume2, FileAudio, FileVideo, FileImage, GripVertical, MoreHorizontal,
  FolderOpen, Eye, Pencil, FileJson, FileCode, Share2, Layers, Info, Clock,
  Tag, Type, Hash, Save, Bookmark, AlertTriangle, RefreshCw, Settings2,
  Paintbrush, Shuffle, Terminal, Code2, ChevronDown, PanelLeft,
  PanelRight, Focus, Aperture, Sun, Moon, Contrast, Frame, Grid3x3,
  Monitor, Smartphone, Tablet, Undo2, FileDown, ClipboardCheck, Sparkle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

type AssetType = "image" | "video" | "audio" | "document" | "prompt" | "template" | "result";

const TYPES: { value: AssetType; label: string; icon: React.ElementType; color: string; gradient: string }[] = [
  { value: "image", label: "Images", icon: Image, color: "text-blue-400 bg-blue-500/10", gradient: "from-blue-500/20 to-cyan-500/20" },
  { value: "video", label: "Vidéos", icon: Film, color: "text-violet-400 bg-violet-500/10", gradient: "from-violet-500/20 to-fuchsia-500/20" },
  { value: "audio", label: "Audio", icon: Music, color: "text-emerald-400 bg-emerald-500/10", gradient: "from-emerald-500/20 to-teal-500/20" },
  { value: "document", label: "Docs", icon: FileText, color: "text-amber-400 bg-amber-500/10", gradient: "from-amber-500/20 to-orange-500/20" },
  { value: "prompt", label: "Prompts", icon: Sparkles, color: "text-pink-400 bg-pink-500/10", gradient: "from-pink-500/20 to-rose-500/20" },
  { value: "template", label: "Templates", icon: Layout, color: "text-cyan-400 bg-cyan-500/10", gradient: "from-cyan-500/20 to-sky-500/20" },
  { value: "result", label: "Résultats", icon: Star, color: "text-orange-400 bg-orange-500/10", gradient: "from-orange-500/20 to-red-500/20" },
];

const ENGINES = [
  { id: "pollinations", name: "Pollinations", status: "ready", type: "image", icon: Image, desc: "Génération d'images via Flux" },
  { id: "flux", name: "FLUX", status: "soon", type: "image", icon: Palette, desc: "Modèle open-source avancé" },
  { id: "comfyui", name: "ComfyUI", status: "soon", type: "image", icon: Wrench, desc: "Workflows visuels custom" },
  { id: "wan", name: "Wan", status: "soon", type: "video", icon: Film, desc: "Génération vidéo IA" },
  { id: "ltx", name: "LTX Video", status: "soon", type: "video", icon: Zap, desc: "Vidéo haute qualité" },
  { id: "whisper", name: "Whisper", status: "soon", type: "audio", icon: Mic, desc: "Transcription audio" },
  { id: "kokoro", name: "Kokoro", status: "soon", type: "audio", icon: Music, desc: "Synthèse vocale" },
  { id: "musicgen", name: "MusicGen", status: "soon", type: "audio", icon: Sparkles, desc: "Génération musicale" },
];

/* ─── Ratios d'image ─── */
const IMAGE_RATIOS = [
  { label: "1:1", w: 1024, h: 1024, icon: Grid3x3 },
  { label: "16:9", w: 1344, h: 768, icon: Monitor },
  { label: "9:16", w: 768, h: 1344, icon: Smartphone },
  { label: "4:3", w: 1152, h: 896, icon: Tablet },
  { label: "3:2", w: 1216, h: 832, icon: Frame },
];

/* ─── Styles visuels ─── */
const VISUAL_STYLES = [
  { id: "photorealistic", label: "Photorealistic", preview: "🎨", desc: "Ultra-réaliste, détails photo" },
  { id: "anime", label: "Anime", preview: "✨", desc: "Style manga japonais" },
  { id: "oil-painting", label: "Oil Painting", preview: "🖌️", desc: "Peinture à l'huile classique" },
  { id: "digital-art", label: "Digital Art", preview: "💻", desc: "Art numérique vibrant" },
  { id: "cinematic", label: "Cinematic", preview: "🎬", desc: "Éclairage cinématographique" },
  { id: "3d-render", label: "3D Render", preview: "🧊", desc: "Rendu 3D professionnel" },
  { id: "watercolor", label: "Watercolor", preview: "💧", desc: "Aquarelle douce" },
  { id: "pixel-art", label: "Pixel Art", preview: "👾", desc: "Rétro pixel art" },
];

function getYoutubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
  return m ? m[1] : null;
}

/* ─── localStorage helpers ─── */
function loadHistory(): GenerationRecord[] {
  try {
    const raw = localStorage.getItem("studio-generation-history");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveHistory(records: GenerationRecord[]) {
  localStorage.setItem("studio-generation-history", JSON.stringify(records.slice(0, 200)));
}
function loadPromptHistory(): string[] {
  try {
    const raw = localStorage.getItem("studio-prompt-history");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function savePromptHistory(prompts: string[]) {
  localStorage.setItem("studio-prompt-history", JSON.stringify(prompts.slice(0, 50)));
}

interface GenerationRecord {
  id: string;
  prompt: string;
  date: string;
  url?: string;
  status: "pending" | "success" | "error" | "cancelled";
  type: AssetType;
  params?: ImageGenParams;
}

interface ImageGenParams {
  ratio: string;
  style: string;
  seed?: number;
  negativePrompt?: string;
}

/* ─── Project helpers (stored in tags since API has no projectId on Asset) ─── */
function getProjectTag(projectId: string | number): string {
  return `project:${projectId}`;
}
function extractProjectIdFromTags(tags?: string[]): string | null {
  if (!tags) return null;
  const tag = tags.find(t => t.startsWith("project:"));
  return tag ? tag.replace("project:", "") : null;
}
function getProjectNameFromId(projectId: string | null, projects: Project[]): string | null {
  if (!projectId) return null;
  const p = projects.find(pr => String(pr.id) === projectId);
  return p ? p.name : null;
}

/* ─── Export helpers ─── */
function exportAssetMarkdown(asset: Asset): string {
  const t = TYPES.find(x => x.value === asset.type);
  let md = `# ${asset.name}\n\n`;
  md += `**Type**: ${t?.label || asset.type}\n`;
  md += `**Date**: ${new Date(asset.createdAt).toLocaleString("fr-FR")}\n`;
  if (asset.url) md += `**URL**: ${asset.url}\n`;
  if (asset.tags?.length) md += `**Tags**: ${asset.tags.filter((t: string) => !t.startsWith("project:")).join(", ")}\n`;
  const projId = extractProjectIdFromTags(asset.tags);
  if (projId) md += `**Projet**: ${projId}\n`;
  md += `\n---\n\n`;
  if (asset.content) md += asset.content;
  return md;
}

function exportAssetJSON(asset: Asset): string {
  return JSON.stringify({
    id: asset.id,
    name: asset.name,
    type: asset.type,
    url: asset.url,
    content: asset.content,
    tags: asset.tags,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    mimeType: asset.mimeType,
    size: asset.size,
  }, null, 2);
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch { return false; }
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ─── Upload Zone ─── */
interface FileUpload {
  file: File;
  id: string;
  progress: number;
  previewUrl?: string;
  status: "pending" | "uploading" | "done" | "error";
}

function UploadZone({ onUploaded }: { onUploaded: (file: File, previewUrl: string) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState<FileUpload[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const acceptTypes = "image/*,video/*,audio/*";

  function createPreview(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  }

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files).filter(f => f.type.startsWith("image/") || f.type.startsWith("video/") || f.type.startsWith("audio/"));
    if (arr.length === 0) {
      toast({ title: "Formats acceptés : images, vidéos, audio", variant: "destructive" });
      return;
    }

    for (const file of arr) {
      const previewUrl = await createPreview(file);
      const upload: FileUpload = { file, id: Math.random().toString(36).slice(2), progress: 0, previewUrl, status: "pending" };
      setUploads(prev => [...prev, upload]);

      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 15 + 5;
        if (progress >= 100) {
          progress = 100;
          clearInterval(interval);
          setUploads(prev => prev.map(u => u.id === upload.id ? { ...u, progress: 100, status: "done" } : u));
          onUploaded(file, previewUrl);
        } else {
          setUploads(prev => prev.map(u => u.id === upload.id ? { ...u, progress } : u));
        }
      }, 300);
    }
  }

  function removeUpload(id: string) {
    setUploads(prev => prev.filter(u => u.id !== id));
  }

  return (
    <div className="relative">
      <input ref={inputRef} type="file" multiple accept={acceptTypes} className="hidden" onChange={e => addFiles(e.target.files)} />
      <button
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer.files); }}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border border-dashed backdrop-blur-sm",
          isDragging ? "bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(var(--primary),0.3)]" : "bg-white/5 text-muted-foreground hover:text-foreground border-white/10 hover:border-white/20 hover:bg-white/10"
        )}
      >
        <CloudUpload className="w-3.5 h-3.5" />
        Upload
      </button>

      {uploads.length > 0 && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-white/90">Fichiers</span>
            <button onClick={() => setUploads([])} className="text-[10px] text-white/50 hover:text-white transition-colors"><X className="w-3 h-3" /></button>
          </div>
          {uploads.map(u => (
            <div key={u.id} className="space-y-1">
              <div className="flex items-center gap-2">
                {u.file.type.startsWith("image/") ? <FileImage className="w-3.5 h-3.5 text-blue-400" /> :
                 u.file.type.startsWith("video/") ? <FileVideo className="w-3.5 h-3.5 text-violet-400" /> :
                 <FileAudio className="w-3.5 h-3.5 text-emerald-400" />}
                <span className="text-[10px] truncate flex-1 text-white/70">{u.file.name}</span>
                {u.status === "done" && <Check className="w-3 h-3 text-emerald-400" />}
                <button onClick={() => removeUpload(u.id)} className="text-white/40 hover:text-white/80 transition-colors"><X className="w-3 h-3" /></button>
              </div>
              <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-300 rounded-full" style={{ width: `${u.progress}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Generation Progress ─── */
interface GenProgress {
  step: number;
  percent: number;
  label: string;
  cancelled: boolean;
}

const GEN_STEPS = [
  "Analyse du prompt...",
  "Génération en cours...",
  "Finalisation...",
  "Terminé",
];

function useSimulatedProgress(generating: boolean, onComplete?: () => void) {
  const [progress, setProgress] = useState<GenProgress>({ step: 0, percent: 0, label: GEN_STEPS[0], cancelled: false });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (generating) {
      cancelledRef.current = false;
      setProgress({ step: 0, percent: 0, label: GEN_STEPS[0], cancelled: false });
      let percent = 0;
      intervalRef.current = setInterval(() => {
        if (cancelledRef.current) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return;
        }
        percent += Math.random() * 4 + 1;
        if (percent >= 100) {
          percent = 100;
          if (intervalRef.current) clearInterval(intervalRef.current);
          setProgress({ step: 3, percent: 100, label: GEN_STEPS[3], cancelled: false });
          onComplete?.();
        } else {
          const step = percent < 30 ? 0 : percent < 70 ? 1 : 2;
          setProgress({ step, percent: Math.round(percent), label: GEN_STEPS[step], cancelled: false });
        }
      }, 100);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [generating]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (intervalRef.current) clearInterval(intervalRef.current);
    setProgress(p => ({ ...p, cancelled: true, label: "Annulé" }));
  }, []);

  return { progress, cancel };
}

/* ─── Studio Chat ─── */
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tool?: string;
  imageUrl?: string;
}

function getContextualSuggestions(selectedType?: AssetType): string[] {
  switch (selectedType) {
    case "image": return ["Portrait cyberpunk", "Paysage fantastique", "Logo minimaliste", "Illustration 3D"];
    case "video": return ["Script pub 30s", "Storyboard tuto", "Montage dynamique", "Voix-off corporate"];
    case "audio": return ["Jingle lo-fi", "Podcast intro", "Ambiance méditation", "Musique électro"];
    case "prompt": return ["Prompt SEO blog", "Prompt code React", "Prompt image Midjourney", "Prompt email prospection"];
    default: return ["Génère un portrait cyberpunk", "Script vidéo 2 min", "Brief audio lo-fi", "Prompt optimisé"];
  }
}

function StudioChat({ onGenerateImage, onCreateAsset, selectedType }: {
  onGenerateImage: (prompt: string) => void;
  onCreateAsset: (type: AssetType, data: AssetInput) => void;
  selectedType?: AssetType;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Bienvenue dans le Studio créatif ! Je peux vous aider à :\n\n• Générer des images (décrivez ce que vous voulez)\n• Créer des scripts vidéo\n• Rédiger des briefs audio\n• Structurer des prompts\n\nQu'aimeriez-vous créer ?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  function handleSend() {
    if (!input.trim()) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      const text = input.toLowerCase();
      let response: ChatMessage;

      if (text.includes("image") || text.includes("photo") || text.includes("dessin") || text.includes("portrait")) {
        const prompt = input.replace(/(génère|crée|fais|image|photo|dessin)/gi, "").trim();
        response = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `Je lance la génération d'image pour : "${prompt}"`,
          tool: "generate-image",
        };
        onGenerateImage(prompt);
      } else if (text.includes("vidéo") || text.includes("script") || text.includes("film")) {
        response = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Je peux vous aider à structurer un script vidéo. Quel est le sujet, la durée souhaitée et le ton (pédagogique, humoristique, corporate) ?",
        };
      } else if (text.includes("audio") || text.includes("musique") || text.includes("son")) {
        response = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Je peux rédiger un brief audio détaillé. Décrivez le style musical, l'ambiance et la durée souhaitée.",
        };
      } else if (text.includes("prompt") || text.includes("template")) {
        response = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Je vais structurer un prompt optimisé. Quel est le domaine (image, texte, code) et l'objectif ?",
        };
      } else {
        response = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Je comprends. Pour vous aider au mieux, pourriez-vous préciser le type de création souhaitée (image, vidéo, audio, prompt) ?",
        };
      }

      setIsTyping(false);
      setMessages(prev => [...prev, response]);
    }, 800);
  }

  const suggestions = getContextualSuggestions(selectedType);

  return (
    <div className="flex flex-col h-full bg-black/20 backdrop-blur-sm border-r border-white/5">
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center border border-blue-500/20">
          <Bot className="w-4 h-4 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-foreground">Studio AI</span>
          <p className="text-[10px] text-muted-foreground truncate">Assistant créatif intelligent</p>
        </div>
        <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">En ligne</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {messages.map(msg => (
          <div key={msg.id} className={cn("flex gap-2.5", msg.role === "user" ? "justify-end" : "justify-start")}>
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center shrink-0 mt-0.5 border border-blue-500/20">
                <Bot className="w-3.5 h-3.5 text-blue-400" />
              </div>
            )}
            <div className={cn(
              "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-md",
              msg.role === "user"
                ? "bg-gradient-to-br from-blue-500 to-cyan-500 text-white rounded-br-md"
                : "bg-white/5 text-foreground rounded-bl-md border border-white/10 hover:border-white/20"
            )}>
              {msg.content.split("\n").map((line, i) => (
                <p key={i} className={cn(i > 0 && "mt-1")}>{line}</p>
              ))}
              {msg.tool === "generate-image" && (
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-500/5 rounded-md px-2 py-1 border border-emerald-500/10">
                  <Zap className="w-3 h-3" />
                  Génération en cours...
                </div>
              )}
            </div>
            {msg.role === "user" && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center shrink-0 mt-0.5 border border-violet-500/20">
                <User className="w-3.5 h-3.5 text-violet-400" />
              </div>
            )}
          </div>
        ))}
        {isTyping && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center shrink-0 border border-blue-500/20">
              <Bot className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="bg-white/5 rounded-2xl rounded-bl-md px-3.5 py-2.5 flex gap-1.5 border border-white/10 shadow-lg backdrop-blur-sm">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-3 py-2.5 border-t border-white/5">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSend()}
            placeholder="Décrivez votre création..."
            aria-label="Message pour le Studio AI"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/30 transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 text-white rounded-lg hover:opacity-90 disabled:opacity-40 transition-all active:scale-[0.98] shadow-lg shadow-blue-500/20"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex gap-1.5 mt-2.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {suggestions.map(suggestion => (
            <button
              key={suggestion}
              onClick={() => { setInput(suggestion); }}
              className="px-2.5 py-1 rounded-md bg-white/5 text-[10px] text-muted-foreground hover:text-foreground whitespace-nowrap transition-colors active:scale-[0.98] border border-white/10 hover:border-white/20 hover:bg-white/10"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── History Panel ─── */
function HistoryPanel({ onRegenerate }: { onRegenerate: (prompt: string) => void }) {
  const [history, setHistory] = useState<GenerationRecord[]>(loadHistory);
  const [expanded, setExpanded] = useState(true);

  function clearHistory() {
    localStorage.removeItem("studio-generation-history");
    setHistory([]);
  }

  if (history.length === 0) return null;

  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-3 space-y-2">
      <button onClick={() => setExpanded(e => !e)} className="flex items-center gap-2 w-full">
        <History className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-xs font-semibold text-foreground flex-1 text-left">Historique</span>
        <span className="text-[10px] text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded-full">{history.length}</span>
        {expanded ? <ChevronRight className="w-3 h-3 text-muted-foreground rotate-90 transition-transform" /> : <ChevronRight className="w-3 h-3 text-muted-foreground transition-transform" />}
      </button>
      {expanded && (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {history.slice().reverse().map(item => (
            <div key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/5 text-[10px] group hover:bg-white/10 transition-colors border border-transparent hover:border-white/10">
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0",
                item.status === "success" ? "bg-emerald-400" :
                item.status === "error" ? "bg-destructive" :
                item.status === "cancelled" ? "bg-amber-400" : "bg-blue-400"
              )} />
              <span className="truncate flex-1 text-muted-foreground">{item.prompt}</span>
              <button onClick={() => onRegenerate(item.prompt)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10" title="Relancer">
                <RotateCcw className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
          ))}
          <button onClick={clearHistory} className="text-[10px] text-destructive hover:underline w-full text-left px-2">Effacer l&apos;historique</button>
        </div>
      )}
    </div>
  );
}

/* ─── Compare Modal ─── */
function CompareModal({ images, onClose }: { images: { url: string; name: string; version: number }[]; onClose: () => void }) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col max-h-[100dvh]" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-white/70" />
          <span className="text-sm font-medium text-white">Comparaison</span>
        </div>
        <button className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors" onClick={onClose}><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 flex overflow-hidden p-4 gap-4" onClick={e => e.stopPropagation()}>
        {images.map((img, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-2 min-w-0">
            <div className="relative w-full flex-1 min-h-0 rounded-xl overflow-hidden bg-black/40 border border-white/10">
              <img src={img.url} alt={img.name} className="w-full h-full object-contain" />
              <div className="absolute top-2 left-2 px-2 py-0.5 bg-blue-500/80 text-white text-[10px] font-bold rounded-md backdrop-blur-sm">v{img.version}</div>
            </div>
            <span className="text-[10px] text-white/60 truncate max-w-full">{img.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Lightbox ─── */
function Lightbox({ images, currentIndex, onClose, onNavigate }: {
  images: { url: string; name: string }[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const [scale, setScale] = useState(1);
  const touchStartDist = useRef(0);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onNavigate(Math.max(0, currentIndex - 1));
      if (e.key === "ArrowRight") onNavigate(Math.min(images.length - 1, currentIndex + 1));
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, onNavigate, currentIndex, images.length]);

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchStartDist.current = Math.sqrt(dx * dx + dy * dy);
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ratio = dist / touchStartDist.current;
      setScale(Math.min(3, Math.max(1, ratio)));
    }
  }

  const img = images[currentIndex];
  if (!img) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center p-4 max-h-[100dvh]" style={{ touchAction: "none" }} onClick={onClose}>
      <button className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10 backdrop-blur-sm" onClick={onClose}><X className="w-5 h-5" /></button>

      {images.length > 1 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); onNavigate(Math.max(0, currentIndex - 1)); }}
            disabled={currentIndex === 0}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 transition-colors z-10 backdrop-blur-sm"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onNavigate(Math.min(images.length - 1, currentIndex + 1)); }}
            disabled={currentIndex === images.length - 1}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 transition-colors z-10 backdrop-blur-sm"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-white/60 bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-sm">
            {currentIndex + 1} / {images.length}
          </div>
        </>
      )}

      <img
        src={img.url}
        alt={img.name}
        className="max-w-full max-h-[90dvh] object-contain rounded-lg transition-transform"
        style={{ transform: `scale(${scale})` }}
        onClick={e => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={() => setScale(1)}
      />
    </div>
  );
}

/* ─── Export Menu ─── */
function ExportMenu({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  async function handleCopy(format: "markdown" | "json") {
    const text = format === "markdown" ? exportAssetMarkdown(asset) : exportAssetJSON(asset);
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      toast({ title: `Copié en ${format.toUpperCase()}` });
      setTimeout(() => setCopied(false), 1500);
    }
  }

  function handleDownload(format: "markdown" | "json") {
    const ext = format === "markdown" ? "md" : "json";
    const content = format === "markdown" ? exportAssetMarkdown(asset) : exportAssetJSON(asset);
    downloadFile(content, `${asset.name}.${ext}`, format === "markdown" ? "text/markdown" : "application/json");
    toast({ title: `Téléchargé en ${format.toUpperCase()}` });
  }

  function handleImageDownload() {
    if (asset.url && asset.type === "image") {
      const a = document.createElement("a");
      a.href = asset.url;
      a.download = `${asset.name}.png`;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast({ title: "Image téléchargée" });
    }
  }

  return (
    <div className="absolute right-0 top-full mt-1 w-56 bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-50 p-2 space-y-0.5">
      <button onClick={() => { handleCopy("markdown"); }} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-white/80 hover:bg-white/10 transition-colors">
        <FileCode className="w-3.5 h-3.5" /> Copier Markdown
      </button>
      <button onClick={() => { handleCopy("json"); }} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-white/80 hover:bg-white/10 transition-colors">
        <FileJson className="w-3.5 h-3.5" /> Copier JSON
      </button>
      <div className="h-px bg-white/10 my-1" />
      <button onClick={() => { handleDownload("markdown"); }} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-white/80 hover:bg-white/10 transition-colors">
        <FileDown className="w-3.5 h-3.5" /> Télécharger .md
      </button>
      <button onClick={() => { handleDownload("json"); }} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-white/80 hover:bg-white/10 transition-colors">
        <FileDown className="w-3.5 h-3.5" /> Télécharger .json
      </button>
      {asset.type === "image" && asset.url && (
        <>
          <div className="h-px bg-white/10 my-1" />
          <button onClick={handleImageDownload} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-white/80 hover:bg-white/10 transition-colors">
            <Download className="w-3.5 h-3.5" /> Télécharger l'image
          </button>
        </>
      )}
    </div>
  );
}

/* ─── Asset Detail Modal ─── */
function AssetDetailModal({ asset, projects, onClose, onDelete, onDuplicate }: {
  asset: Asset;
  projects: Project[];
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"preview" | "metadata" | "history" | "versions">("preview");
  const { toast } = useToast();
  const t = TYPES.find(x => x.value === asset.type) ?? TYPES[0];
  const projId = extractProjectIdFromTags(asset.tags);
  const projName = getProjectNameFromId(projId, projects);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 max-h-[100dvh]">
      <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", t.color)}>
              <t.icon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">{asset.name}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-muted-foreground">{t.label}</span>
                {projName && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20 flex items-center gap-1">
                    <FolderOpen className="w-2.5 h-2.5" /> {projName}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onDuplicate} className="p-2 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors" title="Dupliquer">
              <Copy className="w-4 h-4" />
            </button>
            <button onClick={onDelete} className="p-2 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors" title="Supprimer">
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors ml-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-white/10 px-5 shrink-0">
          {(["preview", "metadata", "history", "versions"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-2.5 text-xs font-medium capitalize transition-colors border-b-2",
                activeTab === tab
                  ? "text-foreground border-blue-500"
                  : "text-muted-foreground border-transparent hover:text-foreground/80"
              )}
            >
              {tab === "preview" && <span className="flex items-center gap-1.5"><Eye className="w-3 h-3" /> Aperçu</span>}
              {tab === "metadata" && <span className="flex items-center gap-1.5"><Info className="w-3 h-3" /> Métadonnées</span>}
              {tab === "history" && <span className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> Historique</span>}
              {tab === "versions" && <span className="flex items-center gap-1.5"><Layers className="w-3 h-3" /> Versions</span>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === "preview" && (
            <div className="space-y-4">
              {asset.type === "image" && asset.url && (
                <div className="relative rounded-xl overflow-hidden bg-black/40 border border-white/10">
                  <img src={asset.url} alt={asset.name} className="w-full max-h-[60dvh] object-contain" />
                </div>
              )}
              {asset.type === "video" && asset.url && getYoutubeId(asset.url) && (
                <div className="aspect-video bg-black rounded-xl overflow-hidden">
                  <iframe src={`https://www.youtube.com/embed/${getYoutubeId(asset.url)}`} className="w-full h-full" allowFullScreen />
                </div>
              )}
              {asset.type === "audio" && asset.url && (
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  {asset.url.includes("soundcloud.com") ? (
                    <iframe width="100%" height="120" src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(asset.url)}&color=%232563eb&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&show_teaser=false`} className="rounded-lg" />
                  ) : (
                    <audio controls className="w-full" src={asset.url} />
                  )}
                </div>
              )}
              {asset.content && (
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <p className="text-xs text-muted-foreground mb-2">Contenu</p>
                  <pre className="text-xs text-foreground whitespace-pre-wrap font-mono leading-relaxed">{asset.content}</pre>
                </div>
              )}
            </div>
          )}

          {activeTab === "metadata" && (
            <div className="grid grid-cols-2 gap-3 stagger-up">
              <div className="bg-white/5 rounded-xl p-3 border border-white/10 space-y-1 hover-lift transition-all duration-300">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><Type className="w-3 h-3" /> Type</div>
                <div className="text-xs font-medium text-foreground">{t.label}</div>
              </div>
              <div className="bg-white/5 rounded-xl p-3 border border-white/10 space-y-1">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><Clock className="w-3 h-3" /> Créé le</div>
                <div className="text-xs font-medium text-foreground">{new Date(asset.createdAt).toLocaleString("fr-FR")}</div>
              </div>
              <div className="bg-white/5 rounded-xl p-3 border border-white/10 space-y-1">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><Hash className="w-3 h-3" /> ID</div>
                <div className="text-xs font-medium text-foreground">#{asset.id}</div>
              </div>
              {asset.size && (
                <div className="bg-white/5 rounded-xl p-3 border border-white/10 space-y-1">
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><FileDown className="w-3 h-3" /> Taille</div>
                  <div className="text-xs font-medium text-foreground">{(asset.size / 1024).toFixed(1)} KB</div>
                </div>
              )}
              {asset.mimeType && (
                <div className="bg-white/5 rounded-xl p-3 border border-white/10 space-y-1">
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><FileText className="w-3 h-3" /> Format</div>
                  <div className="text-xs font-medium text-foreground">{asset.mimeType}</div>
                </div>
              )}
              {projName && (
                <div className="bg-white/5 rounded-xl p-3 border border-white/10 space-y-1">
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><FolderOpen className="w-3 h-3" /> Projet lié</div>
                  <div className="text-xs font-medium text-blue-400">{projName}</div>
                </div>
              )}
              {asset.tags && asset.tags.length > 0 && (
                <div className="col-span-2 bg-white/5 rounded-xl p-3 border border-white/10 space-y-1">
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><Tag className="w-3 h-3" /> Tags</div>
                  <div className="flex flex-wrap gap-1">
                    {asset.tags.filter((t: string) => !t.startsWith("project:")).map((tag: string) => (
                      <span key={tag} className="text-[10px] px-2 py-0.5 bg-white/10 text-foreground rounded-full border border-white/10">{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "history" && (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Historique des modifications</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Bientôt disponible</p>
            </div>
          )}

          {activeTab === "versions" && (
            <div className="text-center py-12 text-muted-foreground">
              <Layers className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Versions de l'asset</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Bientôt disponible</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Asset Card ─── */
function AssetCard({ asset, onDelete, onCompare, imageIndex, onLightbox, projects, onOpenDetail }: {
  asset: Asset; onDelete: () => void; onCompare?: () => void;
  imageIndex?: number; onLightbox?: (index: number) => void;
  projects: Project[];
  onOpenDetail: (asset: Asset) => void;
}) {
  const t = TYPES.find(x => x.value === asset.type) ?? TYPES[0];
  const [copied, setCopied] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const ytId = asset.url ? getYoutubeId(asset.url) : null;
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const projId = extractProjectIdFromTags(asset.tags);
  const projName = getProjectNameFromId(projId, projects);

  function copyContent() {
    if (asset.content) {
      navigator.clipboard.writeText(asset.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <>
      <div data-testid={`asset-item-${asset.id}`} className="group relative bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] rounded-2xl overflow-hidden hover:border-white/20 transition-all duration-300 hover:shadow-[0_0_30px_rgba(255,255,255,0.05)] hover:scale-[1.01] break-inside-avoid mb-3">
        {/* Glow effect on hover */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-gradient-to-b from-white/[0.02] to-transparent" />

        {asset.type === "image" && asset.url && (
          <div className="relative overflow-hidden cursor-pointer" onClick={() => onLightbox?.(imageIndex ?? 0)}>
            <img
              ref={imgRef}
              src={asset.url}
              alt={asset.name}
              loading="lazy"
              decoding="async"
              onLoad={() => setImgLoaded(true)}
              className={cn("w-full h-auto object-cover transition-all duration-700 group-hover:scale-105", !imgLoaded && "blur-sm")}
            />
            {!imgLoaded && (
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-white/[0.02] animate-pulse" />
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
              <div className="flex items-center gap-2">
                <Maximize2 className="w-5 h-5 text-white/90" />
              </div>
            </div>
            {(asset as { version?: number }).version && (
              <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold rounded-md border border-white/10">v{(asset as { version?: number }).version}</div>
            )}
          </div>
        )}
        {asset.type === "video" && ytId && (
          <div className="aspect-video bg-black rounded-t-2xl overflow-hidden">
            <iframe src={`https://www.youtube.com/embed/${ytId}`} className="w-full h-full" allowFullScreen />
          </div>
        )}
        {asset.type === "audio" && asset.url && (
          <div className="px-4 pt-4">
            {asset.url.includes("soundcloud.com") ? (
              <iframe width="100%" height="60" src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(asset.url)}&color=%232563eb&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&show_teaser=false`} className="rounded-lg" />
            ) : (
              <audio controls className="w-full h-8" src={asset.url} />
            )}
          </div>
        )}

        <div className="p-4 relative">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0 backdrop-blur-sm border border-white/10", t.color)}>
              <t.icon className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
              {asset.content && (
                <button onClick={copyContent} className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors active:scale-[0.98]">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
              {asset.url && !ytId && (
                <a href={asset.url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              {asset.type === "image" && onCompare && (
                <button onClick={onCompare} className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors active:scale-[0.98]" title="Comparer">
                  <GitCompare className="w-3.5 h-3.5" />
                </button>
              )}
              <div className="relative">
                <button onClick={() => setShowExport(s => !s)} className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors active:scale-[0.98]" title="Exporter">
                  <Share2 className="w-3.5 h-3.5" />
                </button>
                {showExport && <ExportMenu asset={asset} onClose={() => setShowExport(false)} />}
              </div>
              <button onClick={onDelete} className="p-1.5 rounded-lg hover:text-destructive text-muted-foreground transition-colors active:scale-[0.98]">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="text-sm font-medium text-foreground mb-1">{asset.name}</div>
          {asset.content && (
            <div className="text-xs text-muted-foreground line-clamp-3 leading-relaxed whitespace-pre-wrap">{asset.content}</div>
          )}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {(asset.tags as string[]).filter((t: string) => !t.startsWith("project:")).map((tag: string) => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-white/5 text-muted-foreground rounded-full border border-white/10">{tag}</span>
            ))}
            {projName && (
              <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20 flex items-center gap-1">
                <FolderOpen className="w-2.5 h-2.5" /> {projName}
              </span>
            )}
          </div>
          {/* Open detail button */}
          <button
            onClick={() => onOpenDetail(asset)}
            className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground"
            title="Voir les détails"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── Masonry Gallery ─── */
function MasonryGallery({ assets, onDelete, projects, onOpenDetail }: {
  assets: Asset[]; onDelete: (id: string) => void;
  projects: Project[];
  onOpenDetail: (asset: Asset) => void;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const imageAssets = assets.filter(a => a.type === "image" && a.url);

  // Group images by prompt for compare
  const promptGroups: Record<string, any[]> = {};
  imageAssets.forEach(asset => {
    const key = asset.content || asset.name;
    if (!promptGroups[key]) promptGroups[key] = [];
    promptGroups[key].push(asset);
  });

  const [compareImages, setCompareImages] = useState<{ url: string; name: string; version: number }[] | null>(null);

  function handleCompare(prompt: string) {
    const group = promptGroups[prompt];
    if (group && group.length >= 2) {
      setCompareImages(group.map((a, i) => ({ url: a.url, name: a.name, version: i + 1 })));
    }
  }

  return (
    <>
      <div className="columns-1 sm:columns-2 lg:columns-3 gap-3">
        {assets.map((asset) => (
          <AssetCard
            key={asset.id}
            asset={asset}
            onDelete={() => onDelete(String(asset.id))}
            onCompare={asset.type === "image" && promptGroups[asset.content || asset.name]?.length >= 2 ? () => handleCompare(asset.content || asset.name) : undefined}
            imageIndex={asset.type === "image" ? imageAssets.findIndex(a => a.id === asset.id) : undefined}
            onLightbox={(i) => setLightboxIndex(i)}
            projects={projects}
            onOpenDetail={onOpenDetail}
          />
        ))}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          images={imageAssets.map(a => ({ url: a.url ?? "", name: a.name }))}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}

      {compareImages && (
        <CompareModal images={compareImages} onClose={() => setCompareImages(null)} />
      )}
    </>
  );
}

/* ─── Skeleton Loader ─── */
function SkeletonGrid() {
  return (
    <div className="columns-1 sm:columns-2 lg:columns-3 gap-3">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="break-inside-avoid mb-3">
          <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] rounded-2xl overflow-hidden">
            <div className="h-40 bg-gradient-to-br from-white/5 to-white/[0.02] animate-pulse" />
            <div className="p-4 space-y-2">
              <div className="h-4 w-3/4 bg-white/5 rounded animate-pulse" />
              <div className="h-3 w-full bg-white/5 rounded animate-pulse" />
              <div className="h-3 w-2/3 bg-white/5 rounded animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Image Generator (Enhanced) ─── */
function ImageGenerator({ onSave, onHistoryAdd, initialPrompt, projects }: { onSave: (data: AssetInput) => void; onHistoryAdd: (record: GenerationRecord) => void; initialPrompt?: string; projects: Project[] }) {
  const [prompt, setPrompt] = useState(initialPrompt || "");
  const [imageUrl, setImageUrl] = useState("");
  const [finalPrompt, setFinalPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [imgLoading, setImgLoading] = useState(false);
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [ratio, setRatio] = useState("1:1");
  const [style, setStyle] = useState("photorealistic");
  const [seed, setSeed] = useState<number | undefined>(undefined);
  const [negativePrompt, setNegativePrompt] = useState("");
  const [tokenCount, setTokenCount] = useState(0);
  const [promptHistory, setPromptHistory] = useState<string[]>(loadPromptHistory);
  const [showPromptHistory, setShowPromptHistory] = useState(false);
  const { toast } = useToast();
  const abortRef = useRef(false);

  const { progress, cancel } = useSimulatedProgress(generating);

  // Update token count
  useEffect(() => {
    setTokenCount(prompt.trim().split(/\s+/).filter(Boolean).length);
  }, [prompt]);

  // Set initial prompt
  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt);
  }, [initialPrompt]);

  async function generate() {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setImgLoading(true);
    abortRef.current = false;

    // Save to prompt history
    const newHistory = [prompt.trim(), ...promptHistory.filter(p => p !== prompt.trim())].slice(0, 50);
    setPromptHistory(newHistory);
    savePromptHistory(newHistory);

    const selectedRatio = IMAGE_RATIOS.find(r => r.label === ratio) || IMAGE_RATIOS[0];
    const params: ImageGenParams = { ratio, style, seed, negativePrompt };

    const record: GenerationRecord = {
      id: Date.now().toString(),
      prompt: prompt.trim(),
      date: new Date().toISOString(),
      status: "pending",
      type: "image",
      params,
    };
    onHistoryAdd(record);

    try {
      const res = await fetch(`${API_BASE}/api/studio/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          width: selectedRatio.w,
          height: selectedRatio.h,
          style,
          seed,
          negativePrompt: negativePrompt || undefined,
        }),
      });
      if (abortRef.current) {
        onHistoryAdd({ ...record, status: "cancelled" });
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setImageUrl(data.url);
      setFinalPrompt(data.prompt ?? prompt.trim());
      if (!name) setName(prompt.trim().slice(0, 40));
      toast({ title: data.enhanced ? "Image générée (prompt enrichi)" : "Image générée" });
      onHistoryAdd({ ...record, url: data.url, status: "success" });
    } catch {
      if (!abortRef.current) {
        toast({ title: "Échec de la génération", variant: "destructive" });
        onHistoryAdd({ ...record, status: "error" });
      }
    } finally {
      setGenerating(false);
    }
  }

  function handleCancel() {
    abortRef.current = true;
    cancel();
    setGenerating(false);
    toast({ title: "Génération annulée" });
  }

  function randomizeSeed() {
    setSeed(Math.floor(Math.random() * 999999));
  }

  const selectedStyle = VISUAL_STYLES.find(s => s.id === style);

  return (
    <div className="bg-gradient-to-br from-blue-500/[0.07] to-cyan-500/[0.07] backdrop-blur-sm border border-blue-500/20 rounded-2xl p-5 space-y-4 shadow-[0_0_30px_rgba(59,130,246,0.05)]">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
          <Image className="w-4 h-4 text-blue-400" />
        </div>
        <span className="text-sm font-semibold text-foreground">Générateur d'images</span>
        <span className="ml-auto text-[10px] px-2.5 py-1 bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20 backdrop-blur-sm">Pollinations · Flux</span>
      </div>

      {/* Prompt input with history */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              autoFocus
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/30 transition-all"
              placeholder="Décrivez l'image voulue en détail..."
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") generate(); }}
            />
            {promptHistory.length > 0 && (
              <button
                onClick={() => setShowPromptHistory(!showPromptHistory)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10 text-muted-foreground"
              >
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showPromptHistory && "rotate-180")} />
              </button>
            )}
          </div>
          <button
            disabled={!prompt.trim() || generating}
            onClick={generate}
            aria-label="Générer une image"
            className="flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-br from-blue-500 to-cyan-500 text-white rounded-xl text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg shadow-blue-500/20 shrink-0"
          >
            <Wand2 className={cn("w-3.5 h-3.5", generating && "animate-spin")} />
            {generating ? "Génération..." : "Générer"}
          </button>
        </div>

        {/* Token counter */}
        <div className="flex items-center justify-between mt-1.5">
          <span className={cn("text-[10px] transition-colors", tokenCount > 75 ? "text-amber-400" : "text-muted-foreground/60")}>
            {tokenCount} tokens {tokenCount > 75 && "(recommandé: <75)"}
          </span>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <SlidersHorizontal className="w-3 h-3" />
            {showAdvanced ? "Moins" : "Avancé"}
          </button>
        </div>

        {/* Prompt history dropdown */}
        {showPromptHistory && promptHistory.length > 0 && (
          <div className="absolute z-20 left-0 right-16 mt-1 bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-2 max-h-48 overflow-y-auto">
            {promptHistory.slice(0, 10).map((p, i) => (
              <button
                key={i}
                onClick={() => { setPrompt(p); setShowPromptHistory(false); }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-white/70 hover:bg-white/10 transition-colors truncate"
              >
                <History className="w-3 h-3 inline mr-1.5 opacity-50" />
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Advanced options */}
      {showAdvanced && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-4 animate-fade-in backdrop-blur-sm">
          {/* Ratio selector */}
          <div className="space-y-2">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Grid3x3 className="w-3 h-3" /> Ratio
            </label>
            <div className="flex gap-2">
              {IMAGE_RATIOS.map(r => (
                <button
                  key={r.label}
                  onClick={() => setRatio(r.label)}
                  className={cn(
                    "flex flex-col items-center gap-1 px-3 py-2 rounded-xl border transition-all active:scale-[0.98]",
                    ratio === r.label
                      ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                      : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20"
                  )}
                >
                  <r.icon className="w-4 h-4" />
                  <span className="text-[10px]">{r.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Style gallery */}
          <div className="space-y-2">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Paintbrush className="w-3 h-3" /> Style visuel
            </label>
            <div className="grid grid-cols-4 gap-2">
              {VISUAL_STYLES.map(s => (
                <button
                  key={s.id}
                  onClick={() => setStyle(s.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 p-2 rounded-xl border transition-all active:scale-[0.98]",
                    style === s.id
                      ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                      : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20"
                  )}
                >
                  <span className="text-lg">{s.preview}</span>
                  <span className="text-[10px] font-medium">{s.label}</span>
                </button>
              ))}
            </div>
            {selectedStyle && (
              <p className="text-[10px] text-muted-foreground/60">{selectedStyle.desc}</p>
            )}
          </div>

          {/* Negative prompt & Seed */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Prompt négatif
              </label>
              <input
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/30"
                placeholder="Éléments à éviter..."
                value={negativePrompt}
                onChange={e => setNegativePrompt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Hash className="w-3 h-3" /> Seed
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/30"
                  placeholder="Aléatoire"
                  value={seed || ""}
                  onChange={e => setSeed(e.target.value ? Number(e.target.value) : undefined)}
                />
                <button
                  onClick={randomizeSeed}
                  className="px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all active:scale-[0.98]"
                  title="Seed aléatoire"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Progress */}
      {generating && (
        <div className="space-y-2 bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 backdrop-blur-sm animate-slide-up hover-glow">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
              <span className="text-xs text-foreground">{progress.label}</span>
            </div>
            <span className="text-xs font-mono text-blue-400">{progress.percent}%</span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500 rounded-full animate-glow-pulse" style={{ width: `${progress.percent}%` }} />
          </div>
          <div className="flex gap-1">
            {GEN_STEPS.slice(0, 3).map((step, i) => (
              <div key={step} className={cn("flex-1 h-1 rounded-full transition-colors", i <= progress.step ? "bg-blue-500" : "bg-white/10")} />
            ))}
          </div>
          <button onClick={handleCancel} className="flex items-center gap-1.5 text-[10px] text-destructive hover:underline">
            <StopCircle className="w-3 h-3" /> Annuler la génération
          </button>
        </div>
      )}

      {/* Result */}
      {imageUrl && !generating && (
        <div className="space-y-4 animate-fade-in">
          <div className="relative rounded-xl overflow-hidden bg-black/40 border border-white/10 max-h-[400px]">
            {imgLoading && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <div className="flex gap-1.5">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-2.5 h-2.5 rounded-full bg-blue-400/60 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              </div>
            )}
            <img
              src={imageUrl}
              alt={finalPrompt}
              loading="lazy"
              decoding="async"
              onLoad={() => setImgLoading(false)}
              onError={() => { setImgLoading(false); toast({ title: "Image indisponible", variant: "destructive" }); }}
              className="w-full h-full object-contain"
            />
          </div>

          {finalPrompt && finalPrompt !== prompt && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 backdrop-blur-sm">
              <p className="text-[10px] text-muted-foreground mb-1">Prompt enrichi par IA</p>
              <p className="text-xs text-foreground leading-relaxed">{finalPrompt}</p>
            </div>
          )}

          {/* Save form */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { setImageUrl(""); setPrompt(""); setFinalPrompt(""); setName(""); }}
              className="px-3 py-2 rounded-xl border border-white/10 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all active:scale-[0.98]"
            >
              Nouvelle
            </button>
            <input
              className="flex-1 min-w-[120px] bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/30 transition-all"
              placeholder="Nom de l'image..."
              value={name}
              onChange={e => setName(e.target.value)}
            />
            {projects.length > 0 && (
              <select
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-blue-500/30 min-w-[140px]"
              >
                <option value="">Sans projet</option>
                {projects.map(p => (
                  <option key={p.id} value={String(p.id)}>{p.name}</option>
                ))}
              </select>
            )}
            <button
              disabled={!name.trim() || !imageUrl}
              onClick={() => {
                const tags = ["image", "ai", style];
                if (projectId) tags.push(getProjectTag(projectId));
                onSave({ name: name.trim(), type: "image", url: imageUrl, content: finalPrompt || undefined, tags });
              }}
              className="px-5 py-2 bg-gradient-to-br from-blue-500 to-cyan-500 text-white rounded-xl text-xs font-medium disabled:opacity-50 hover:opacity-90 transition-all active:scale-[0.98] shadow-lg shadow-blue-500/20"
            >
              Enregistrer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Video Form ─── */
function VideoForm({ onCancel, onSave, isLoading, projects }: { onCancel: () => void; onSave: (data: AssetInput) => void; isLoading: boolean; projects: Project[] }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [generatedScript, setGeneratedScript] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"url" | "script">("url");
  const [projectId, setProjectId] = useState("");
  const { toast } = useToast();

  const [platform, setPlatform] = useState("tiktok");
  const [orchestrating, setOrchestrating] = useState(false);

  async function orchestrateVideo() {
    if (!prompt.trim() || orchestrating) return;
    setOrchestrating(true);
    try {
      const response = await fetch(`${API_BASE}/api/studio/orchestrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objective: prompt.trim(),
          type: "video",
          targetPlatform: platform,
          format: platform === "youtube" ? "long_video" : "short_video",
          project: projectId || undefined,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const plan = await response.json() as Record<string, unknown>;
      const section = (label: string, value: unknown) => value
        ? `${label}\n${typeof value === "string" ? value : JSON.stringify(value, null, 2)}`
        : "";
      setGeneratedScript([
        section("CREATIVE BRIEF", plan.creativeBrief),
        section("SCRIPT", plan.scriptPlan),
        section("STORYBOARD", plan.storyboardPlan),
        section("ASSET PLAN", plan.assetPlan),
        section("EDITING / PRODUCTION PLAN", plan.productionSteps),
        section("EXPORT TARGETS", plan.exportTargets),
        section("LIMITATIONS", plan.honestLimitations),
        section("NEXT STEPS", plan.validationChecklist),
        "La génération vidéo réelle n'est pas encore connectée.",
      ].filter(Boolean).join("\n\n"));
      setSuggestions([]);
      setActiveTab("script");
      if (!name) setName(prompt.trim().slice(0, 60));
      toast({ title: "Plan Studio créé", description: "Plan réel reçu du backend. Aucun faux fichier vidéo n'a été créé." });
    } catch (error) {
      toast({ title: "Studio indisponible", description: error instanceof Error ? error.message : "Impossible de créer le plan", variant: "destructive" });
    } finally {
      setOrchestrating(false);
    }
  }

  const canSave = name.trim() && (url.trim() || generatedScript.trim());

  return (
    <div className="bg-gradient-to-br from-violet-500/[0.07] to-fuchsia-500/[0.07] backdrop-blur-sm border border-violet-500/20 rounded-2xl p-5 animate-fade-in space-y-4 shadow-[0_0_30px_rgba(139,92,246,0.05)]">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center border border-violet-500/20">
          <Film className="w-4 h-4 text-violet-400" />
        </div>
        <span className="text-sm font-semibold text-foreground">Nouvelle vidéo</span>
        <span className="ml-auto text-[10px] px-2.5 py-1 bg-violet-500/10 text-violet-400 rounded-full border border-violet-500/20">Script IA</span>
      </div>

      <div className="flex gap-1 bg-white/5 rounded-xl p-0.5 border border-white/10">
        {[{ id: "url" as const, label: "URL YouTube" }, { id: "script" as const, label: "Script IA" }].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={cn("flex-1 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-[0.98]", activeTab === t.id ? "bg-white/10 text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>

      <input className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-violet-500/30 focus:border-violet-500/30 transition-all" placeholder="Titre de la vidéo..." value={name} onChange={e => setName(e.target.value)} />

      {activeTab === "script" && (
        <select value={platform} onChange={e => setPlatform(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none">
          <option value="tiktok">TikTok</option>
          <option value="instagram">Instagram</option>
          <option value="youtube">YouTube</option>
          <option value="linkedin">LinkedIn</option>
        </select>
      )}

      {activeTab === "url" ? (
        <input className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-violet-500/30 focus:border-violet-500/30 transition-all" placeholder="https://youtube.com/watch?v=..." value={url} onChange={e => setUrl(e.target.value)} />
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-violet-500/30 focus:border-violet-500/30 transition-all" placeholder="Décrivez votre vidéo..." value={prompt} onChange={e => setPrompt(e.target.value)} />
            <button disabled={!prompt.trim() || orchestrating} onClick={orchestrateVideo} className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white rounded-xl text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg shadow-violet-500/20 shrink-0">
              <Wand2 className={cn("w-3.5 h-3.5", orchestrating && "animate-spin")} />
              {orchestrating ? "..." : "Créer le plan"}
            </button>
          </div>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {suggestions.map(s => (
                <button key={s} onClick={() => setName(s)} className={cn("text-[10px] px-2 py-0.5 rounded-full border transition-colors active:scale-[0.98]", name === s ? "border-violet-500/50 bg-violet-500/10 text-violet-400" : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground")}>
                  {s}
                </button>
              ))}
            </div>
          )}
          {generatedScript && (
            <textarea rows={6} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-violet-500/30 focus:border-violet-500/30 resize-none leading-relaxed font-mono transition-all" value={generatedScript} onChange={e => setGeneratedScript(e.target.value)} />
          )}
        </div>
      )}

      {projects.length > 0 && (
        <select
          value={projectId}
          onChange={e => setProjectId(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-violet-500/30 transition-all"
        >
          <option value="">Sans projet</option>
          {projects.map(p => (
            <option key={p.id} value={String(p.id)}>{p.name}</option>
          ))}
        </select>
      )}

      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-white/10 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all active:scale-[0.98]">Annuler</button>
        <button
          disabled={!canSave || isLoading}
          onClick={() => {
            const tags = ["video"];
            if (projectId) tags.push(getProjectTag(projectId));
            onSave({ name: name.trim(), type: "video", url: url.trim() || undefined, content: generatedScript.trim() || undefined, tags });
          }}
          className="flex-1 py-2.5 bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white rounded-xl text-xs font-medium disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg shadow-violet-500/20"
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}

/* ─── Audio Form ─── */
function AudioForm({ onCancel, onSave, isLoading, projects }: { onCancel: () => void; onSave: (data: AssetInput) => void; isLoading: boolean; projects: Project[] }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [generatedBrief, setGeneratedBrief] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"url" | "brief">("url");
  const [projectId, setProjectId] = useState("");
  const { toast } = useToast();

  const genScript = useGenerateMediaScript({
    mutation: {
      onSuccess: (r) => {
        setGeneratedBrief(r.script);
        setSuggestions(r.suggestions ?? []);
        setActiveTab("brief");
        if (!name && r.suggestions?.[0]) setName(r.suggestions[0]);
        toast({ title: "Brief musical généré" });
      },
      onError: () => toast({ title: "Erreur de génération", variant: "destructive" }),
    },
  });

  const canSave = name.trim() && (url.trim() || generatedBrief.trim());

  return (
    <div className="bg-gradient-to-br from-emerald-500/[0.07] to-teal-500/[0.07] backdrop-blur-sm border border-emerald-500/20 rounded-2xl p-5 animate-fade-in space-y-4 shadow-[0_0_30px_rgba(16,185,129,0.05)]">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
          <Music className="w-4 h-4 text-emerald-400" />
        </div>
        <span className="text-sm font-semibold text-foreground">Nouvel audio</span>
        <span className="ml-auto text-[10px] px-2.5 py-1 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">Brief IA</span>
      </div>

      <div className="flex gap-1 bg-white/5 rounded-xl p-0.5 border border-white/10">
        {[{ id: "url" as const, label: "URL SoundCloud" }, { id: "brief" as const, label: "Brief IA" }].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={cn("flex-1 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-[0.98]", activeTab === t.id ? "bg-white/10 text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>

      <input className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-emerald-500/30 focus:border-emerald-500/30 transition-all" placeholder="Titre de la piste..." value={name} onChange={e => setName(e.target.value)} />

      {activeTab === "url" ? (
        <>
          <input className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-emerald-500/30 focus:border-emerald-500/30 transition-all" placeholder="https://soundcloud.com/..." value={url} onChange={e => setUrl(e.target.value)} />
          <p className="text-[10px] text-muted-foreground/60">SoundCloud intégré automatiquement</p>
        </>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-emerald-500/30 focus:border-emerald-500/30 transition-all" placeholder="Décrivez le style musical..." value={prompt} onChange={e => setPrompt(e.target.value)} />
            <button disabled={!prompt.trim() || genScript.isPending} onClick={() => genScript.mutate({ data: { mediaType: "audio", prompt: prompt.trim() } })} className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-br from-emerald-500 to-teal-500 text-white rounded-xl text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20 shrink-0">
              <Wand2 className={cn("w-3.5 h-3.5", genScript.isPending && "animate-spin")} />
              {genScript.isPending ? "..." : "Générer"}
            </button>
          </div>
          {generatedBrief && (
            <textarea rows={6} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-emerald-500/30 focus:border-emerald-500/30 resize-none leading-relaxed font-mono transition-all" value={generatedBrief} onChange={e => setGeneratedBrief(e.target.value)} />
          )}
        </div>
      )}

      {projects.length > 0 && (
        <select
          value={projectId}
          onChange={e => setProjectId(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-emerald-500/30 transition-all"
        >
          <option value="">Sans projet</option>
          {projects.map(p => (
            <option key={p.id} value={String(p.id)}>{p.name}</option>
          ))}
        </select>
      )}

      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-white/10 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all active:scale-[0.98]">Annuler</button>
        <button
          disabled={!canSave || isLoading}
          onClick={() => {
            const tags = ["audio"];
            if (projectId) tags.push(getProjectTag(projectId));
            onSave({ name: name.trim(), type: "audio", url: url.trim() || undefined, content: generatedBrief.trim() || undefined, tags });
          }}
          className="flex-1 py-2.5 bg-gradient-to-br from-emerald-500 to-teal-500 text-white rounded-xl text-xs font-medium disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20"
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}

/* ─── Generic Form ─── */
function GenericForm({ type, onCancel, onSave, isLoading, projects }: { type: AssetType; onCancel: () => void; onSave: (data: AssetInput) => void; isLoading: boolean; projects: Project[] }) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [projectId, setProjectId] = useState("");
  const t = TYPES.find(x => x.value === type) ?? TYPES[0];
  const needsContent = ["prompt", "template", "document", "result"].includes(type);

  return (
    <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] rounded-2xl p-5 animate-fade-in space-y-4 shadow-[0_0_30px_rgba(255,255,255,0.03)]">
      <div className="flex items-center gap-2 mb-1">
        <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center border border-white/10 backdrop-blur-sm", t.color)}>
          <t.icon className={cn("w-4 h-4", t.color.split(" ")[0])} />
        </div>
        <span className="text-sm font-semibold text-foreground">Nouveau : {t.label}</span>
      </div>
      <input autoFocus className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring focus:border-ring/50 transition-all" placeholder="Nom..." value={name} onChange={e => setName(e.target.value)} />
      {needsContent && (
        <textarea rows={4} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring focus:border-ring/50 resize-none transition-all" placeholder="Contenu..." value={content} onChange={e => setContent(e.target.value)} />
      )}
      {projects.length > 0 && (
        <select
          value={projectId}
          onChange={e => setProjectId(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring transition-all"
        >
          <option value="">Sans projet</option>
          {projects.map(p => (
            <option key={p.id} value={String(p.id)}>{p.name}</option>
          ))}
        </select>
      )}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-white/10 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all active:scale-[0.98]">Annuler</button>
        <button
          disabled={!name.trim() || isLoading}
          onClick={() => {
            const tags: string[] = [];
            if (projectId) tags.push(getProjectTag(projectId));
            onSave({ name: name.trim(), type, content: content.trim() || undefined, tags: tags.length > 0 ? tags : undefined });
          }}
          className="flex-1 py-2.5 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground rounded-xl text-xs font-medium disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg"
        >
          Créer
        </button>
      </div>
    </div>
  );
}

/* ─── Engines Panel ─── */
function EnginesPanel() {
  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-xs font-semibold text-foreground">Moteurs créatifs</span>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {ENGINES.map(engine => (
          <div key={engine.id} className={cn(
            "flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs transition-all",
            engine.status === "ready" ? "bg-emerald-500/5 border border-emerald-500/10" : "bg-white/5 border border-transparent opacity-60"
          )}>
            <engine.icon className={cn("w-3.5 h-3.5 shrink-0", engine.type === "image" ? "text-blue-400" : engine.type === "video" ? "text-violet-400" : "text-emerald-400")} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-foreground">{engine.name}</span>
                <span className={cn("text-[9px] px-1.5 py-0 rounded-full", engine.status === "ready" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-white/5 text-muted-foreground")}>
                  {engine.status === "ready" ? "Prêt" : "Bientôt"}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground truncate">{engine.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Main Studio Page ─── */
export default function Studio() {
  const [activeType, setActiveType] = useState<AssetType | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [selectedFormType, setSelectedFormType] = useState<AssetType>("prompt");
  const [showChat, setShowChat] = useState(true);
  const [chatMobileOpen, setChatMobileOpen] = useState(false);
  const [chatPrompt, setChatPrompt] = useState("");
  const [generationHistory, setGenerationHistory] = useState<GenerationRecord[]>(loadHistory);
  const [detailAsset, setDetailAsset] = useState<any>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: assets = [], isLoading } = useListAssets(
    activeType !== "all" ? { type: activeType } : undefined
  );
  const { data: projects = [] } = useListProjects();

  const create = useCreateAsset({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListAssetsQueryKey() });
        setShowForm(false);
        toast({ title: "Asset enregistré" });
      },
    },
  });

  const update = useUpdateAsset({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListAssetsQueryKey() });
        toast({ title: "Asset mis à jour" });
      },
    },
  });

  const del = useDeleteAsset({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListAssetsQueryKey() });
        toast({ title: "Asset supprimé" });
      },
    },
  });

  function openForm(type: AssetType) {
    setSelectedFormType(type);
    setShowForm(true);
  }

  async function handleSave(data: AssetInput) {
    if (data.type === "image" && data.url) {
      create.mutate({ data });
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/api/studio/orchestrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objective: data.content?.trim() || data.name,
          type: data.type,
          format: data.type,
          targetPlatform: "generic",
          project: data.tags?.find(tag => tag.startsWith("project:")),
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const plan = await response.json();
      create.mutate({
        data: {
          ...data,
          content: JSON.stringify(plan, null, 2),
          tags: [...(data.tags ?? []), "studio-orchestrated"],
        },
      });
    } catch (error) {
      toast({
        title: "Création interrompue",
        description: error instanceof Error ? error.message : "Le backend Studio est indisponible. Aucun faux résultat n'a été enregistré.",
        variant: "destructive",
      });
    }
  }

  function handleChatGenerateImage(prompt: string) {
    setChatPrompt(prompt);
    setShowForm(true);
    setSelectedFormType("image");
  }

  function handleHistoryAdd(record: GenerationRecord) {
    setGenerationHistory(prev => {
      const next = [...prev, record];
      saveHistory(next);
      return next;
    });
  }

  function handleRegenerate(prompt: string) {
    setChatPrompt(prompt);
    setShowForm(true);
    setSelectedFormType("image");
  }

  function handleUploadedFile(file: File, previewUrl: string) {
    const type: AssetType = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "audio";
    handleSave({
      name: file.name,
      type,
      url: previewUrl,
      tags: [type, "upload"],
    });
  }

  function handleDuplicateAsset(asset: Asset) {
    const { id, createdAt, updatedAt, ...rest } = asset;
    create.mutate({
      data: {
        name: rest.name,
        type: rest.type as AssetInput["type"],
        url: rest.url ?? undefined,
        content: rest.content ?? undefined,
        mimeType: rest.mimeType ?? undefined,
        size: rest.size ?? undefined,
        tags: rest.tags,
      }
    });
    setDetailAsset(null);
    toast({ title: "Asset dupliqué" });
  }

  // Pass chatPrompt to ImageGenerator when appropriate
  useEffect(() => {
    if (chatPrompt && selectedFormType === "image") {
      setChatPrompt("");
    }
  }, [chatPrompt, selectedFormType]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden animate-fade-in pb-28 md:pb-6">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 shrink-0 border-b border-white/5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center border border-blue-500/20 shrink-0">
              <Palette className="w-4 h-4 text-blue-400" />
            </div>
            <h1 className="text-lg font-semibold text-foreground tracking-tight truncate">Studio Créatif</h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <UploadZone onUploaded={handleUploadedFile} />
            <button
              onClick={() => {
                if (window.innerWidth < 1024) {
                  setChatMobileOpen(true);
                } else {
                  setShowChat(!showChat);
                }
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-[0.98] backdrop-blur-sm border",
                showChat ? "bg-gradient-to-br from-blue-500 to-cyan-500 text-white border-transparent shadow-lg shadow-blue-500/20" : "bg-white/5 text-muted-foreground hover:text-foreground border-white/10 hover:border-white/20"
              )}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {showChat ? "Masquer l'IA" : "Studio AI"}
            </button>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => openForm("image")} className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl text-xs font-medium hover:bg-blue-500/20 transition-all active:scale-[0.98] backdrop-blur-sm">
                <Image className="w-3.5 h-3.5" /> Image
              </button>
              <button onClick={() => openForm("video")} className="flex items-center gap-1 px-2.5 py-1.5 bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded-xl text-xs font-medium hover:bg-violet-500/20 transition-all active:scale-[0.98] backdrop-blur-sm">
                <Film className="w-3.5 h-3.5" /> Vidéo
              </button>
              <button onClick={() => openForm("audio")} className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs font-medium hover:bg-emerald-500/20 transition-all active:scale-[0.98] backdrop-blur-sm">
                <Music className="w-3.5 h-3.5" /> Audio
              </button>
              <button onClick={() => openForm("prompt")} className="flex items-center gap-1 px-2.5 py-1.5 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground rounded-xl text-xs font-medium hover:opacity-90 transition-all active:scale-[0.98] shadow-lg">
                <Plus className="w-3.5 h-3.5" /> Créer
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <button onClick={() => setActiveType("all")} className={cn("px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-all active:scale-[0.98] backdrop-blur-sm border", activeType === "all" ? "bg-primary text-primary-foreground border-transparent shadow-lg" : "bg-white/5 text-muted-foreground border-white/10 hover:border-white/20 hover:text-foreground")}>
            Tous
          </button>
          {TYPES.map(t => (
            <button key={t.value} onClick={() => { setActiveType(t.value); setShowForm(false); }} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-all active:scale-[0.98] backdrop-blur-sm border", activeType === t.value ? t.color + " shadow-lg" : "bg-white/5 text-muted-foreground border-white/10 hover:border-white/20 hover:text-foreground")}>
              <t.icon className="w-3 h-3" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat sidebar — desktop (lg+) */}
        {showChat && (
          <div className="w-80 shrink-0 hidden lg:flex flex-col border-r border-white/5">
            <StudioChat onGenerateImage={handleChatGenerateImage} onCreateAsset={(type, data) => handleSave(data)} selectedType={activeType !== "all" ? activeType : undefined} />
          </div>
        )}

        {/* Chat overlay — mobile/tablette */}
        {chatMobileOpen && (
          <div className="fixed inset-0 z-40 flex flex-col bg-background lg:hidden" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <span className="text-sm font-semibold">Studio AI</span>
              <button
                onClick={() => setChatMobileOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10"
                aria-label="Fermer le chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col">
              <StudioChat onGenerateImage={handleChatGenerateImage} onCreateAsset={(type, data) => handleSave(data)} selectedType={activeType !== "all" ? activeType : undefined} />
            </div>
          </div>
        )}

        {/* Main canvas */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Quick actions */}
          {!showForm && !isLoading && assets.length === 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 stagger-up">
              {[
                { type: "image" as AssetType, icon: Image, label: "Image IA", color: "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20", desc: "Générer" },
                { type: "video" as AssetType, icon: Film, label: "Script vidéo", color: "bg-violet-500/10 text-violet-400 hover:bg-violet-500/20", desc: "Rédiger" },
                { type: "audio" as AssetType, icon: Music, label: "Brief audio", color: "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20", desc: "Composer" },
                { type: "prompt" as AssetType, icon: Sparkles, label: "Prompt", color: "bg-pink-500/10 text-pink-400 hover:bg-pink-500/20", desc: "Structurer" },
              ].map(action => (
                <button key={action.type} onClick={() => openForm(action.type)} className={cn("flex flex-col items-center gap-2 p-4 rounded-2xl border border-white/10 transition-all duration-300 active:scale-[0.98] hover:border-white/20 hover:shadow-[0_0_20px_rgba(255,255,255,0.05)] hover-lift", action.color)}>
                  <action.icon className="w-6 h-6" />
                  <span className="text-xs font-medium">{action.label}</span>
                  <span className="text-[10px] opacity-70">{action.desc}</span>
                </button>
              ))}
            </div>
          )}

          {/* Forms */}
          {showForm && (
            <div className="max-w-2xl mx-auto space-y-4">
              {selectedFormType === "video" ? (
                <>
                  <ProductVideoMaker />
                  <VideoForm onCancel={() => setShowForm(false)} onSave={handleSave} isLoading={create.isPending} projects={projects} />
                </>
              ) : selectedFormType === "audio" ? (
                <>
                  <MusicMaker />
                  <AudioForm onCancel={() => setShowForm(false)} onSave={handleSave} isLoading={create.isPending} projects={projects} />
                </>
              ) : selectedFormType === "image" ? (
                <ImageGenerator onSave={handleSave} onHistoryAdd={handleHistoryAdd} initialPrompt={chatPrompt} projects={projects} />
              ) : (
                <GenericForm type={selectedFormType} onCancel={() => setShowForm(false)} onSave={handleSave} isLoading={create.isPending} projects={projects} />
              )}
            </div>
          )}

          {/* Assets masonry */}
          {isLoading ? (
            <SkeletonGrid />
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 flex items-center justify-center mb-4 border border-blue-500/20">
                <Palette className="w-8 h-8 text-blue-400/50" />
              </div>
              <p className="text-sm text-muted-foreground mb-1">Votre studio est vide</p>
              <p className="text-xs text-muted-foreground/60">Utilisez le chat IA ou les boutons ci-dessus pour créer</p>
            </div>
          ) : (
            <MasonryGallery assets={assets} onDelete={(id) => del.mutate({ id: Number(id) })} projects={projects} onOpenDetail={setDetailAsset} />
          )}
        </div>

        {/* Right sidebar (desktop) */}
        <div className="w-64 shrink-0 hidden xl:flex flex-col border-l border-white/5 p-4 overflow-y-auto gap-4">
          <EnginesPanel />
          <HistoryPanel onRegenerate={handleRegenerate} />
        </div>
      </div>

      {/* Asset Detail Modal */}
      {detailAsset && (
        <AssetDetailModal
          asset={detailAsset}
          projects={projects}
          onClose={() => setDetailAsset(null)}
          onDelete={() => { del.mutate({ id: Number(detailAsset.id) }); setDetailAsset(null); }}
          onDuplicate={() => handleDuplicateAsset(detailAsset)}
        />
      )}
    </div>
  );
}
