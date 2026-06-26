import { useState } from "react";
import {
  useListAssets, useCreateAsset, useDeleteAsset, useGenerateMediaScript,
  getListAssetsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Image, Film, Mic, FileText, Sparkles, Layout, Star, Trash2, Wand2, Link, Play, Music, ExternalLink, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type AssetType = "image" | "video" | "audio" | "document" | "prompt" | "template" | "result";

const TYPES: { value: AssetType; label: string; icon: React.ElementType; color: string }[] = [
  { value: "image", label: "Photos", icon: Image, color: "text-blue-400 bg-blue-500/10" },
  { value: "video", label: "Vidéos", icon: Film, color: "text-violet-400 bg-violet-500/10" },
  { value: "audio", label: "Audio", icon: Music, color: "text-emerald-400 bg-emerald-500/10" },
  { value: "document", label: "Documents", icon: FileText, color: "text-amber-400 bg-amber-500/10" },
  { value: "prompt", label: "Prompts", icon: Sparkles, color: "text-pink-400 bg-pink-500/10" },
  { value: "template", label: "Templates", icon: Layout, color: "text-cyan-400 bg-cyan-500/10" },
  { value: "result", label: "Résultats", icon: Star, color: "text-orange-400 bg-orange-500/10" },
];

function getYoutubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
  return m ? m[1] : null;
}

