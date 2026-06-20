import { useState, useEffect } from "react";
import { Download, X, Smartphone } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Détecte si l'app tourne déjà en mode standalone (installée)
function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// Détecte iOS Safari (pas de beforeinstallprompt — instructions manuelles nécessaires)
function isIosSafari() {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/chrome|fxios|crios/i.test(ua);
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    // Ne rien afficher si déjà installée
    if (isStandalone()) return;

    // Vérifier si l'utilisateur a déjà refusé (sessionStorage — persiste 30j)
    const dismissedAt = localStorage.getItem("tams_install_dismissed");
    if (dismissedAt) {
      const age = Date.now() - parseInt(dismissedAt, 10);
      if (age < 30 * 24 * 60 * 60 * 1000) { setDismissed(true); return; }
    }

    // Android/Desktop : capturer l'événement natif
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS : afficher guide après 3s si Safari
    if (isIosSafari()) {
      const t = setTimeout(() => setShowIosGuide(true), 3000);
      return () => { window.removeEventListener("beforeinstallprompt", handler); clearTimeout(t); };
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Écouter les mises à jour du service worker
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      setUpdateReady(true);
    });
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setDeferredPrompt(null);
    else dismiss();
  };

  const dismiss = () => {
    localStorage.setItem("tams_install_dismissed", String(Date.now()));
    setDeferredPrompt(null);
    setShowIosGuide(false);
    setDismissed(true);
  };

  const applyUpdate = () => {
    navigator.serviceWorker.ready.then((reg) => {
      reg.waiting?.postMessage({ type: "SKIP_WAITING" });
    });
    setUpdateReady(false);
    window.location.reload();
  };

  if (dismissed && !updateReady) return null;

  // Bannière mise à jour disponible
  if (updateReady) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm
                      bg-card border border-border rounded-2xl shadow-2xl p-4 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Mise à jour disponible</p>
          <p className="text-xs text-muted-foreground mt-0.5">Une nouvelle version de TAMS est prête.</p>
        </div>
        <button
          onClick={applyUpdate}
          className="shrink-0 bg-foreground text-background text-xs font-semibold px-3 py-1.5 rounded-lg hover:opacity-85 transition-opacity"
        >
          Mettre à jour
        </button>
      </div>
    );
  }

  // Guide iOS "Ajouter à l'écran d'accueil"
  if (showIosGuide && !dismissed) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm
                      bg-card border border-border rounded-2xl shadow-2xl p-4">
        <button onClick={dismiss} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Installer TAMS</p>
            <p className="text-xs text-muted-foreground">Accès direct depuis ton écran d'accueil</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Appuie sur{" "}
          <span className="inline-flex items-center gap-1 text-foreground font-medium">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
              <polyline points="16 6 12 2 8 6"/>
              <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
            Partager
          </span>
          {" "}puis{" "}
          <span className="text-foreground font-medium">« Sur l'écran d'accueil »</span>
        </p>
      </div>
    );
  }

  // Bannière Android/Desktop
  if (deferredPrompt) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm
                      bg-card border border-border rounded-2xl shadow-2xl p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
          <Download className="w-5 h-5 text-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Installer TAMS</p>
          <p className="text-xs text-muted-foreground">Disponible hors ligne, comme une vraie app</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleInstall}
            className="bg-foreground text-background text-xs font-semibold px-3 py-1.5 rounded-lg hover:opacity-85 transition-opacity"
          >
            Installer
          </button>
          <button onClick={dismiss} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
