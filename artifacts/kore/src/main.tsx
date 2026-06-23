import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { getToken } from "./lib/auth";

const apiUrl = import.meta.env.VITE_API_URL;
if (apiUrl) {
  setBaseUrl(apiUrl);
}

// Attach the stored API token as a Bearer header on every request.
setAuthTokenGetter(getToken);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((reg) => {
      // Vérifier les mises à jour toutes les 60s
      setInterval(() => reg.update(), 60_000);

      // Nouvelle version en attente → notifier l'UI via controllerchange
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            // Un nouveau SW est prêt : l'InstallPrompt écoutera controllerchange
            worker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
    }).catch((err) => {
      console.warn("[TAMS] Service Worker non enregistré :", err);
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
