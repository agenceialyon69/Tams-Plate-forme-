import { createHash, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

// ---------------------------------------------------------------------------
// In-memory rate limiting (no Redis dependency — correct for a single-server
// personal app; replace with Redis if you scale horizontally).
// ---------------------------------------------------------------------------

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

function memoryRateLimit(
  ip: string,
  endpoint: string,
  windowMs: number,
  max: number,
): { ok: boolean; remaining: number } {
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

function memoryAuthFailure(
  ip: string,
  windowMs: number,
  max: number,
): { ok: boolean; remaining: number } {
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

// ---------------------------------------------------------------------------
// Configuration (loaded once at startup — server refuses to start if invalid)
// ---------------------------------------------------------------------------

interface AuthConfig {
  currentToken: string;
  previousToken?: string | null;
  maxAuthRequestsPerMinute: number;
  maxAuthFailuresPerWindow: number;
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

  const maxAuthRequestsPerMinute = parseInt(
    process.env.API_MAX_AUTH_REQUESTS_PER_MIN || "60",
    10,
  );
  const maxAuthFailuresPerWindow = parseInt(
    process.env.API_MAX_AUTH_FAILURES_PER_HOUR || "100",
    10,
  );
  const blockWindowMinutes = parseInt(
    process.env.API_BLOCK_WINDOW_MIN || "10",
    10,
  );
  const maxTokenLength = parseInt(
    process.env.API_MAX_TOKEN_LENGTH || "1024",
    10,
  );

  if (maxAuthRequestsPerMinute <= 0 || maxAuthRequestsPerMinute > 1000) {
    throw new Error("API_MAX_AUTH_REQUESTS_PER_MIN must be between 1 and 1000.");
  }
  if (maxAuthFailuresPerWindow <= 0 || maxAuthFailuresPerWindow > 10_000) {
    throw new Error(
      "API_MAX_AUTH_FAILURES_PER_HOUR must be between 1 and 10000.",
    );
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
    maxAuthFailuresPerWindow,
    blockWindowMinutes,
    maxTokenLength,
  };
}

const config = loadConfig();
const currentDigest = createHash("sha256").update(config.currentToken).digest();
const previousDigest = config.previousToken
  ? createHash("sha256").update(config.previousToken).digest()
  : null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    if (token.length > 0 && token.length <= config.maxTokenLength) {
      return token;
    }
  }

  const apiKey = req.headers["x-api-key"];
  if (
    typeof apiKey === "string" &&
    apiKey.length > 0 &&
    apiKey.length <= config.maxTokenLength
  ) {
    return apiKey;
  }

  return null;
}

function isValid(
  token: string,
): { valid: boolean; type: "current" | "previous" | null } {
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

// ---------------------------------------------------------------------------
// Auth middleware (rate limiting + brute-force protection + token check)
// ---------------------------------------------------------------------------

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const path = req.path;
  const ip = extractIp(req);

  // Public routes — no auth required.
  if (path === "/healthz" || path === "/api/healthz") {
    return next();
  }

  // Debug endpoint — handled by NODE_ENV check + DEBUG_TOKEN in app.ts.
  if (path === "/_debug" || path === "/api/_debug") {
    return next();
  }

  // Rate limit all API calls per IP (before token check to prevent timing probes).
  const rate = memoryRateLimit(
    ip,
    "auth",
    60_000,
    config.maxAuthRequestsPerMinute,
  );
  res.setHeader("X-RateLimit-Limit", String(config.maxAuthRequestsPerMinute));
  res.setHeader("X-RateLimit-Remaining", String(rate.remaining));

  if (!rate.ok) {
    logger.warn({ path: req.path, method: req.method, ip }, "Auth rate limit exceeded");
    res.status(429).json({ error: "Too many requests" });
    return;
  }

  // Anti-brute-force: block IP after too many failures.
  const failCheck = memoryAuthFailure(
    ip,
    config.blockWindowMinutes * 60_000,
    config.maxAuthFailuresPerWindow,
  );
  res.setHeader("X-Auth-Failures-Remaining", String(failCheck.remaining));

  if (!failCheck.ok) {
    logger.warn({ path: req.path, method: req.method, ip }, "IP blocked for auth failures");
    res.status(403).json({ error: "Access blocked. Contact support." });
    return;
  }

  // Token extraction + validation.
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
    logger.info({ path: req.path, method: req.method, ip }, "Client using previous token — rotate soon");
  }

  req.headers["x-auth-token-type"] = type ?? undefined;
  return next();
}
