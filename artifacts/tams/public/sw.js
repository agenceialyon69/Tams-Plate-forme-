/**
 * TAMS Service Worker — AUTODESTRUCTION.
 *
 * L'ancien service worker servait l'app en "cache-first" avec un nom de cache fixe
 * ("tams-static-v1") jamais invalidé → il resservait éternellement une VIEILLE
 * version (HTML + bundles JS figés), en court-circuitant le réseau. Résultat :
 * aucun déploiement n'était visible côté utilisateur.
 *
 * Ce SW se désinstalle lui-même, vide TOUS les caches et recharge les onglets.
 * Après son passage, l'app est servie directement par le réseau (toujours à jour),
 * et comme plus aucun code ne ré-enregistre de service worker, il ne revient pas.
 * NE PAS réintroduire un service worker cache-first sans versionner le cache et
 * passer le HTML/navigations en network-first.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (_e) { /* ignore */ }
      try {
        await self.registration.unregister();
      } catch (_e) { /* ignore */ }
      try {
        const clients = await self.clients.matchAll({ type: "window" });
        for (const client of clients) {
          try { client.navigate(client.url); } catch (_e) { /* ignore */ }
        }
      } catch (_e) { /* ignore */ }
    })()
  );
});

// Aucune interception : on laisse TOUJOURS passer au réseau (plus jamais de cache figé).
