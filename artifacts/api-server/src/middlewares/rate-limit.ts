import type { Request, Response, NextFunction } from "express";

interface BucketEntry {
  tokens: number;
  lastRefill: number;
}

/**
 * Token-bucket rate limiter with automatic cleanup to prevent memory leaks.
 * Entries older than the window are pruned on each request.
 */
class RateLimiter {
  private store = new Map<string, BucketEntry>();
  private maxTokens: number;
  private windowMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(maxTokens: number, windowMs: number) {
    this.maxTokens = maxTokens;
    this.windowMs = windowMs;
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
    if (this.cleanupInterval) this.cleanupInterval.unref();
  }

  private cleanup(): void {
    const now = Date.now();
    const threshold = now - this.windowMs * 2;
    for (const [key, entry] of this.store.entries()) {
      if (entry.lastRefill < threshold) {
        this.store.delete(key);
      }
    }
  }

  middleware(req: Request, res: Response, next: NextFunction): void {
    const key = req.user?.id || req.ip || "unknown";
    const now = Date.now();

    let entry = this.store.get(key);

    if (!entry) {
      entry = { tokens: this.maxTokens, lastRefill: now };
      this.store.set(key, entry);
    }

    const elapsed = now - entry.lastRefill;
    const refill = Math.floor((elapsed / this.windowMs) * this.maxTokens);

    if (refill > 0) {
      entry.tokens = Math.min(this.maxTokens, entry.tokens + refill);
      entry.lastRefill = now;
    }

    if (entry.tokens <= 0) {
      const retryAfter = Math.ceil(this.windowMs / this.maxTokens);
      res.setHeader("Retry-After", String(retryAfter));
      res.setHeader("X-RateLimit-Limit", String(this.maxTokens));
      res.setHeader("X-RateLimit-Remaining", "0");
      res.status(429).json({ error: "Trop de requetes. Reessaie dans quelques secondes." });
      return;
    }

    entry.tokens -= 1;
    res.setHeader("X-RateLimit-Limit", String(this.maxTokens));
    res.setHeader("X-RateLimit-Remaining", String(entry.tokens));
    next();
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}

// INVARIANT (/AGENTS.md) : LIER la méthode à son instance. `new RateLimiter().middleware`
// exporté tel quel est NON LIÉ → quand Express l'appelle, `this` est undefined →
// "Cannot read properties of undefined (reading 'store')" → 500 sur CHAQUE requête
// (même /api/healthz) → app entièrement morte + healthcheck Railway KO. NE PAS RÉVERTER.
const aiLimiter = new RateLimiter(20, 60_000);
const defaultLimiter = new RateLimiter(120, 60_000);

/** Preset: AI routes - 20 req / minute */
export const aiRateLimit = aiLimiter.middleware.bind(aiLimiter);

/** Preset: general API - 120 req / minute */
export const defaultRateLimit = defaultLimiter.middleware.bind(defaultLimiter);