function AssetCard({ asset, onDelete }: { asset: any; onDelete: () => void }) {
  const t = TYPES.find(x => x.value === asset.type) ?? TYPES[0];
  const [copied, setCopied] = useState(false);
  const ytId = asset.url ? getYoutubeId(asset.url) : null;

  function copyContent() {
    if (asset.content) {
      navigator.clipboard.writeText(asset.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div data-testid={`asset-item-${asset.id}`} className="bg-card border border-card-border rounded-xl overflow-hidden group hover:border-border/80 transition-colors">
      {/* Video embed */}
      {asset.type === "video" && ytId && (
        <div className="aspect-video bg-black">
          <iframe
            src={`https://www.youtube.com/embed/${ytId}`}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
      {/* Audio player */}
      {asset.type === "audio" && asset.url && (
        <div className="px-4 pt-4">
          {asset.url.includes("soundcloud.com") ? (
            <iframe
              width="100%"
              height="60"
              src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(asset.url)}&color=%232563eb&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&show_teaser=false`}
              className="rounded-lg"
            />
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
              <button data-testid={`button-copy-asset-${asset.id}`} onClick={copyContent} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            )}
            {asset.url && !ytId && (
              <a href={asset.url} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <button data-testid={`button-delete-asset-${asset.id}`} onClick={onDelete} className="p-1 rounded hover:text-destructive text-muted-foreground transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="text-sm font-medium text-foreground mb-1">{asset.name}</div>
        {asset.url && asset.type !== "video" && !asset.url.includes("soundcloud.com") && (
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Link className="w-3 h-3 shrink-0" />
            <span className="truncate">{asset.url}</span>
          </div>
        )}
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
  );
}

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
    <div className="bg-card border border-card-border rounded-xl p-4 animate-fade-in space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Film className="w-4 h-4 text-violet-400" />
        <span className="text-sm font-semibold text-foreground">Nouvelle vidéo</span>
      </div>

      <div className="flex gap-1 bg-secondary rounded-lg p-0.5">
        {[{ id: "url" as const, label: "URL YouTube/Vimeo" }, { id: "script" as const, label: "Script IA" }].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={cn("flex-1 py-1.5 rounded-md text-xs font-medium transition-all", activeTab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>

      <input data-testid="input-video-name" className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring" placeholder="Titre de la vidéo..." value={name} onChange={e => setName(e.target.value)} />

      {activeTab === "url" ? (
        <input data-testid="input-video-url" className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring" placeholder="https://youtube.com/watch?v=..." value={url} onChange={e => setUrl(e.target.value)} />
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input data-testid="input-video-prompt" className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring" placeholder="Décrivez votre vidéo..." value={prompt} onChange={e => setPrompt(e.target.value)} />
            <button data-testid="button-generate-video-script" disabled={!prompt.trim() || genScript.isPending} onClick={() => genScript.mutate({ data: { mediaType: "video", prompt: prompt.trim() } })} className="flex items-center gap-1.5 px-3 py-2 bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded-lg text-xs font-medium hover:bg-violet-500/20 disabled:opacity-50 transition-colors shrink-0">
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
            <textarea data-testid="textarea-video-script" rows={6} className="w-full bg-input border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring resize-none leading-relaxed font-mono" value={generatedScript} onChange={e => setGeneratedScript(e.target.value)} />
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground">Annuler</button>
        <button data-testid="button-save-video" disabled={!canSave || isLoading} onClick={() => onSave({ name: name.trim(), type: "video", url: url.trim() || undefined, content: generatedScript.trim() || undefined, tags: ["video"] })} className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50">Enregistrer</button>
      </div>
    </div>
  );
}

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
        toast({ title: "Brief musical généré par IA" });
      },
      onError: () => toast({ title: "Erreur de génération", variant: "destructive" }),
    },
  });

  const canSave = name.trim() && (url.trim() || generatedBrief.trim());

  return (
    <div className="bg-card border border-card-border rounded-xl p-4 animate-fade-in space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Music className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-semibold text-foreground">Nouvel audio</span>
      </div>

      <div className="flex gap-1 bg-secondary rounded-lg p-0.5">
        {[{ id: "url" as const, label: "URL SoundCloud/Spotify" }, { id: "brief" as const, label: "Brief IA" }].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={cn("flex-1 py-1.5 rounded-md text-xs font-medium transition-all", activeTab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>

      <input data-testid="input-audio-name" className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring" placeholder="Titre de la piste..." value={name} onChange={e => setName(e.target.value)} />

      {activeTab === "url" ? (
        <>
          <input data-testid="input-audio-url" className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring" placeholder="https://soundcloud.com/... ou lien audio" value={url} onChange={e => setUrl(e.target.value)} />
          <p className="text-[10px] text-muted-foreground">SoundCloud intégré automatiquement. Spotify, YouTube Music, etc. affichés en lien.</p>
        </>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input data-testid="input-audio-prompt" className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring" placeholder="Décrivez le style musical voulu..." value={prompt} onChange={e => setPrompt(e.target.value)} />
            <button data-testid="button-generate-audio-brief" disabled={!prompt.trim() || genScript.isPending} onClick={() => genScript.mutate({ data: { mediaType: "audio", prompt: prompt.trim() } })} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-medium hover:bg-emerald-500/20 disabled:opacity-50 transition-colors shrink-0">
              <Wand2 className={cn("w-3.5 h-3.5", genScript.isPending && "animate-spin")} />
              {genScript.isPending ? "..." : "Générer"}
            </button>
          </div>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {suggestions.map(s => (
                <button key={s} onClick={() => setName(s)} className={cn("text-[10px] px-2 py-0.5 rounded-full border transition-colors", name === s ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" : "border-border bg-secondary text-muted-foreground hover:text-foreground")}>
                  {s}
                </button>
              ))}
            </div>
          )}
          {generatedBrief && (
            <textarea data-testid="textarea-audio-brief" rows={6} className="w-full bg-input border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring resize-none leading-relaxed font-mono" value={generatedBrief} onChange={e => setGeneratedBrief(e.target.value)} />
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground">Annuler</button>
        <button data-testid="button-save-audio" disabled={!canSave || isLoading} onClick={() => onSave({ name: name.trim(), type: "audio", url: url.trim() || undefined, content: generatedBrief.trim() || undefined, tags: ["audio"] })} className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50">Enregistrer</button>
      </div>
    </div>
  );
}

function GenericForm({ type, onCancel, onSave, isLoading }: { type: AssetType; onCancel: () => void; onSave: (data: any) => void; isLoading: boolean }) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const t = TYPES.find(x => x.value === type) ?? TYPES[0];
  const needsContent = ["prompt", "template", "document", "result", "image"].includes(type);

  return (
    <div className="bg-card border border-card-border rounded-xl p-4 animate-fade-in space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <t.icon className={cn("w-4 h-4", t.color.split(" ")[0])} />
        <span className="text-sm font-semibold text-foreground">Nouveau : {t.label}</span>
      </div>
      <input data-testid="input-asset-name" autoFocus className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring" placeholder="Nom..." value={name} onChange={e => setName(e.target.value)} />
      {needsContent && (
        <textarea data-testid="input-asset-content" rows={4} className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring resize-none" placeholder="Contenu..." value={content} onChange={e => setContent(e.target.value)} />
      )}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 rounded-lg border border-border text-xs text-muted-foreground">Annuler</button>
        <button data-testid="button-save-asset" disabled={!name.trim() || isLoading} onClick={() => onSave({ name: name.trim(), type, content: content.trim() || undefined })} className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50">Créer</button>
      </div>
    </div>
  );
}

export default function Studio() {
  const [activeType, setActiveType] = useState<AssetType | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [selectedFormType, setSelectedFormType] = useState<AssetType>("prompt");
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 pt-6 pb-4 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Studio</h1>
          <div className="flex gap-2">
            <button data-testid="button-new-video" onClick={() => openForm("video")} className="flex items-center gap-1 px-2.5 py-1.5 bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded-lg text-xs font-medium hover:bg-violet-500/20 transition-colors">
              <Film className="w-3.5 h-3.5" />
              Vidéo
            </button>
            <button data-testid="button-new-audio" onClick={() => openForm("audio")} className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-medium hover:bg-emerald-500/20 transition-colors">
              <Music className="w-3.5 h-3.5" />
              Audio
            </button>
            <button data-testid="button-new-asset" onClick={() => openForm(activeType !== "all" && activeType !== "video" && activeType !== "audio" ? activeType : "prompt")} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-opacity">
              <Plus className="w-3.5 h-3.5" />
              Autre
            </button>
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          <button onClick={() => setActiveType("all")} className={cn("px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors", activeType === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>
            Tous
          </button>
          {TYPES.map(t => (
            <button key={t.value} data-testid={`filter-${t.value}`} onClick={() => { setActiveType(t.value); setShowForm(false); }} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors", activeType === t.value ? t.color : "bg-secondary text-muted-foreground hover:text-foreground")}>
              <t.icon className="w-3 h-3" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-28 md:pb-6 space-y-4">
        {showForm && (
          selectedFormType === "video" ? (
            <VideoForm onCancel={() => setShowForm(false)} onSave={handleSave} isLoading={create.isPending} />
          ) : selectedFormType === "audio" ? (
            <AudioForm onCancel={() => setShowForm(false)} onSave={handleSave} isLoading={create.isPending} />
          ) : (
            <GenericForm type={selectedFormType} onCancel={() => setShowForm(false)} onSave={handleSave} isLoading={create.isPending} />
          )
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-card rounded-xl animate-pulse" />)}
          </div>
        ) : assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex gap-3 mb-4">
              <button onClick={() => openForm("video")} className="flex flex-col items-center gap-2 px-4 py-3 rounded-xl bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors">
                <Film className="w-6 h-6" />
                <span className="text-xs">Vidéo</span>
              </button>
              <button onClick={() => openForm("audio")} className="flex flex-col items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                <Music className="w-6 h-6" />
                <span className="text-xs">Audio</span>
              </button>
              <button onClick={() => openForm("prompt")} className="flex flex-col items-center gap-2 px-4 py-3 rounded-xl bg-pink-500/10 text-pink-400 hover:bg-pink-500/20 transition-colors">
                <Sparkles className="w-6 h-6" />
                <span className="text-xs">Prompt</span>
              </button>
            </div>
            <p className="text-sm text-muted-foreground">Aucun asset — créez votre premier contenu</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 stagger">
            {assets.map(asset => (
              <AssetCard key={asset.id} asset={asset} onDelete={() => del.mutate({ id: asset.id })} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
