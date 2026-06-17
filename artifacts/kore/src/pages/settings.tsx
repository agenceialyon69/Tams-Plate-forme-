import { useState } from "react";
import { Bell, BellOff, CheckCircle2, Copy, LogOut, Shield, Link as LinkIcon } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { clearToken, getToken } from "@/lib/auth";
import { useLocation } from "wouter";

const APP_VERSION = "1.0.0";

export default function Settings() {
  const { prefs, permission, supported, enable, disable, updateTimes } = useNotifications();
  const [morning, setMorning] = useState(prefs.morningTime);
  const [evening, setEvening] = useState(prefs.eveningTime);
  const [saved, setSaved] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [, navigate] = useLocation();

  async function handleToggle() {
    if (prefs.enabled) {
      disable();
    } else {
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
    // Build the link from the currently stored token — no hardcoding
    const token = getToken();
    if (!token) return;
    const url = `${window.location.origin}/?token=${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* ignore */
    }
  }

  function handleLogout() {
    clearToken();
    navigate("/");
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 space-y-10">
      <div>
        <h1 className="text-2xl font-serif font-semibold text-foreground">Paramètres</h1>
        <p className="text-sm text-muted-foreground mt-1">Configuration de TAMS</p>
      </div>

      {/* Notifications */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Notifications
        </h2>

        {!supported && (
          <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            Les notifications ne sont pas supportées par ce navigateur. Installe TAMS comme
            application (PWA) sur ton téléphone ou utilise Chrome/Edge.
          </div>
        )}

        {supported && (
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-3">
                {prefs.enabled ? (
                  <Bell className="w-5 h-5 text-accent" />
                ) : (
                  <BellOff className="w-5 h-5 text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {prefs.enabled ? "Notifications activées" : "Notifications désactivées"}
                  </p>
                  {permission === "denied" && (
                    <p className="text-xs text-red-400 mt-0.5">
                      Bloquées par le navigateur — autorise dans les paramètres du site.
                    </p>
                  )}
                  {!prefs.enabled && permission !== "denied" && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Rappels matin &amp; soir pour rester aligné avec TAMS
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={handleToggle}
                disabled={enabling || permission === "denied"}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-40 ${
                  prefs.enabled ? "bg-accent" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    prefs.enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {prefs.enabled && (
              <div className="p-5 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      ☀️ Briefing matin
                    </label>
                    <input
                      type="time"
                      value={morning}
                      onChange={(e) => setMorning(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
                    />
                    <p className="text-xs text-muted-foreground">
                      Rappel pour consulter tes priorités
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      🌙 Revue du soir
                    </label>
                    <input
                      type="time"
                      value={evening}
                      onChange={(e) => setEvening(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
                    />
                    <p className="text-xs text-muted-foreground">
                      Rappel pour faire le bilan
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSaveTimes}
                    className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
                  >
                    Enregistrer les horaires
                  </button>
                  {saved && (
                    <span className="flex items-center gap-1.5 text-sm text-green-400">
                      <CheckCircle2 className="w-4 h-4" />
                      Enregistré
                    </span>
                  )}
                </div>

                <p className="text-xs text-muted-foreground border-t border-border pt-4">
                  Les notifications fonctionnent quand l&apos;application est ouverte ou installée
                  en PWA. Sur iOS : Safari → &quot;Sur l&apos;écran d&apos;accueil&quot;.
                </p>
              </div>
            )}
          </div>
        )}
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
              <p className="text-xs text-muted-foreground mt-1">
                Copie ce lien pour te connecter instantanément depuis un autre appareil — téléphone,
                tablette, ordinateur.
              </p>
            </div>
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background text-sm hover:bg-muted/50 transition-colors"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span className="text-green-500 font-medium">Lien copié !</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-muted-foreground" />
                  <span>Copier le lien de connexion</span>
                </>
              )}
            </button>
            <p className="text-[11px] text-muted-foreground/50">
              ⚠️ Ne partage ce lien qu'avec toi-même — il donne accès complet à TAMS.
            </p>
          </div>

          <div className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Session active</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Se déconnecter de cet appareil
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-500/30 bg-red-500/5 text-red-400 text-sm hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Déconnexion
            </button>
          </div>
        </div>
      </section>

      {/* À propos */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          À propos
        </h2>
        <div className="rounded-xl border border-border bg-card p-5 space-y-3 text-sm text-muted-foreground">
          <div className="flex items-center justify-between">
            <p>
              <span className="text-foreground font-medium">TAMS</span> — Copilote personnel de vie
            </p>
            <span className="text-xs bg-muted px-2 py-0.5 rounded-full font-mono text-muted-foreground">
              v{APP_VERSION}
            </span>
          </div>
          <p className="leading-relaxed">
            Réduire la charge mentale. Prévenir le burn-out. Construire une vie alignée avec ce qui
            compte vraiment — boulot, projets, famille, toi.
          </p>
          <div className="pt-2 border-t border-border/50 space-y-1">
            <p className="text-xs opacity-60">Mode Red Team actif — honnête, jamais flatteur.</p>
            <p className="text-xs opacity-60">Données stockées en sécurité sur ton serveur privé.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
