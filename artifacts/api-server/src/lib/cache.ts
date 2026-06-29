/**
 * Cache invalidation helpers — backward-compatible wrappers around DB-based cache.
 * Centralizes cache invalidation across routes to avoid circular deps.
 */

import { dbInvalidate } from "./cache-db";

// Dashboard cache invalidation callbacks
const dashboardInvalidators: Array<() => void> = [];

export function onInvalidateDashboard(fn: () => void): () => void {
  dashboardInvalidators.push(fn);
  return () => {
    const idx = dashboardInvalidators.indexOf(fn);
    if (idx !== -1) dashboardInvalidators.splice(idx, 1);
  };
}

/** Backward-compatible: also clears DB-based dashboard cache. */
export async function invalidateDashboardCache(): Promise<void> {
  for (const fn of dashboardInvalidators) {
    try { fn(); } catch { /* ignore */ }
  }
  await dbInvalidate("dashboard:%");
}

// Memory graph cache invalidation callbacks
const memoryGraphInvalidators: Array<() => void> = [];

export function onInvalidateMemoryGraph(fn: () => void): () => void {
  memoryGraphInvalidators.push(fn);
  return () => {
    const idx = memoryGraphInvalidators.indexOf(fn);
    if (idx !== -1) memoryGraphInvalidators.splice(idx, 1);
  };
}

/** Backward-compatible: also clears DB-based graph cache. */
export async function invalidateMemoryGraphCache(): Promise<void> {
  for (const fn of memoryGraphInvalidators) {
    try { fn(); } catch { /* ignore */ }
  }
  await dbInvalidate("graph:%");
}
