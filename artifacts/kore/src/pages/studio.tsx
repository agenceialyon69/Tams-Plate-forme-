import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Wand2, Loader2, Download, ImageIcon } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface GeneratedImage {
  imageBase64: string;
  mimeType: string;
  provider: string;
}

const SIZES = [
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

export default function Studio() {
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState(SIZES[1]);
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
    <div className="max-w-3xl mx-auto px-6 md:px-8 py-8 pb-24 md:pb-8">
      <header className="flex items-center gap-2.5 mb-6">
        <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
          <Wand2 className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-serif font-semibold text-foreground leading-none">Studio</h1>
          <p className="text-xs text-muted-foreground mt-1">Génère des visuels à partir d'un prompt (gratuit)</p>
        </div>
      </header>

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
            {SIZES.map((s) => (
              <button
                key={s.label}
                onClick={() => setSize(s)}
                className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                  size.label === s.label
                    ? "border-accent bg-accent/5"
                    : "border-border/50 hover:bg-muted/40"
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

        {error && (
          <p className="text-sm text-destructive bg-destructive/5 rounded-lg px-3 py-2">{error}</p>
        )}

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
    </div>
  );
}
