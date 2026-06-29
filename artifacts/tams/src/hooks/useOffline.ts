import { useState, useEffect, useCallback, useRef } from "react";

interface QueuedAction {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  timestamp: number;
}

const DB_NAME = "tams-offline";
const DB_VERSION = 1;
const STORE_NAME = "queue";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

async function getQueue(): Promise<QueuedAction[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as QueuedAction[]);
    request.onerror = () => reject(request.error);
  });
}

async function addToQueue(action: QueuedAction): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(action);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function removeFromQueue(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function clearQueue(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export interface UseOfflineReturn {
  isOnline: boolean;
  isSyncing: boolean;
  queueLength: number;
  queueAction: (action: Omit<QueuedAction, "id" | "timestamp">) => Promise<void>;
  syncQueue: () => Promise<void>;
  clearQueue: () => Promise<void>;
}

export function useOffline(): UseOfflineReturn {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [queueLength, setQueueLength] = useState(0);
  const syncInProgress = useRef(false);

  // Track online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-sync when coming back online
      setTimeout(() => syncQueue(), 500);
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial queue length
    getQueue().then((queue) => setQueueLength(queue.length));

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const queueAction = useCallback(async (action: Omit<QueuedAction, "id" | "timestamp">) => {
    const queuedAction: QueuedAction = {
      ...action,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
    };
    await addToQueue(queuedAction);
    setQueueLength((prev) => prev + 1);

    // Try to register background sync
    if ("serviceWorker" in navigator && "SyncManager" in window) {
      const registration = await navigator.serviceWorker.ready;
      try {
        await (registration as any).sync.register("tams-sync-queue");
      } catch {
        // Background sync not supported, will retry on online event
      }
    }
  }, []);

  const syncQueue = useCallback(async () => {
    if (syncInProgress.current || !navigator.onLine) return;
    syncInProgress.current = true;
    setIsSyncing(true);

    try {
      const queue = await getQueue();
      let successCount = 0;

      for (const req of queue) {
        try {
          const response = await fetch(req.url, {
            method: req.method,
            headers: req.headers,
            body: req.body ? JSON.stringify(req.body) : undefined,
          });
          if (response.ok) {
            await removeFromQueue(req.id);
            successCount++;
          }
        } catch (err) {
          console.error("Sync failed for request:", req.id, err);
          // Keep in queue for next sync
        }
      }

      const remaining = await getQueue();
      setQueueLength(remaining.length);

      if (successCount > 0) {
        // Dispatch custom event for UI feedback
        window.dispatchEvent(
          new CustomEvent("tams:sync-complete", {
            detail: { successCount, remaining: remaining.length },
          })
        );
      }
    } finally {
      syncInProgress.current = false;
      setIsSyncing(false);
    }
  }, []);

  const clearQueueFn = useCallback(async () => {
    await clearQueue();
    setQueueLength(0);
  }, []);

  return {
    isOnline,
    isSyncing,
    queueLength,
    queueAction,
    syncQueue,
    clearQueue: clearQueueFn,
  };
}

// Hook for components to queue mutations
export function useOfflineMutation() {
  const { isOnline, queueAction } = useOffline();

  const mutate = useCallback(
    async <T extends Record<string, unknown>>(
      url: string,
      method: string,
      body: T,
      onSuccess?: () => void
    ) => {
      if (isOnline) {
        try {
          const response = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (response.ok) {
            onSuccess?.();
            return { success: true, queued: false };
          }
          throw new Error(`HTTP ${response.status}`);
        } catch (err) {
          // Fall through to queue
        }
      }

      // Queue for later
      await queueAction({
        url,
        method,
        headers: { "Content-Type": "application/json" },
        body,
      });
      return { success: true, queued: true };
    },
    [isOnline, queueAction]
  );

  return { mutate };
}
