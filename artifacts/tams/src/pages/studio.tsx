import { useState, useRef, useEffect } from "react";
import {
  useListAssets, useCreateAsset, useDeleteAsset, useGenerateMediaScript,
  getListAssetsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus, Image, Film, Mic, FileText, Sparkles, Layout, Star, Trash2, Wand2,
  Link, ExternalLink, Copy, Check, Send, MessageSquare, Palette, Bot,
  ChevronRight, Download, Maximize2, X, Lightbulb, Wrench, Zap, Music
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? "";

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

function getYoutubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
  return m ? m[1] : null;
}

/* ─── Studio Chat ─── */
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tool?: string;
  imageUrl?: string;
}

function StudioChat({ onGenerateImage, onCreateAsset }: {
  onGenerateImage: (prompt: string) => void;
  onCreateAsset: (type: AssetType, data: any) => void;
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

    // Simulated assistant response with creative detection
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

  return (
    <div className="flex flex-col h-full bg-card/50 border-r border-border">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Bot className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Studio AI</span>
        <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full">En ligne</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map(msg => (
          <div key={msg.id} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
            {msg.role === "assistant" && (
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-3 h-3 text-primary" />
              </div>
            )}
            <div className={cn(
              "max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed",
              msg.role === "user"
                ? "bg-primary text-primary-foreground rounded-br-md"
                : "bg-secondary text-foreground rounded-bl-md"
            )}>
              {msg.content.split("\n").map((line, i) => (
                <p key={i} className={cn(i > 0 && "mt-1")}>{line}</p>
              ))}
              {msg.tool === "generate-image" && (
                <div className="mt-2 flex items-center gap-1 text-[10px] text-emerald-400">
                  <Zap className="w-3 h-3" />
                  Génération en cours...
                </div>
              )}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="w-3 h-3 text-primary" />
            </div>
            <div className="bg-secondary rounded-2xl rounded-bl-md px-3 py-2 flex gap-1">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t border-border">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSend()}
            placeholder="Décrivez votre création..."
            className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex gap-1 mt-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {["Génère un portrait cyberpunk", "Script vidéo 2 min", "Brief audio lo-fi", "Prompt optimisé"].map(suggestion => (
            <button
              key={suggestion}
              onClick={() => { setInput(suggestion); }}
              className="px-2 py-1 rounded-md bg-secondary text-[10px] text-muted-foreground hover:text-foreground whitespace-nowrap transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Asset Card ─── */
function AssetCard({ asset, onDelete }: { asset: any; onDelete: () => void }) {
  const t = TYPES.find(x => x.value === asset.type) ?? TYPES[0];
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const ytId = asset.url ? getYoutubeId(asset.url) : null;

  function copyContent() {
    if (asset.content) {
      navigator.clipboard.writeText(asset.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <>
      <div data-testid={`asset-item-${asset.id}`} className="bg-card border border-card-border rounded-xl overflow-hidden group hover:border-border/80 transition-all hover:shadow-lg hover:shadow-black/5">
        {asset.type === "image" && asset.url && (
          <div className="relative aspect-square bg-black/40 overflow-hidden cursor-pointer" onClick={() => setExpanded(true)}>
            <img src={asset.url} alt={asset.name} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
              <Maximize2 className="w-6 h-6 text-white/80" />
            </div>
          </div>
        )}
        {asset.type === "video" && ytId && (
          <div className="aspect-video bg-black">
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

        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", t.color)}>
              <t.icon className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
              {asset.content && (
                <button onClick={copyContent} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
              {asset.url && !ytId && (
                <a href={asset.url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              <button onClick={onDelete} className="p-1.5 rounded-lg hover:text-destructive text-muted-foreground transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="text-sm font-medium text-foreground mb-1">{asset.name}</div>
          {asset.content && (
            <div className="text-xs text-muted-foreground line-clamp-3 leading-relaxed whitespace-pre-wrap">{asset.content}</div>
          )}
          {(asset.tags as string[]).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {(asset.tags as string[]).map((tag: string) => (
                <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-secondary text-muted-foreground rounded-full">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {expanded && asset.type === "image" && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setExpanded(false)}>
          <button className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">
            <X className="w-5 h-5" />
          </button>
          <img src={asset.url} alt={asset.name} className="max-w-full max-h-[90vh] object-contain rounded-lg" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}

/* ─── Image Generator ─── */
function ImageGenerator({ onSave }: { onSave: (data: any) => void }) {
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [finalPrompt, setFinalPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [imgLoading, setImgLoading] = useState(false);
  const [name, setName] = useState("");
  const { toast } = useToast();

  async function generate() {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setImgLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/studio/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setImageUrl(data.url);
      setFinalPrompt(data.prompt ?? prompt.trim());
      if (!name) setName(prompt.trim().slice(0, 40));
      toast({ title: data.enhanced ? "Image générée (prompt enrichi)" : "Image générée" });
    } catch {
      toast({ title: "Échec de la génération", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="bg-gradient-to-br from-blue-500/5 to-cyan-500/5 border border-blue-500/10 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Image className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-semibold text-foreground">Générateur d'images</span>
        <span className="ml-auto text-[10px] px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20">Pollinations · Flux</span>
      </div>

      <div className="flex gap-2">
        <input
          autoFocus
          className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring focus:ring-blue-500/30"
          placeholder="Décrivez l'image voulue en détail..."
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") generate(); }}
        />
        <button
          disabled={!prompt.trim() || generating}
          onClick={generate}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors shrink-0"
        >
          <Wand2 className={cn("w-3.5 h-3.5", generating && "animate-spin")} />
          {generating ? "Génération..." : "Générer"}
        </button>
      </div>

      {imageUrl && (
        <div className="space-y-3 animate-fade-in">
          <div className="relative aspect-square rounded-xl overflow-hidden bg-black/40 border border-border max-h-[400px]">
            {imgLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
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
              onLoad={() => setImgLoading(false)}
              onError={() => { setImgLoading(false); toast({ title: "Image indisponible", variant: "destructive" }); }}
              className="w-full h-full object-contain"
            />
          </div>

          {finalPrompt && finalPrompt !== prompt && (
            <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground mb-1">Prompt enrichi par IA</p>
              <p className="text-xs text-foreground leading-relaxed">{finalPrompt}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => { setImageUrl(""); setPrompt(""); setFinalPrompt(""); setName(""); }}
              className="px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Nouvelle
            </button>
            <input
              className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
              placeholder="Nom de l'image..."
              value={name}
              onChange={e => setName(e.target.value)}
            />
            <button
              disabled={!name.trim() || !imageUrl}
              onClick={() => onSave({ name: name.trim(), type: "image", url: imageUrl, content: finalPrompt || undefined, tags: ["image", "ai"] })}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
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
function VideoForm({ onCancel, onSave, isLoading }: { onCancel: () => void; onSave: (data: any) => void; isLoading: boolean }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [generatedScript, setGeneratedScript] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"url" | "script">("url");
  const { toast } = useToast();

  const genScript = useGenerateMediaScript({
    mutation: {
      onSuccess: (r) => {
        setGeneratedScript(r.script);
        setSuggestions(r.suggestions ?? []);
        setActiveTab("script");
        if (!name && r.suggestions?.[0]) setName(r.suggestions[0]);
        toast({ title: "Script généré par IA" });
      },
      onError: () => toast({ title: "Erreur de génération", variant: "destructive" }),
    },
  });

  const canSave = name.trim() && (url.trim() || generatedScript.trim());

  return (
    <div className="bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 border border-violet-500/10 rounded-xl p-4 animate-fade-in space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Film className="w-4 h-4 text-violet-400" />
        <span className="text-sm font-semibold text-foreground">Nouvelle vidéo</span>
        <span className="ml-auto text-[10px] px-2 py-0.5 bg-violet-500/10 text-violet-400 rounded-full border border-violet-500/20">Script IA</span>
      </div>

      <div className="flex gap-1 bg-secondary rounded-lg p-0.5">
        {[{ id: "url" as const, label: "URL YouTube" }, { id: "script" as const, label: "Script IA" }].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={cn("flex-1 py-1.5 rounded-md text-xs font-medium transition-all", activeTab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>

      <input className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring" placeholder="Titre de la vidéo..." value={name} onChange={e => setName(e.target.value)} />

      {activeTab === "url" ? (
        <input className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring" placeholder="https://youtube.com/watch?v=..." value={url} onChange={e => setUrl(e.target.value)} />
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring" placeholder="Décrivez votre vidéo..." value={prompt} onChange={e => setPrompt(e.target.value)} />
            <button disabled={!prompt.trim() || genScript.isPending} onClick={() => genScript.mutate({ data: { mediaType: "video", prompt: prompt.trim() } })} className="flex items-center gap-1.5 px-3 py-2 bg-violet-500 text-white rounded-lg text-xs font-medium hover:bg-violet-600 disabled:opacity-50 transition-colors shrink-0">
              <Wand2 className={cn("w-3.5 h-3.5", genScript.isPending && "animate-spin")} />
              {genScript.isPending ? "..." : "Générer"}
            </button>
          </div>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {suggestions.map(s => (
                <button key={s} onClick={() => setName(s)} className={cn("text-[10px] px-2 py-0.5 rounded-full border transition-colors", name === s ? "border-violet-500/50 bg-violet-500/10 text-violet-400" : "border-border bg-secondary text-muted-foreground hover:text-foreground")}>
                  {s}
                </button>
              ))}
            </div>
          )}
          {generatedScript && (
            <textarea rows={6} className="w-full bg-input border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring resize-none leading-relaxed font-mono" value={generatedScript} onChange={e => setGeneratedScript(e.target.value)} />
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground">Annuler</button>
        <button disabled={!canSave || isLoading} onClick={() => onSave({ name: name.trim(), type: "video", url: url.trim() || undefined, content: generatedScript.trim() || undefined, tags: ["video"] })} className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50">Enregistrer</button>
      </div>
    </div>
  );
}

/* ─── Audio Form ─── */
function AudioForm({ onCancel, onSave, isLoading }: { onCancel: () => void; onSave: (data: any) => void; isLoading: boolean }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [generatedBrief, setGeneratedBrief] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"url" | "brief">("url");
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
    <div className="bg-gradient-to-br from-emerald-500/5 to-teal-500/5 border border-emerald-500/10 rounded-xl p-4 animate-fade-in space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Music className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-semibold text-foreground">Nouvel audio</span>
        <span className="ml-auto text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">Brief IA</span>
      </div>

      <div className="flex gap-1 bg-secondary rounded-lg p-0.5">
        {[{ id: "url" as const, label: "URL SoundCloud" }, { id: "brief" as const, label: "Brief IA" }].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={cn("flex-1 py-1.5 rounded-md text-xs font-medium transition-all", activeTab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>

      <input className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring" placeholder="Titre de la piste..." value={name} onChange={e => setName(e.target.value)} />

      {activeTab === "url" ? (
        <>
          <input className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring" placeholder="https://soundcloud.com/..." value={url} onChange={e => setUrl(e.target.value)} />
          <p className="text-[10px] text-muted-foreground">SoundCloud intégré automatiquement</p>
        </>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring" placeholder="Décrivez le style musical..." value={prompt} onChange={e => setPrompt(e.target.value)} />
            <button disabled={!prompt.trim() || genScript.isPending} onClick={() => genScript.mutate({ data: { mediaType: "audio", prompt: prompt.trim() } })} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 text-white rounded-lg text-xs font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors shrink-0">
              <Wand2 className={cn("w-3.5 h-3.5", genScript.isPending && "animate-spin")} />
              {genScript.isPending ? "..." : "Générer"}
            </button>
          </div>
          {generatedBrief && (
            <textarea rows={6} className="w-full bg-input border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring resize-none leading-relaxed font-mono" value={generatedBrief} onChange={e => setGeneratedBrief(e.target.value)} />
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground">Annuler</button>
        <button disabled={!canSave || isLoading} onClick={() => onSave({ name: name.trim(), type: "audio", url: url.trim() || undefined, content: generatedBrief.trim() || undefined, tags: ["audio"] })} className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50">Enregistrer</button>
      </div>
    </div>
  );
}

/* ─── Generic Form ─── */
function GenericForm({ type, onCancel, onSave, isLoading }: { type: AssetType; onCancel: () => void; onSave: (data: any) => void; isLoading: boolean }) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const t = TYPES.find(x => x.value === type) ?? TYPES[0];
  const needsContent = ["prompt", "template", "document", "result"].includes(type);

  return (
    <div className="bg-card border border-card-border rounded-xl p-4 animate-fade-in space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <t.icon className={cn("w-4 h-4", t.color.split(" ")[0])} />
        <span className="text-sm font-semibold text-foreground">Nouveau : {t.label}</span>
      </div>
      <input autoFocus className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring" placeholder="Nom..." value={name} onChange={e => setName(e.target.value)} />
      {needsContent && (
        <textarea rows={4} className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring resize-none" placeholder="Contenu..." value={content} onChange={e => setContent(e.target.value)} />
      )}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 rounded-lg border border-border text-xs text-muted-foreground">Annuler</button>
        <button disabled={!name.trim() || isLoading} onClick={() => onSave({ name: name.trim(), type, content: content.trim() || undefined })} className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50">Créer</button>
      </div>
    </div>
  );
}

/* ─── Engines Panel ─── */
function EnginesPanel() {
  return (
    <div className="bg-card/50 border border-border rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-xs font-semibold text-foreground">Moteurs créatifs</span>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {ENGINES.map(engine => (
          <div key={engine.id} className={cn(
            "flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors",
            engine.status === "ready" ? "bg-emerald-500/5 border border-emerald-500/10" : "bg-secondary/50 border border-transparent opacity-60"
          )}>
            <engine.icon className={cn("w-3.5 h-3.5 shrink-0", engine.type === "image" ? "text-blue-400" : engine.type === "video" ? "text-violet-400" : "text-emerald-400")} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-foreground">{engine.name}</span>
                <span className={cn("text-[9px] px-1 py-0 rounded-full", engine.status === "ready" ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground")}>
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
  const [chatPrompt, setChatPrompt] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: assets = [], isLoading } = useListAssets(
    activeType !== "all" ? { type: activeType } : undefined
  );

  const create = useCreateAsset({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListAssetsQueryKey() });
        setShowForm(false);
        toast({ title: "Asset enregistré" });
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

  function handleSave(data: any) {
    create.mutate({ data });
  }

  function handleChatGenerateImage(prompt: string) {
    setChatPrompt(prompt);
    setShowForm(true);
    setSelectedFormType("image");
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 shrink-0 border-b border-border/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground tracking-tight">Studio Créatif</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowChat(!showChat)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                showChat ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {showChat ? "Masquer l'IA" : "Studio AI"}
            </button>
            <div className="flex gap-1.5">
              <button onClick={() => openForm("image")} className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-medium hover:bg-blue-500/20 transition-colors">
                <Image className="w-3.5 h-3.5" /> Image
              </button>
              <button onClick={() => openForm("video")} className="flex items-center gap-1 px-2.5 py-1.5 bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded-lg text-xs font-medium hover:bg-violet-500/20 transition-colors">
                <Film className="w-3.5 h-3.5" /> Vidéo
              </button>
              <button onClick={() => openForm("audio")} className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-medium hover:bg-emerald-500/20 transition-colors">
                <Music className="w-3.5 h-3.5" /> Audio
              </button>
              <button onClick={() => openForm("prompt")} className="flex items-center gap-1 px-2.5 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-opacity">
                <Plus className="w-3.5 h-3.5" /> Créer
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <button onClick={() => setActiveType("all")} className={cn("px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors", activeType === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>
            Tous
          </button>
          {TYPES.map(t => (
            <button key={t.value} onClick={() => { setActiveType(t.value); setShowForm(false); }} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors", activeType === t.value ? t.color : "bg-secondary text-muted-foreground hover:text-foreground")}>
              <t.icon className="w-3 h-3" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat sidebar */}
        {showChat && (
          <div className="w-80 shrink-0 hidden lg:flex flex-col border-r border-border">
            <StudioChat onGenerateImage={handleChatGenerateImage} onCreateAsset={handleSave} />
          </div>
        )}

        {/* Main canvas */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 pb-24 md:pb-6 space-y-4">
          {/* Quick actions */}
          {!showForm && !isLoading && assets.length === 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                { type: "image" as AssetType, icon: Image, label: "Image IA", color: "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20", desc: "Générer" },
                { type: "video" as AssetType, icon: Film, label: "Script vidéo", color: "bg-violet-500/10 text-violet-400 hover:bg-violet-500/20", desc: "Rédiger" },
                { type: "audio" as AssetType, icon: Music, label: "Brief audio", color: "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20", desc: "Composer" },
                { type: "prompt" as AssetType, icon: Sparkles, label: "Prompt", color: "bg-pink-500/10 text-pink-400 hover:bg-pink-500/20", desc: "Structurer" },
              ].map(action => (
                <button key={action.type} onClick={() => openForm(action.type)} className={cn("flex flex-col items-center gap-2 p-4 rounded-xl border border-transparent transition-all", action.color)}>
                  <action.icon className="w-6 h-6" />
                  <span className="text-xs font-medium">{action.label}</span>
                  <span className="text-[10px] opacity-70">{action.desc}</span>
                </button>
              ))}
            </div>
          )}

          {/* Forms */}
          {showForm && (
            <div className="max-w-2xl mx-auto">
              {selectedFormType === "video" ? (
                <VideoForm onCancel={() => setShowForm(false)} onSave={handleSave} isLoading={create.isPending} />
              ) : selectedFormType === "audio" ? (
                <AudioForm onCancel={() => setShowForm(false)} onSave={handleSave} isLoading={create.isPending} />
              ) : selectedFormType === "image" ? (
                <ImageGenerator onSave={handleSave} />
              ) : (
                <GenericForm type={selectedFormType} onCancel={() => setShowForm(false)} onSave={handleSave} isLoading={create.isPending} />
              )}
            </div>
          )}

          {/* Assets grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => <div key={i} className="h-36 bg-card rounded-xl animate-pulse" />)}
            </div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center mb-4">
                <Palette className="w-8 h-8 text-primary/30" />
              </div>
              <p className="text-sm text-muted-foreground mb-1">Votre studio est vide</p>
              <p className="text-xs text-muted-foreground/60">Utilisez le chat IA ou les boutons ci-dessus pour créer</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger">
              {assets.map(asset => (
                <AssetCard key={asset.id} asset={asset} onDelete={() => del.mutate({ id: asset.id })} />
              ))}
            </div>
          )}
        </div>

        {/* Engines sidebar (desktop) */}
        <div className="w-64 shrink-0 hidden xl:block border-l border-border p-4 overflow-y-auto">
          <EnginesPanel />
        </div>
      </div>
    </div>
  );
}
