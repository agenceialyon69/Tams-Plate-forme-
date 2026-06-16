import { createHash, timingSafeEqual } from "node:crypto";
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
    logger.info("Redis connected for auth rate limiting");
  })
  .catch((err) => {
    logger.error({ err }, "Redis connection failed for auth — using memory fallback");
  });

// --- Mémoire de fallback (rate limit + anti-brute-force) ---

interface MemoryRateEntry {
  count: number;
  resetAt: number;
}

interface MemoryFailureEntry {
  failures: number;
  resetAt: number;
}

const memoryRateStore = new Map<string, MemoryRateEntry>();
const memoryFailureStore = new Map<string, MemoryFailureEntry>();

function memoryRateLimit(ip: string, endpoint: string, windowMs: number, max: number): { ok: boolean; remaining: number } {
  const key = `mratelimit:${ip}:${endpoint}`;
  const now = Date.now();

  let entry = memoryRateStore.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    memoryRateStore.set(key, entry);
  }

  entry.count += 1;
  const remaining = Math.max(0, max - entry.count);

  if (entry.count > max) {
    return { ok: false, remaining: 0 };
  }

  return { ok: true, remaining };
}

function memoryAuthFailure(ip: string, windowMs: number, max: number): { ok: boolean; remaining: number } {
  const key = `mauthfail:${ip}`;
  const now = Date.now();

  let entry = memoryFailureStore.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { failures: 0, resetAt: now + windowMs };
    memoryFailureStore.set(key, entry);
  }

  entry.failures += 1;
  const remaining = Math.max(0, max - entry.failures);

  if (entry.failures >= max) {
    return { ok: false, remaining: 0 };
  }

  return { ok: true, remaining };
}

// --- Configuration ---

interface AuthConfig {
  currentToken: string;
  previousToken?: string | null;
  maxAuthRequestsPerMinute: number;
  maxAuthFailuresPerHour: number;
  blockWindowMinutes: number;
  maxTokenLength: number;
}

function loadConfig(): AuthConfig {
  const currentToken = process.env.API_AUTH_TOKEN;
  const previousToken = process.env.API_AUTH_TOKEN_PREVIOUS || null;

  if (!currentToken || currentToken.length < 16) {
    throw new Error(
      "API_AUTH_TOKEN must be set to a strong secret (>= 16 chars). " +
        "Generate one with: openssl rand -hex 32",
    );
  }

  const maxAuthRequestsPerMinute =
    parseInt(process.env.API_MAX_AUTH_REQUESTS_PER_MIN || "60", 10);
  const maxAuthFailuresPerHour =
    parseInt(process.env.API_MAX_AUTH_FAILURES_PER_HOUR || "100", 10);
  const blockWindowMinutes =
    parseInt(process.env.API_BLOCK_WINDOW_MIN || "10", 10);
  const maxTokenLength =
    parseInt(process.env.API_MAX_TOKEN_LENGTH || "1024", 10);

  if (maxAuthRequestsPerMinute <= 0 || maxAuthRequestsPerMinute > 1000) {
    throw new Error("API_MAX_AUTH_REQUESTS_PER_MIN must be between 1 and 1000.");
  }
  if (maxAuthFailuresPerHour <= 0 || maxAuthFailuresPerHour > 10000) {
    throw new Error("API_MAX_AUTH_FAILURES_PER_HOUR must be between 1 and 10000.");
  }
  if (blockWindowMinutes <= 0 || blockWindowMinutes > 60) {
    throw new Error("API_BLOCK_WINDOW_MIN must be between 1 and 60.");
  }
  if (maxTokenLength <= 0 || maxTokenLength > 10_000) {
    throw new Error("API_MAX_TOKEN_LENGTH must be between 1 and 10000.");
  }

  return {
    currentToken,
    previousToken,
    maxAuthRequestsPerMinute,
    maxAuthFailuresPerHour,
    blockWindowMinutes,
    maxTokenLength,
  };
}

const config = loadConfig();
const currentDigest = createHash("sha256").update(config.currentToken).digest();
const previousDigest = config.previousToken
  ? createHash("sha256").update(config.previousToken).digest()
  : null;

// --- Extraction IP sécurisée (req.ip uniquement) ---

function extractIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

// --- Extraction du token (avec limite de longueur) ---

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    if (token.length > 0 && token.length <= config.maxTokenLength) {
      return token;
    }
  }

  const apiKey = req.headers["x-api-key"];
  if (typeof apiKey === "string" && apiKey.length > 0 && apiKey.length <= config.maxTokenLength) {
    return apiKey;
  }

  return null;
}

// --- Comparaison sécurisée ---

