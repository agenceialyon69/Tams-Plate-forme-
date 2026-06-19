import { useState, useEffect } from "react";
import {
  Bell, BellOff, CheckCircle2, Copy, LogOut, Shield, Link as LinkIcon,
  Cpu, Globe, Server, Download, AlertTriangle,
} from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { clearToken, getToken } from "@/lib/auth";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const APP_VERSION = "2.0.0";

const AI_PROVIDERS = [
  { value: "gemini", label: "Gemini 2.5 Flash", description: "Google — IA par défaut, analyses et briefings", icon: "🤖" },
  { value: "local", label: "Ollama (local)", description: "Modèle local — aucune donnée envoyée en cloud", icon: "🏠" },
  { value: "none", label: "Désactivé", description: "Aucun provider IA — fonctions AI indisponibles", icon: "⛔" },
];

const AI_MODELS: Record<string, string[]> = {
  gemini: ["gemini-2.5-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  local: ["llama3.2", "mistral", "phi3", "codellama", "llama3.1:8b"],
  none: [],
};

const PREF_KEY = "gandal_ai_prefs";

function loadAiPrefs() {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw) return JSON.parse(raw) as { provider: string; model: string; ollamaUrl: string };
  } catch {}
  return { provider: "gemini", model: "gemini-2.5-flash", ollamaUrl: "http://localhost:11434" };
}

function saveAiPrefs(prefs: { provider: string; model: string; ollamaUrl: string }) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {}
}

export default function Settings() {
  const { prefs, permission, supported, enable, disable, updateTimes } = useNotifications();
  const [morning, setMorning] = useState(prefs.morningTime);
  const [evening, setEvening] = useState(prefs.eveningTime);
  const [saved, setSaved] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [aiPrefs, setAiPrefs] = useState(loadAiPrefs);
  const [aiSaved, setAiSaved] = useState(false);
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

  async function handleCopyLink() {
    const token = getToken();
    if (!token) return;
    const url = `${window.location.origin}/?token=${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  }

  function handleLogout() { clearToken(); navigate("/"); }

  function handleSaveAiPrefs() {
    saveAiPrefs(aiPrefs);
    setAiSaved(true);
    setTimeout(() => setAiSaved(false), 2000);
    toast({ description: "Configuration IA enregistrée." });
  }

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
      a.download = `gandal-export-${new Date().toISOString().split("T")[0]}.json`;
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
      <div>
        <h1 className="text-2xl font-serif font-semibold text-foreground">Paramètres</h1>
        <p className="text-sm text-muted-foreground mt-1">Configuration de TAMS</p>
      </div>

      {/* Provider IA */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5" />
          Provider IA
        </h2>
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          <div className="p-5 space-y-4">
            <p className="text-sm text-muted-foreground">Sélectionne le provider utilisé pour les analyses, extractions et briefings.</p>
            <div className="space-y-2">
              {AI_PROVIDERS.map((p) => (
                <label key={p.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${aiPrefs.provider === p.value ? "border-accent bg-accent/5" : "border-border bg-background/30 hover:bg-muted/30"}`}>
                  <input
                    type="radio"
                    name="ai-provider"
                    value={p.value}
                    checked={aiPrefs.provider === p.value}
                    onChange={() => setAiPrefs({ ...aiPrefs, provider: p.value, model: AI_MODELS[p.value]?.[0] ?? "" })}
                    className="mt-1 accent-accent"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      <span className="mr-1.5">{p.icon}</span>{p.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                  </div>
                </label>
              ))}
            </div>

            {aiPrefs.provider !== "none" && AI_MODELS[aiPrefs.provider]?.length > 0 && (
              <div className="space-y-2 pt-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Modèle</label>
                <select
                  value={aiPrefs.model}
                  onChange={(e) => setAiPrefs({ ...aiPrefs, model: e.target.value })}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
                >
                  {AI_MODELS[aiPrefs.provider]?.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            )}

            {aiPrefs.provider === "local" && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">URL Ollama</label>
                <input
                  type="url"
                  value={aiPrefs.ollamaUrl}
                  onChange={(e) => setAiPrefs({ ...aiPrefs, ollamaUrl: e.target.value })}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
                  placeholder="http://localhost:11434"
                />
                <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
                  <Server className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>Ollama doit être installé et démarré localement. Le modèle doit être téléchargé via <code className="font-mono">ollama pull {aiPrefs.model}</code></span>
                </div>
              </div>
            )}

            {aiPrefs.provider === "gemini" && !import.meta.env.VITE_GEMINI_CONFIGURED && (
              <div className="flex items-start gap-2 text-xs text-yellow-400 bg-yellow-500/10 rounded-lg p-3 border border-yellow-500/20">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>Configure <code className="font-mono">GEMINI_API_KEY</code> dans les variables d'environnement du serveur pour activer les fonctionnalités IA.</span>
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleSaveAiPrefs}
                className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
              >
                Sauvegarder la configuration
              </button>
              {aiSaved && (
                <span className="flex items-center gap-1.5 text-sm text-green-400">
                  <CheckCircle2 className="w-4 h-4" />
                  Enregistré
                </span>
              )}
            </div>
          </div>
        </div>
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
          <div className="p-5 space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-muted-foreground" />
                Lien de connexion rapide
              </p>
              <p className="text-xs text-muted-foreground mt-1">Copie ce lien pour te connecter depuis un autre appareil.</p>
            </div>
            <button onClick={handleCopyLink} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background text-sm hover:bg-muted/50 transition-colors">
              {copied ? <><CheckCircle2 className="w-4 h-4 text-green-500" /><span className="text-green-500 font-medium">Lien copié !</span></> : <><Copy className="w-4 h-4 text-muted-foreground" /><span>Copier le lien de connexion</span></>}
            </button>
            <p className="text-[11px] text-muted-foreground/50">⚠️ Ne partage ce lien qu&apos;avec toi-même — il donne accès complet.</p>
          </div>
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
