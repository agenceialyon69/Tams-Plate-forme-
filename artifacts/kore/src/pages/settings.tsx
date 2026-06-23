import { useState, useEffect } from "react";
import {
  Bell, BellOff, CheckCircle2, XCircle, LogOut, Shield,
  Cpu, Download, AlertTriangle, RefreshCw, SlidersHorizontal,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useQuery } from "@tanstack/react-query";
import { useNotifications } from "@/hooks/useNotifications";
import { clearToken, getToken } from "@/lib/auth";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const APP_VERSION = "2.0.0";

interface IntegrationsStatus {
  ai: { preferred: string; providers: string[] };
  webSearch: { providers: string[] };
  imageGeneration: { configured: boolean; providers: string[] };
  github: { configured: boolean };
  ffmpeg: { available: boolean; version: string | null };
}

const PROVIDER_LABEL: Record<string, string> = {
  gemini: "Gemini (Google)",
  groq: "Groq (Llama/Qwen)",
  openrouter: "OpenRouter (DeepSeek R1/Qwen)",
  ollama: "Ollama (local)",
  tavily: "Tavily",
  brave: "Brave",
  searxng: "SearXNG",
  duckduckgo: "DuckDuckGo (sans clé)",
  pollinations: "Pollinations (sans clé)",
  huggingface: "Hugging Face",
};

function StatusRow({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-muted-foreground shrink-0" />
      )}
      <span className="text-sm text-foreground">{label}</span>
      {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
    </div>
  );
}

