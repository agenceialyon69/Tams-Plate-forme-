// TAMS — Service Worker v2
// Stratégies : stale-while-revalidate assets, network-first API, offline fallback navigation

const CACHE_NAME = "tams-v2";
const OFFLINE_URL = "/offline.html";
const PRECACHE = ["/", "/index.html", "/offline.html", "/manifest.json", "/icon-192.png"];

// ── Install ────────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(PRECACHE).catch(() => {}))
  );
  self.skipWaiting();
});

// ── Activate — purge anciens caches ───────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ──────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(apiStrategy(request));
  } else if (request.mode === "navigate") {
    event.respondWith(navigateStrategy(request));
  } else {
    event.respondWith(assetStrategy(request));
  }
});

// API : network-first, jamais mis en cache, erreur JSON propre
async function apiStrategy(req) {
  try { return await fetch(req); }
  catch {
    return new Response(JSON.stringify({ error: "Hors ligne." }), {
      status: 503, headers: { "Content-Type": "application/json" }
    });
  }
}

// Navigation : network-first, fallback cache puis offline.html
async function navigateStrategy(req) {
  try {
    const res = await fetch(req);
    if (res.ok) { const c = await caches.open(CACHE_NAME); c.put(req, res.clone()); }
    return res;
  } catch {
    return (await caches.match(req)) || (await caches.match("/")) || (await caches.match(OFFLINE_URL));
  }
}

// Assets : stale-while-revalidate (retourne le cache immédiatement, met à jour en fond)
async function assetStrategy(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || await fetchPromise;
}

// ── Background Sync — captures offline ────────────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "tams-sync-captures") {
    event.waitUntil(syncPendingCaptures());
  }
});

async function syncPendingCaptures() {
  try {
    const db = await idbOpen();
    const rows = await idbGetAll(db);
    for (const row of rows) {
      const res = await fetch("/api/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${row.token}` },
        body: JSON.stringify({ content: row.content, source: row.source || "text" }),
      }).catch(() => null);
      if (res?.ok) await idbDelete(db, row.id);
    }
  } catch { /* IDB indisponible */ }
}

function idbOpen() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("tams-offline", 1);
    r.onupgradeneeded = (e) => e.target.result.createObjectStore("pending", { keyPath: "id", autoIncrement: true });
    r.onsuccess = (e) => resolve(e.target.result);
    r.onerror = reject;
  });
}
function idbGetAll(db) {
  return new Promise((resolve, reject) => {
    const r = db.transaction("pending", "readonly").objectStore("pending").getAll();
    r.onsuccess = (e) => resolve(e.target.result);
    r.onerror = reject;
  });
}
function idbDelete(db, id) {
  return new Promise((resolve, reject) => {
    const r = db.transaction("pending", "readwrite").objectStore("pending").delete(id);
    r.onsuccess = resolve; r.onerror = reject;
  });
}

// ── Push Notifications ─────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  const d = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(d.title || "TAMS", {
      body: d.body, icon: "/icon-192.png", badge: "/icon-192.png",
      data: { url: d.url || "/" }, tag: d.tag, requireInteraction: false,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      const w = cs.find((c) => c.url.includes(self.location.origin));
      return w ? (w.focus(), w.navigate(url)) : self.clients.openWindow(url);
    })
  );
});

// ── Notifications planifiées ───────────────────────────────────────────────────
const timers = new Map();

function scheduleDaily(timeStr, type) {
  if (!timeStr) return;
  clearTimeout(timers.get(type));
  const [h, m] = timeStr.split(":").map(Number);
  const now = new Date(), target = new Date();
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const cfg = {
    morning: { title: "☀️ TAMS — Bon matin", body: "Ton briefing est prêt. Quelles sont tes 3 priorités ?", url: "/", tag: "morning" },
    evening: { title: "🌙 TAMS — Revue du soir", body: "Prends 5 minutes pour faire le bilan de ta journée.", url: "/evening", tag: "evening" },
  }[type];
  timers.set(type, setTimeout(() => {
    self.registration.showNotification(cfg.title, {
      body: cfg.body, icon: "/icon-192.png", badge: "/icon-192.png", data: { url: cfg.url }, tag: cfg.tag,
    });
    scheduleDaily(timeStr, type);
  }, target - now));
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "SCHEDULE_NOTIFICATIONS") {
    scheduleDaily(event.data.morningTime, "morning");
    scheduleDaily(event.data.eveningTime, "evening");
  }
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
