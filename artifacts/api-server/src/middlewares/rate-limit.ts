import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

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
  skip?: (req: Request) => boolean;
}

// Each rateLimit() instance gets its own bucket namespace so independent
// limiters (e.g. global 120/min vs auth 10/min) never share a counter — sharing
// would make the strictest limit apply to all traffic.
let instanceCounter = 0;

export function rateLimit(opts: RateOptions) {
  const ns = `rl${instanceCounter++}`;
  const keyFn = opts.key ?? ((req: Request) => req.ip ?? "unknown");

  return (req: Request, res: Response, next: NextFunction): void => {
    if (opts.skip?.(req)) { next(); return; }
    const key = `${ns}:${keyFn(req)}`;
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

export function rateLimitByTenant(opts: Omit<RateOptions, "key">) {
  return rateLimit({
    ...opts,
    key: (req: Request) => `tenant:${req.tenantId ?? req.ip ?? "unknown"}`,
  });
}

export function rateLimitByUser(opts: Omit<RateOptions, "key">) {
  return rateLimit({
    ...opts,
    key: (req: Request) => `user:${req.authUser?.id ?? req.ip ?? "unknown"}`,
  });
}
