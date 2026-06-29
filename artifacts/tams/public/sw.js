/**
 * TAMS Service Worker
 * PWA Offline + Background Sync + Push Notifications
 */

const STATIC_CACHE = "tams-static-v1";
const DYNAMIC_CACHE = "tams-dynamic-v1";
const SYNC_TAG = "tams-sync-queue";

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/src/main.tsx",
  "/favicon.svg",
  "/manifest.webmanifest",
];

// Install: cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Cache-First for static, Network-First for API
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (handled by sync)
  if (request.method !== "GET") {
    return;
  }

  // API requests: Network-First with cache fallback
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            // Return empty JSON for API fallback
            return new Response(JSON.stringify([]), {
              headers: { "Content-Type": "application/json" },
            });
          });
        })
    );
    return;
  }

  // Static assets: Cache-First
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.status !== 206) {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(request, clone);
          });
        }
        return response;
      }).catch(() => {
        // Fallback for HTML navigation
        if (request.mode === "navigate") {
          return caches.match("/index.html");
        }
        return new Response("", { status: 404 });
      });
    })
  );
});

// Background Sync: queue mutations
self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(processSyncQueue());
  }
});

// Push Notifications
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "TAMS", body: event.data.text() };
  }

  const options = {
    body: data.body || "Nouvelle notification",
    icon: data.icon || "/favicon.svg",
    badge: "/favicon.svg",
    tag: data.tag || "default",
    data: { url: data.url || "/" },
    requireInteraction: data.requireInteraction ?? false,
    actions: data.actions || [],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "TAMS", options)
  );
});

// Notification click
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url === url && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});

// Process sync queue from IndexedDB
async function processSyncQueue() {
  try {
    const db = await openDB("tams-offline", 1);
    const tx = db.transaction("queue", "readonly");
    const store = tx.objectStore("queue");
    const requests = await store.getAll();

    for (const req of requests) {
      try {
        const response = await fetch(req.url, {
          method: req.method,
          headers: req.headers,
          body: req.body ? JSON.stringify(req.body) : undefined,
        });
        if (response.ok) {
          const deleteTx = db.transaction("queue", "readwrite");
          deleteTx.objectStore("queue").delete(req.id);
          await deleteTx.done;
        }
      } catch (err) {
        console.error("Sync failed for request:", req.id, err);
      }
    }
  } catch (err) {
    console.error("Error processing sync queue:", err);
  }
}

// Simple IndexedDB helper
function openDB(name, version) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("queue")) {
        db.createObjectStore("queue", { keyPath: "id" });
      }
    };
  });
}
