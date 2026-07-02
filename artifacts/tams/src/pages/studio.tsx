import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, Film, Image as ImageIcon, Loader2, Music2, RefreshCw, Sparkles } from "lucide-react";

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
type AssetType = "image" | "video" | "audio" | "document" | "prompt" | "template" | "result";
type CreateMode = Exclude<AssetType, "result">;
type Asset = { id: number; name: string; type: AssetType; url?: string | null; content?: string | null; mimeType?: string | null; tags?: string[] | null; createdAt?: string };
type Result = { status?: string; mode?: string; title?: string; result?: string; providerUsed?: string; artifact?: { type?: string; url?: string; content?: string }; limitations?: string[] };
type Operation = { status: "idle" | "running" | "success" | "missing_config" | "error"; title: string; message: string; provider: string; mode: string; url?: string; logs: string[]; limitations: string[] };

const tabs: Array<{ id: "all" | AssetType; label: string }> = [
  { id: "all", label: "Tout" }, { id: "image", label: "Images" }, { id: "video", label: "VidÃ©os" },
  { id: "audio", label: "Audio" }, { id: "document", label: "Docs" }, { id: "prompt", label: "Prompts" },
  { id: "template", label: "Templates" }, { id: "result", label: "RÃ©sultats" },
];
const modes: Array<{ id: CreateMode; label: string; detail: string }> = [
  { id: "image", label: "Image", detail: "Pollinations rÃ©el" }, { id: "video", label: "VidÃ©o", detail: "MP4 FFmpeg rÃ©el" },
  { id: "audio", label: "Audio", detail: "MusicGen configurÃ©" }, { id: "document", label: "Document", detail: "Texte persistÃ©" },
  { id: "prompt", label: "Prompt", detail: "Texte persistÃ©" }, { id: "template", label: "Template", detail: "Texte persistÃ©" },
];
const defaults: Record<CreateMode, string> = {
  image: "Photo produit activewear femme, lumiÃ¨re naturelle, style UGC crÃ©dible, format vertical 9:16.",
  video: "VidÃ©o TikTok naturelle pour un legging activewear femme, format 9:16, style UGC, avec hook, scÃ¨nes, captions et CTA.",
  audio: "Musique courte moderne sportive premium, Ã©nergie TikTok, sans paroles.",
  document: "Brief campagne activewear : objectif, cible, proposition de valeur, livrables et risques.",
  prompt: "CrÃ©er une vidÃ©o verticale 9:16, style UGC naturel, sans fausse promesse.",
  template: "Hook / ProblÃ¨me / DÃ©monstration / Preuve / CTA",
};

async function request(url: string, init?: RequestInit, timeout = 180000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    if (!text.trim()) throw new Error("RÃ©ponse API vide.");
    let data: unknown;
    try { data = JSON.parse(text); } catch { throw new Error("RÃ©ponse API invalide (JSON attendu)."); }
    return { response, data };
  } finally { window.clearTimeout(timer); }
}
function errorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return "DÃ©lai dÃ©passÃ©. Aucun faux rÃ©sultat nâ€™a Ã©tÃ© crÃ©Ã©.";
  return error instanceof Error ? error.message : String(error);
}
function capability(mode: CreateMode) {
  return mode === "image" ? "image.generate" : mode === "video" ? "video.generate" : mode === "audio" ? "audio.music.generate" : null;
}

