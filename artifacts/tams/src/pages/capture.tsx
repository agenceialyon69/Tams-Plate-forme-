import { useState } from "react";
import { Camera, CheckCircle2, Loader2, ShieldAlert, Sparkles } from "lucide-react";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

type CaptureResult = {
  ok?: boolean;
  persisted?: boolean;
  captureId?: string;
  category?: string;
  priority?: string;
  summary?: string;
  nextAction?: string;
  event?: unknown;
  [key: string]: unknown;
};

async function postCapture(text: string, persist: boolean): Promise<CaptureResult> {
  const response = await fetch(`${API_BASE}/api/life-os/v5/capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, source: "quick-capture-ui", persist }),
  });
  const raw = await response.text();
  let payload: unknown = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(`Réponse capture invalide (${response.status}).`);
  }
  if (!response.ok) {
    const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    throw new Error(typeof record.error === "string" ? record.error : `HTTP ${response.status}`);
  }
  return (payload ?? {}) as CaptureResult;
}

function ResultCard({ result }: { result: CaptureResult }) {
  const keys = Object.keys(result).filter((key) => !["ok", "event"].includes(key));
  return (
    <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-5 space-y-4">
      <div className="flex items-center gap-2 text-emerald-200">
        <CheckCircle2 className="h-5 w-5" />
        <h2 className="font-semibold">Capture traitée</h2>
      </div>
      {keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">Le backend a accepté la capture sans détail supplémentaire.</p>
      ) : (
        <dl className="grid gap-3 sm:grid-cols-2">
          {keys.map((key) => (
            <div key={key} className="rounded-2xl border border-border bg-background/70 p-3">
              <dt className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{key}</dt>
              <dd className="mt-1 text-sm text-foreground break-words">
                {typeof result[key] === "string" || typeof result[key] === "number" || typeof result[key] === "boolean"
                  ? String(result[key])
                  : JSON.stringify(result[key], null, 2)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

export default function CapturePage() {
  const [text, setText] = useState("");
  const [persist, setPersist] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CaptureResult | null>(null);

  async function submit() {
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    try {
      const payload = await postCapture(clean, persist);
      setResult(payload);
      if (persist) setText("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Capture indisponible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto max-w-3xl px-4 pb-28 pt-6 md:pb-10 space-y-5">
        <header className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Capture rapide</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Transformer une pensée en signal actionnable</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Canal canonique Capture : preview ou persistance via Life OS. Aucune fausse sauvegarde locale.
              </p>
            </div>
          </div>
        </header>

        <section className="rounded-3xl border border-border bg-card p-5 space-y-4">
          <label className="space-y-2 block">
            <span className="text-sm font-medium">Note, contrainte, rappel ou décision brute</span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Ex: Penser à relancer le client vendredi, vérifier le devis, et ne pas promettre de délai sans validation."
              className="min-h-[160px] w-full rounded-2xl border border-border bg-background p-4 text-sm outline-none transition-colors focus:border-primary"
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-secondary/40 p-3">
            <span>
              <span className="block text-sm font-medium">Persister la capture</span>
              <span className="text-xs text-muted-foreground">Désactive pour prévisualiser sans écriture.</span>
            </span>
            <input
              type="checkbox"
              checked={persist}
              onChange={(event) => setPersist(event.target.checked)}
              className="h-5 w-5 accent-primary"
            />
          </label>

          {error ? (
            <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !text.trim()}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {persist ? "Capturer" : "Prévisualiser"}
          </button>
        </section>

        {result ? <ResultCard result={result} /> : (
          <section className="rounded-3xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Aucune capture envoyée dans cette session.
          </section>
        )}
      </div>
    </div>
  );
}
