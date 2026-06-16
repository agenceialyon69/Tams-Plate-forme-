import type { Request, Response, NextFunction } from "express";
import { createClient } from "redis";
import { logger } from "../lib/logger";

const redis = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
  },
});

let redisReady = false;
redis.connect()
  .then(() => {
    redisReady = true;
    logger.info("Redis connected");
  })
  .catch((err) => {
    logger.error({ err }, "Redis connection failed");
  });

// Fallback mémoire (si Redis hors ligne)
const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

function memoryRateLimit(key: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  let bucket = memoryBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    memoryBuckets.set(key, bucket);
  }

  bucket.count += 1;
  if (bucket.count > max) {
    return false;
  }

  return true;
}

interface RateOptions {
  windowMs: number;
  max: number;
  key?: (req: Request) => string;
}

export function rateLimitRedis(opts: RateOptions) {
  const keyFn = opts.key ?? ((req: Request) => req.ip ?? "unknown");

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `ratelimit:${keyFn(req)}`;
    const now = Date.now();
    const windowSeconds = Math.ceil(opts.windowMs / 1000);

    if (!redisReady) {
      // Fallback mémoire
      const ok = memoryRateLimit(key, opts.windowMs, opts.max);
      const remaining = ok ? opts.max - memoryBuckets.get(key)?.count ?? opts.max : 0;

      res.setHeader("X-RateLimit-Limit", String(opts.max));
      res.setHeader("X-RateLimit-Remaining", String(remaining));

      if (!ok) {
        logger.warn(
          { ip: keyFn(req), url: req.url, method: req.method },
          "Rate limit exceeded (memory fallback)",
        );
        res.status(429).json({ error: "Too many requests" });
        return;
      }

      return next();
    }

    try {
      const multi = redis.multi();
      multi.incr(key);
      multi.expire(key, windowSeconds);

      const [count] = await multi.exec();
      const current = (count as number) ?? 1;
      const remaining = Math.max(0, opts.max - current);

      res.setHeader("X-RateLimit-Limit", String(opts.max));
      res.setHeader("X-RateLimit-Remaining", String(remaining));

      if (current > opts.max) {
        logger.warn(
          {
            ip: keyFn(req),
            url: req.url,
            method: req.method,
            count: current,
            max: opts.max,
          },
          "Rate limit exceeded (Redis)",
        );
        res.status(429).json({ error: "Too many requests" });
        return;
      }

      next();
    } catch (err) {
      logger.error({ err }, "Redis rate limit error, using memory fallback");

      // Fallback mémoire
      const ok = memoryRateLimit(key, opts.windowMs, opts.max);
      const remaining = ok ? opts.max - memoryBuckets.get(key)?.count ?? opts.max : 0;

      res.setHeader("X-RateLimit-Limit", String(opts.max));
      res.setHeader("X-RateLimit-Remaining", String(remaining));

      if (!ok) {
        res.status(429).json({ error: "Too many requests" });
        return;
      }

      next();
    }
  };
}