function isValid(token: string): { valid: boolean; type: "current" | "previous" | null } {
  const candidate = createHash("sha256").update(token).digest();

  if (
    candidate.length === currentDigest.length &&
    timingSafeEqual(candidate, currentDigest)
  ) {
    return { valid: true, type: "current" };
  }

  if (
    previousDigest &&
    candidate.length === previousDigest.length &&
    timingSafeEqual(candidate, previousDigest)
  ) {
    return { valid: true, type: "previous" };
  }

  return { valid: false, type: null };
}

// --- Rate limiting Redis (CORRECT : expire + TTL en secondes) ---

async function checkAuthRateLimit(ip: string, endpoint: string): Promise<{ ok: boolean; remaining: number }> {
  const key = `authratelimit:${ip}:${endpoint}`;
  const windowMs = 60_000;
  const ttlSeconds = Math.ceil(windowMs / 1000);

  if (!redisReady) {
    return memoryRateLimit(ip, endpoint, windowMs, config.maxAuthRequestsPerMinute);
  }

  try {
    const [count] = await redis.multi()
      .incr(key)
      .expire(key, ttlSeconds)
      .exec();
    const current = (count as number) ?? 1;
    const remaining = Math.max(0, config.maxAuthRequestsPerMinute - current);

    if (current > config.maxAuthRequestsPerMinute) {
      return { ok: false, remaining: 0 };
    }

    return { ok: true, remaining };
  } catch (err) {
    logger.error({ err }, "Redis auth rate limit error, using memory fallback");
    return memoryRateLimit(ip, endpoint, windowMs, config.maxAuthRequestsPerMinute);
  }
}

// --- Anti-brute-force Redis (CORRECT : expire + TTL en secondes) ---

async function checkAndRecordAuthFailure(ip: string): Promise<{ ok: boolean; remaining: number }> {
  const key = `authfail:${ip}`;
  const windowMs = config.blockWindowMinutes * 60_000;
  const ttlSeconds = Math.ceil(windowMs / 1000);

  if (!redisReady) {
    return memoryAuthFailure(ip, windowMs, config.maxAuthFailuresPerHour);
  }

  try {
    const multi = redis.multi();
    multi.incr(key);
    multi.expire(key, ttlSeconds);
    const [count] = await multi.exec();
    const failures = (count as number) ?? 1;

    if (failures >= config.maxAuthFailuresPerHour) {
      return { ok: false, remaining: 0 };
    }

    return { ok: true, remaining: config.maxAuthFailuresPerHour - failures };
  } catch (err) {
    logger.error({ err }, "Redis auth failure error, using memory fallback");
    return memoryAuthFailure(ip, windowMs, config.maxAuthFailuresPerHour);
  }
}

// --- Middleware principal (async + await linéaire) ---

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const path = req.path;
  const ip = extractIp(req);
  const endpoint = path;

  // 1. Healthcheck public
  if (path === "/api/healthz") {
    return next();
  }

  // 2. Debug public (protégé par token ou NODE_ENV dans app.ts)
  if (path === "/api/_debug") {
    return next();
  }

  const isApiRoute = path === "/api" || path.startsWith("/api/");

  if (!isApiRoute) {
    return next();
  }

  // Rate limiting
  const rate = await checkAuthRateLimit(ip, endpoint);
  if (!rate.ok) {
    logger.warn({ path: req.path, method: req.method, ip }, "Rate limit exceeded for IP");
    res.setHeader("X-RateLimit-Remaining", "0");
    res.setHeader("X-RateLimit-Limit", String(config.maxAuthRequestsPerMinute));
    res.status(429).json({ error: "Too many requests" });
    return;
  }

  res.setHeader("X-RateLimit-Remaining", String(rate.remaining));
  res.setHeader("X-RateLimit-Limit", String(config.maxAuthRequestsPerMinute));

  // Anti-brute-force
  const fail = await checkAndRecordAuthFailure(ip);
  if (!fail.ok) {
    logger.warn({ path: req.path, method: req.method, ip }, "IP blocked for excessive auth failures");
    res.setHeader("X-Auth-Failures-Remaining", "0");
    res.status(403).json({ error: "Access blocked. Contact support." });
    return;
  }

  res.setHeader("X-Auth-Failures-Remaining", String(fail.remaining));

  // Token
  const token = extractToken(req);
  if (!token) {
    logger.warn({ path: req.path, method: req.method, ip }, "Missing auth token");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { valid, type } = isValid(token);
  if (!valid) {
    logger.warn({ path: req.path, method: req.method, ip }, "Invalid auth token");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (type === "previous") {
    logger.info({ path: req.path, method: req.method, ip }, "Client using previous token");
  }

  req.headers["x-auth-token-type"] = type;
  return next();
}
