import { useEffect, useState } from "react";

const STORAGE_KEY = "kore-notification-prefs";

interface NotificationPrefs {
  enabled: boolean;
  morningTime: string;
  eveningTime: string;
}

const DEFAULT_PREFS: NotificationPrefs = {
  enabled: false,
  morningTime: "08:00",
  eveningTime: "21:00",
};

export function loadPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_PREFS;
}

export function savePrefs(prefs: NotificationPrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

async function requestPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

function sendScheduleMessage(prefs: NotificationPrefs) {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready.then((reg) => {
    if (reg.active) {
      reg.active.postMessage({
        type: "SCHEDULE_NOTIFICATIONS",
        morningTime: prefs.morningTime,
        eveningTime: prefs.eveningTime,
      });
    }
  });
}

export function useNotifications() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(loadPrefs);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported("Notification" in window && "serviceWorker" in navigator);
  }, []);

  useEffect(() => {
    if (prefs.enabled && permission === "granted") {
      sendScheduleMessage(prefs);
    }
  }, [prefs, permission]);

  async function enable() {
    const granted = await requestPermission();
    setPermission(granted ? "granted" : "denied");
    if (granted) {
      const next = { ...prefs, enabled: true };
      setPrefs(next);
      savePrefs(next);
      sendScheduleMessage(next);
    }
    return granted;
  }

  function disable() {
    const next = { ...prefs, enabled: false };
    setPrefs(next);
    savePrefs(next);
  }

  function updateTimes(morningTime: string, eveningTime: string) {
    const next = { ...prefs, morningTime, eveningTime };
    setPrefs(next);
    savePrefs(next);
    if (prefs.enabled && permission === "granted") {
      sendScheduleMessage(next);
    }
  }

  return { prefs, permission, supported, enable, disable, updateTimes };
}
