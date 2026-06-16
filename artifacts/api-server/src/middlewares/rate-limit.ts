import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

// ---------------------------------------------------------------------------
// In-memory rate limiter (sliding-window, per-IP).
// For a single-server personal app this is correct. If you scale horizontally,
// replace the Map with a Redis-backed counter.
// ---------------------------------------------------------------------------

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

function memoryCount(key: string, windowMs: number, max: number): { ok: boolean; remaining: number } {
  const now = Date.now();
  let bucket = memoryBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    memoryBuckets.set(key, bucket);
  }

  bucket.count += 1;
  const remaining = Math.max(0, max - bucket.count);

  return {
    ok: bucket.count <= max,
    remaining,
  };
}

interface RateOptions {
  windowMs: number;
  max: number;
  key?: (req: Request) => string;
}

export function rateLimit(opts: RateOptions) {
  const keyFn = opts.key ?? ((req: Request) => req.ip ?? "unknown");

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `ratelimit:${keyFn(req)}`;
    const { ok, remaining } = memoryCount(key, opts.windowMs, opts.max);

    res.setHeader("X-RateLimit-Limit", String(opts.max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));

    if (!ok) {
      logger.warn(
        { ip: keyFn(req), url: req.url, method: req.method },
        "Rate limit exceeded",
      );
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    next();
  };
}