export default function StudioPage() {
  const [tab, setTab] = useState<"all" | AssetType>("all");
  const [mode, setMode] = useState<CreateMode>("video");
  const [prompt, setPrompt] = useState(defaults.video);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [libraryError, setLibraryError] = useState("");
  const [studioStatus, setStudioStatus] = useState("non vÃ©rifiÃ©");
  const [operation, setOperation] = useState<Operation>({ status: "idle", title: "PrÃªt", message: "Choisis un format puis lance une action rÃ©elle.", provider: "â€”", mode: "â€”", logs: [], limitations: [] });

  const load = useCallback(async () => {
    setLoading(true); setLibraryError("");
    try {
      const { response, data } = await request(API + "/api/assets?limit=100", undefined, 20000);
      if (!response.ok || !Array.isArray(data)) throw new Error("BibliothÃ¨que indisponible (HTTP " + response.status + ").");
      setAssets(data as Asset[]);
    } catch (error) { setLibraryError(errorMessage(error)); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    request(API + "/api/studio/status", undefined, 15000).then(({ response, data }) => {
      if (response.ok && data && typeof data === "object" && "status" in data) setStudioStatus(String((data as { status: unknown }).status));
    }).catch(() => setStudioStatus("non vÃ©rifiÃ©"));
  }, [load]);

  async function save(result: Result, url?: string) {
    const payload = {
      name: (result.title || mode + " Studio") + " â€” " + new Date().toLocaleString("fr-FR"), type: mode,
      url: url || null, content: result.artifact?.content || result.result || prompt,
      mimeType: mode === "video" ? "video/mp4" : mode === "image" ? "image/*" : mode === "audio" ? "audio/*" : "text/plain",
      tags: ["studio-result", "provider:" + (result.providerUsed || "tams-assets"), "mode:" + (result.mode || "real")],
    };
    const { response, data } = await request(API + "/api/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, 30000);
    const created = (data as { data?: Asset; error?: string }).data;
    if (!response.ok || !created) throw new Error((data as { error?: string }).error || "Artefact non persistÃ©.");
    setAssets(previous => [created, ...previous.filter(item => item.id !== created.id)]);
  }

  async function run() {
    const input = prompt.trim(); if (!input) return;
    const started = new Date().toLocaleTimeString("fr-FR");
    setOperation({ status: "running", title: "ExÃ©cution en cours", message: "API et provider en coursâ€¦", provider: "dÃ©tection", mode: "real", logs: [started + " â€” RequÃªte envoyÃ©e."], limitations: [] });
    try {
      const id = capability(mode);
      if (!id) {
        const result: Result = { status: "success", mode: "real", title: mode === "document" ? "Document Studio" : mode === "prompt" ? "Prompt Studio" : "Template Studio", result: input, providerUsed: "tams-assets", artifact: { type: "text", content: input } };
        await save(result);
        setOperation({ status: "success", title: result.title || "Contenu enregistrÃ©", message: "Contenu rÃ©ellement persistÃ©.", provider: "tams-assets", mode: "real", logs: [started + " â€” Ã‰criture /api/assets.", new Date().toLocaleTimeString("fr-FR") + " â€” Persistance confirmÃ©e."], limitations: [] });
        setTab(mode); return;
      }
      const { response, data } = await request(API + "/api/capabilities/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ capabilityId: id, input, options: mode === "video" ? { text: "TAMS â€” activewear UGC", secondsPerImage: 2.5 } : {} }) });
      const result = data as Result;
      if (!response.ok) throw new Error(result.result || result.title || "HTTP " + response.status);
      if (["missing_config", "disabled", "planned"].includes(result.status || "") || result.mode === "plan_only") {
        setOperation({ status: "missing_config", title: result.title || "Configuration manquante", message: result.result || "Provider indisponible.", provider: result.providerUsed || "none", mode: result.mode || "disabled", logs: [started + " â€” RequÃªte envoyÃ©e.", new Date().toLocaleTimeString("fr-FR") + " â€” " + (result.status || "missing_config") + ".", "Aucun asset ajoutÃ©."], limitations: result.limitations || [] }); return;
      }
      if (result.status !== "success") throw new Error(result.result || "SuccÃ¨s non confirmÃ©.");
      const url = result.artifact?.url;
      if (!url) throw new Error("SuccÃ¨s sans URL dâ€™artefact : rÃ©sultat refusÃ© pour Ã©viter un faux positif.");
      await save(result, url);
      setOperation({ status: "success", title: result.title || "Artefact gÃ©nÃ©rÃ©", message: result.result || "Artefact rÃ©el gÃ©nÃ©rÃ© et persistÃ©.", provider: result.providerUsed || "unknown", mode: result.mode || "real", url, logs: [started + " â€” Appel " + id + ".", new Date().toLocaleTimeString("fr-FR") + " â€” Provider confirmÃ©.", new Date().toLocaleTimeString("fr-FR") + " â€” Asset persistÃ©."], limitations: result.limitations || [] });
      setTab("result");
    } catch (error) {
      setOperation({ status: "error", title: "Ã‰chec explicite", message: errorMessage(error), provider: "non confirmÃ©", mode: "error", logs: [started + " â€” RequÃªte dÃ©marrÃ©e.", new Date().toLocaleTimeString("fr-FR") + " â€” Ã‰chec, aucun asset crÃ©Ã©."], limitations: ["La bibliothÃ¨que nâ€™a pas Ã©tÃ© modifiÃ©e."] });
    }
  }

  const visible = useMemo(() => tab === "all" ? assets : tab === "result" ? assets.filter(a => Boolean(a.url) && (a.tags || []).includes("studio-result")) : assets.filter(a => a.type === tab), [assets, tab]);
  const tone = operation.status === "success" ? "border-emerald-500/30 bg-emerald-500/10" : operation.status === "running" ? "border-blue-500/30 bg-blue-500/10" : operation.status === "error" ? "border-red-500/30 bg-red-500/10" : operation.status === "missing_config" ? "border-amber-500/30 bg-amber-500/10" : "border-border bg-card/70";

  return <div className="flex-1 overflow-y-auto p-5 md:p-8 space-y-6">
    <header className="space-y-2">
      <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs text-primary"><Sparkles className="h-3.5 w-3.5" /> Studio opÃ©rationnel</div>
      <h1 className="text-3xl font-semibold tracking-tight">Studio</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">Une crÃ©ation appelle une API rÃ©elle. Les erreurs et configurations manquantes ne produisent jamais de faux rÃ©sultat.</p>
      <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-border px-2 py-1">API : {studioStatus}</span><span className="rounded-full border border-border px-2 py-1">Upload : non connectÃ©</span><span className="rounded-full border border-border px-2 py-1">Progression simulÃ©e : non</span></div>
    </header>

    <section className="grid gap-5 xl:grid-cols-2">
      <div className="rounded-2xl border border-border bg-card/70 p-5 space-y-4">
        <div><h2 className="font-semibold">CrÃ©er un artefact</h2><p className="text-xs text-muted-foreground">API â†’ provider â†’ artefact ou erreur lisible.</p></div>
        <div className="grid gap-2 sm:grid-cols-3">{modes.map(item => <button key={item.id} type="button" onClick={() => { setMode(item.id); setPrompt(defaults[item.id]); }} className={"rounded-xl border p-3 text-left " + (mode === item.id ? "border-primary bg-primary/10" : "border-border bg-background/50")}><div className="text-sm font-medium">{item.label}</div><div className="mt-1 text-[11px] text-muted-foreground">{item.detail}</div></button>)}</div>
        <label className="block space-y-2"><span className="text-xs font-medium">Instruction</span><textarea aria-label="Instruction Studio" rows={6} value={prompt} onChange={e => setPrompt(e.target.value)} className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary" /></label>
        <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={() => void run()} disabled={operation.status === "running" || !prompt.trim()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">{operation.status === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "video" ? <Film className="h-4 w-4" /> : mode === "audio" ? <Music2 className="h-4 w-4" /> : mode === "image" ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}{operation.status === "running" ? "ExÃ©cution rÃ©elleâ€¦" : "Lancer " + mode}</button><span className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">Upload dÃ©sactivÃ© : stockage serveur non connectÃ©.</span></div>
      </div>

      <div className={"rounded-2xl border p-5 space-y-4 " + tone} aria-live="polite">
        <div className="flex gap-3">{operation.status === "running" ? <Loader2 className="h-5 w-5 animate-spin" /> : operation.status === "success" ? <CheckCircle2 className="h-5 w-5 text-emerald-300" /> : operation.status === "error" || operation.status === "missing_config" ? <AlertTriangle className="h-5 w-5 text-amber-300" /> : <Sparkles className="h-5 w-5" />}<div><h2 className="font-semibold">{operation.title}</h2><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{operation.message}</p></div></div>
        <div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg border border-border/60 p-2">Statut : <strong>{operation.status}</strong></div><div className="rounded-lg border border-border/60 p-2">Mode : <strong>{operation.mode}</strong></div><div className="col-span-2 rounded-lg border border-border/60 p-2">Provider : <strong>{operation.provider}</strong></div></div>
        {operation.url && <a href={operation.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary"><ExternalLink className="h-3.5 w-3.5" /> Ouvrir lâ€™artefact rÃ©el</a>}
        {operation.logs.length > 0 && <div><div className="mb-1 text-xs font-medium">Journal</div><ul className="space-y-1 rounded-xl border border-border/60 bg-background/50 p-3 text-xs text-muted-foreground">{operation.logs.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}
        {operation.limitations.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">{operation.limitations.map(item => <li key={item}>{item}</li>)}</ul>}
      </div>
    </section>

    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2">{tabs.map(item => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={"rounded-full border px-3 py-1.5 text-xs " + (tab === item.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>{item.label}</button>)}</div><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"><RefreshCw className={"h-3.5 w-3.5 " + (loading ? "animate-spin" : "")} /> Actualiser</button></div>
      {libraryError && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{libraryError}</div>}
      {!loading && visible.length === 0 && <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Aucun artefact rÃ©el dans cette catÃ©gorie. Aucun faux rÃ©sultat nâ€™est affichÃ©.</div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map(asset => <article key={asset.id} className="overflow-hidden rounded-2xl border border-border bg-card/70"><Preview asset={asset} /><div className="p-4"><div className="truncate font-medium">{asset.name}</div><div className="mt-1 text-xs text-muted-foreground">{asset.type} Â· asset #{asset.id}</div>{asset.content && <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-xs text-muted-foreground">{asset.content}</p>}{asset.url && <a href={asset.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-lg border border-primary/30 px-3 py-2 text-xs text-primary"><ExternalLink className="h-3.5 w-3.5" /> Ouvrir / tÃ©lÃ©charger</a>}</div></article>)}</div>
    </section>
  </div>;
}

function Preview({ asset }: { asset: Asset }) {
  if (asset.type === "image" && asset.url) return <img src={asset.url} alt={asset.name} className="h-52 w-full bg-black object-contain" />;
  if (asset.type === "video" && asset.url) return <video src={asset.url} controls className="h-52 w-full bg-black object-contain" />;
  if (asset.type === "audio" && asset.url) return <div className="flex h-32 items-center bg-card p-5"><audio src={asset.url} controls className="w-full" /></div>;
  return <div className="flex h-36 items-center justify-center bg-card text-muted-foreground">{asset.type === "video" ? <Film className="h-10 w-10" /> : asset.type === "audio" ? <Music2 className="h-10 w-10" /> : asset.type === "image" ? <ImageIcon className="h-10 w-10" /> : <FileText className="h-10 w-10" />}</div>;
}