function ConfigStatusPanel() {
  const { data, isLoading, refetch, isFetching } = useQuery<IntegrationsStatus>({
    queryKey: ["integrations-status"],
    queryFn: () => apiFetch<IntegrationsStatus>("/integrations/status"),
  });

  const aiProviders = data?.ai.providers ?? [];

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">État réel détecté côté serveur (variables Railway).</p>
        <button onClick={() => refetch()} className="text-muted-foreground hover:text-foreground" title="Rafraîchir">
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : !data ? (
        <p className="text-sm text-destructive">Impossible de lire l'état (réservé owner/admin).</p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Copilot IA</p>
            {aiProviders.length === 0 ? (
              <div className="flex items-start gap-2 text-xs text-yellow-500 bg-yellow-500/10 rounded-lg p-3">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>Aucun fournisseur IA détecté. Ajoute <code className="font-mono">GEMINI_API_KEY</code>, <code className="font-mono">GROQ_API_KEY</code> ou <code className="font-mono">OPENROUTER_API_KEY</code> sur Railway.</span>
              </div>
            ) : (
              <>
                {["gemini", "groq", "openrouter", "ollama"].map((p) => (
                  <StatusRow key={p} ok={aiProviders.includes(p)} label={PROVIDER_LABEL[p] ?? p} />
                ))}
                <p className="text-[11px] text-muted-foreground mt-1">
                  Préférence <code className="font-mono">AI_PROVIDER</code> : <strong>{data.ai.preferred}</strong>
                  {data.ai.preferred === "auto" && " (essaie dans l'ordre : gemini → groq → openrouter → ollama)"}
                </p>
              </>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Outils</p>
            <StatusRow ok={data.imageGeneration.configured} label="Génération d'images" detail={data.imageGeneration.providers.map((p) => PROVIDER_LABEL[p] ?? p).join(", ")} />
            <StatusRow ok={data.ffmpeg.available} label="Vidéo (FFmpeg)" detail={data.ffmpeg.version ? data.ffmpeg.version.split(" ")[0] : undefined} />
            <StatusRow ok={data.webSearch.providers.length > 0} label="Recherche web" detail={data.webSearch.providers.map((p) => PROVIDER_LABEL[p] ?? p).join(", ")} />
            <StatusRow ok={data.github.configured} label="GitHub" detail={data.github.configured ? undefined : "GITHUB_TOKEN manquant"} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const { prefs, permission, supported, enable, disable, updateTimes } = useNotifications();
  const [morning, setMorning] = useState(prefs.morningTime);
  const [evening, setEvening] = useState(prefs.eveningTime);
  const [saved, setSaved] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [exporting, setExporting] = useState(false);

  useEffect(() => { setMorning(prefs.morningTime); setEvening(prefs.eveningTime); }, [prefs]);

  async function handleToggle() {
    if (prefs.enabled) { disable(); }
    else {
      setEnabling(true);
      const granted = await enable();
      setEnabling(false);
      if (!granted) return;
    }
  }

  function handleSaveTimes() {
    updateTimes(morning, evening);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleLogout() { clearToken(); navigate("/"); }

  async function handleExport() {
    setExporting(true);
    try {
      const token = getToken();
      const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const res = await fetch(`${base}/api/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tams-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ description: "Export téléchargé." });
    } catch {
      toast({ variant: "destructive", description: "Échec de l'export." });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 space-y-10">
      <PageHeader
        icon={SlidersHorizontal}
        title="Paramètres"
        subtitle="Configuration de TAMS"
      />

      {/* Configuration IA & Intégrations (état réel serveur) */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5" />
          Configuration IA &amp; Intégrations
        </h2>
        <ConfigStatusPanel />
      </section>

      {/* Notifications */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Notifications</h2>
        {!supported && (
          <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            Les notifications ne sont pas supportées par ce navigateur. Installe TAMS comme application (PWA) sur ton téléphone ou utilise Chrome/Edge.
          </div>
        )}
        {supported && (
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-3">
                {prefs.enabled ? <Bell className="w-5 h-5 text-accent" /> : <BellOff className="w-5 h-5 text-muted-foreground" />}
                <div>
                  <p className="text-sm font-medium text-foreground">{prefs.enabled ? "Notifications activées" : "Notifications désactivées"}</p>
                  {permission === "denied" && <p className="text-xs text-red-400 mt-0.5">Bloquées par le navigateur — autorise dans les paramètres du site.</p>}
                  {!prefs.enabled && permission !== "denied" && <p className="text-xs text-muted-foreground mt-0.5">Rappels matin &amp; soir pour rester aligné</p>}
                </div>
              </div>
              <button
                onClick={handleToggle}
                disabled={enabling || permission === "denied"}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-40 ${prefs.enabled ? "bg-accent" : "bg-muted"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${prefs.enabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            {prefs.enabled && (
              <div className="p-5 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">☀️ Briefing matin</label>
                    <input type="time" value={morning} onChange={(e) => setMorning(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">🌙 Revue du soir</label>
                    <input type="time" value={evening} onChange={(e) => setEvening(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={handleSaveTimes} className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors">
                    Enregistrer les horaires
                  </button>
                  {saved && <span className="flex items-center gap-1.5 text-sm text-green-400"><CheckCircle2 className="w-4 h-4" />Enregistré</span>}
                </div>
                <p className="text-xs text-muted-foreground border-t border-border pt-4">Les notifications fonctionnent quand l&apos;application est ouverte ou installée en PWA.</p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Export / Sauvegarde */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <Download className="w-3.5 h-3.5" />
          Export &amp; Sauvegarde
        </h2>
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <p className="text-sm font-medium text-foreground">Exporter toutes les données</p>
          <p className="text-xs text-muted-foreground">
            Télécharge toutes tes données (captures, tâches, mémoire, décisions, logs d'audit…) en JSON.
          </p>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background text-sm hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-muted-foreground" />
            {exporting ? "Export en cours…" : "Télécharger l'export JSON"}
          </button>
          <p className="text-[11px] text-muted-foreground/50">
            L'export contient toutes les données non chiffrées. Conserve ce fichier en lieu sûr.
          </p>
        </div>
      </section>

      {/* Accès & Sécurité */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <Shield className="w-3.5 h-3.5" />
          Accès &amp; Sécurité
        </h2>
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          <div className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Session active</p>
              <p className="text-xs text-muted-foreground mt-0.5">Se déconnecter de cet appareil</p>
            </div>
            <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-500/30 bg-red-500/5 text-red-400 text-sm hover:bg-red-500/10 transition-colors">
              <LogOut className="w-4 h-4" />
              Déconnexion
            </button>
          </div>
        </div>
      </section>

      {/* À propos */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">À propos</h2>
        <div className="rounded-xl border border-border bg-card p-5 space-y-3 text-sm text-muted-foreground">
          <div className="flex items-center justify-between">
            <p><span className="text-foreground font-medium">TAMS</span> — Plateforme IA gouvernée</p>
            <span className="text-xs bg-muted px-2 py-0.5 rounded-full font-mono text-muted-foreground">v{APP_VERSION}</span>
          </div>
          <p className="leading-relaxed">Mémoire persistante, red team intégré, observabilité complète, audit trail immuable.</p>
          <div className="pt-2 border-t border-border/50 space-y-1">
            <p className="text-xs opacity-60">Mode Red Team actif — honnête, jamais flatteur.</p>
            <p className="text-xs opacity-60">Audit trail immuable. Données sur ton serveur privé.</p>
            <p className="text-xs opacity-60">Aucun secret stocké en dur dans le code.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
