import type { Request, Response, NextFunction } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Minimal in-memory fixed-window rate limiter. No external dependency.
 * Suitable for a single-instance, single-user deployment. For multi-instance
 * deployments, replace the store with a shared backend (e.g. Redis).
 */
export function rateLimit(opts: {
  windowMs: number;
  max: number;
  key?: (req: Request) => string;
}): (req: Request, res: Response, next: NextFunction) => void {
  const buckets = new Map<string, Bucket>();
  const keyFn = opts.key ?? ((req) => req.ip ?? "unknown");

  // Opportunistic cleanup to avoid unbounded growth.
  function sweep(now: number): void {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }

  return (req, res, next) => {
    const now = Date.now();
    if (buckets.size > 10_000) sweep(now);

    const key = keyFn(req);
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, opts.max - bucket.count);
    res.setHeader("X-RateLimit-Limit", String(opts.max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));

    if (bucket.count > opts.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    next();
  };
}
