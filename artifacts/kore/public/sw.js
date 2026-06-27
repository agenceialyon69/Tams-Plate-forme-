const CACHE_NAME = "kore-v1";
const ASSETS = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        existing.navigate(url);
      } else {
        self.clients.openWindow(url);
      }
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SCHEDULE_NOTIFICATIONS") {
    const { morningTime, eveningTime } = event.data;
    scheduleDaily(morningTime, "morning");
    scheduleDaily(eveningTime, "evening");
  }
});

function scheduleDaily(timeStr, type) {
  if (!timeStr) return;
  const [h, m] = timeStr.split(":").map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const delay = target - now;

  setTimeout(() => {
    if (type === "morning") {
      self.registration.showNotification("☀️ KORE — Bon matin", {
        body: "Ton briefing du jour est prêt. Quelles sont tes priorités ?",
        icon: "/favicon.svg",
        badge: "/favicon.svg",
        data: { url: "/" },
        tag: "morning",
      });
    } else {
      self.registration.showNotification("🌙 KORE — Revue du soir", {
        body: "Prends 5 minutes pour faire le bilan de ta journée.",
        icon: "/favicon.svg",
        badge: "/favicon.svg",
        data: { url: "/evening" },
        tag: "evening",
      });
    }
    scheduleDaily(timeStr, type);
  }, delay);
}
