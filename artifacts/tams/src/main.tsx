import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Anti « Failed to fetch dynamically imported module » : après un redéploiement,
// les anciens chunks (référencés par l'index.html déjà chargé) disparaissent du
// serveur → l'import dynamique échoue → écran blanc. On recharge UNE fois pour
// récupérer la nouvelle version (garde-fou contre une boucle de rechargement).
const RELOAD_KEY = "tams_chunk_reload";
function recoverFromChunkError() {
  if (sessionStorage.getItem(RELOAD_KEY)) return; // déjà tenté → on évite la boucle
  sessionStorage.setItem(RELOAD_KEY, "1");
  window.location.reload();
}
// Réinitialise le garde-fou après un chargement réussi.
window.addEventListener("load", () => {
  setTimeout(() => sessionStorage.removeItem(RELOAD_KEY), 4000);
});
window.addEventListener("vite:preloadError", (e) => {
  e.preventDefault();
  recoverFromChunkError();
});
window.addEventListener("unhandledrejection", (e) => {
  const msg = String((e.reason && (e.reason.message || e.reason)) || "");
  if (/dynamically imported module|Importing a module script failed|Failed to fetch/i.test(msg)) {
    recoverFromChunkError();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
