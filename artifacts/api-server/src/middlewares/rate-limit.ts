import type { Request, Response, NextFunction } from "express";

interface BucketEntry {
  tokens: number;
  lastRefill: number;
}

const store = new Map<string, BucketEntry>();

/**
 * Token-bucket rate limiter (no external dependency).
 * @param maxTokens   Max requests in the window.
 * @param windowMs    Window duration in ms.
 */
export function rateLimit(maxTokens: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? "unknown";
    const now = Date.now();

    let entry = store.get(key);

    if (!entry) {
      entry = { tokens: maxTokens, lastRefill: now };
      store.set(key, entry);
    }

    const elapsed = now - entry.lastRefill;
    const refill = Math.floor((elapsed / windowMs) * maxTokens);

    if (refill > 0) {
      entry.tokens = Math.min(maxTokens, entry.tokens + refill);
      entry.lastRefill = now;
    }

    if (entry.tokens <= 0) {
      res.status(429).json({ error: "Trop de requêtes. Réessaie dans quelques secondes." });
      return;
    }

    entry.tokens -= 1;
    next();
  };
}

/** Preset: AI routes — 20 req / minute */
export const aiRateLimit = rateLimit(20, 60_000);

/** Preset: general API — 120 req / minute */
export const defaultRateLimit = rateLimit(120, 60_000);
