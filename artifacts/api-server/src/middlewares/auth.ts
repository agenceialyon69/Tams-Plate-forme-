import { createHash, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

// --- Configuration ---

interface AuthConfig {
  currentToken: string;
  previousToken?: string | null;
  maxAuthRequestsPerMinute: number;
  maxAuthFailuresPerHour: number;
  blockWindowMinutes: number;
  enableJwt: boolean;
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
  const enableJwt = process.env.API_ENABLE_JWT === "true";

  if (maxAuthRequestsPerMinute <= 0 || maxAuthRequestsPerMinute > 1000) {
    throw new Error("API_MAX_AUTH_REQUESTS_PER_MIN must be between 1 and 1000.");
  }
  if (maxAuthFailuresPerHour <= 0 || maxAuthFailuresPerHour > 10000) {
    throw new Error("API_MAX_AUTH_FAILURES_PER_HOUR must be between 1 and 10000.");
  }
  if (blockWindowMinutes <= 0 || blockWindowMinutes > 60) {
    throw new Error("API_BLOCK_WINDOW_MIN must be between 1 and 60.");
  }

  return {
    currentToken,
    previousToken,
    maxAuthRequestsPerMinute,
    maxAuthFailuresPerHour,
    blockWindowMinutes,
    enableJwt,
  };
}

const config = loadConfig();
const currentDigest = createHash("sha256").update(config.currentToken).digest();
const previousDigest = config.previousToken
  ? createHash("sha256").update(config.previousToken).digest()
  : null;

// --- Rate limiting (par IP + par endpoint) ---

interface RateEntry {
  count: number;
  windowStart: number;
}

interface FailureEntry {
  failures: number;
  windowStart: number;
  blocked: boolean;
  blockUntil?: number;
}

const rateStore = new Map<string, RateEntry>();
const failureStore = new Map<string, FailureEntry>();

function checkRateLimit(ip: string, endpoint: string): { ok: boolean; remaining: number } {
  const windowMs = 60_000;
  const now = Date.now();
  const key = `${ip}:${endpoint}`;

  const entry = rateStore.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    rateStore.set(key, { count: 1, windowStart: now });
    return { ok: true, remaining: config.maxAuthRequestsPerMinute - 1 };
  }

  if (entry.count >= config.maxAuthRequestsPerMinute) {
    return { ok: false, remaining: 0 };
  }

  entry.count += 1;
  return { ok: true, remaining: config.maxAuthRequestsPerMinute - entry.count };
}

function checkAndRecordFailure(ip: string): { ok: boolean; remaining: number } {
  const windowMs = config.blockWindowMinutes * 60_000;
  const now = Date.now();

  const entry = failureStore.get(ip) || { failures: 0, windowStart: now, blocked: false };

  if (entry.blocked && entry.blockUntil && now < entry.blockUntil) {
    return { ok: false, remaining: 0 };
  }

  if (entry.blocked && now >= entry.blockUntil) {
    entry.blocked = false;
    entry.failures = 0;
    entry.windowStart = now;
  }

  if (entry.failures >= config.maxAuthFailuresPerHour) {
    entry.blocked = true;
    entry.blockUntil = now + config.blockWindowMinutes * 60_000;
    failureStore.set(ip, entry);
    return { ok: false, remaining: 0 };
  }

  entry.failures += 1;
  failureStore.set(ip, entry);

  return { ok: true, remaining: config.maxAuthFailuresPerHour - entry.failures };
}

function resetSuccess(ip: string) {
  const entry = failureStore.get(ip);
  if (entry) {
    entry.failures = Math.floor(entry.failures / 2);
    failureStore.set(ip, entry);
  }
}

// --- Extraction IP ---

function extractIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp) return realIp;
  return req.ip || req.socket.remoteAddress || "unknown";
}

// --- Extraction du token ---

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    if (token.length > 0) return token;
  }
  const apiKey = req.headers["x-api-key"];
  if (typeof apiKey === "string" && apiKey.length > 0) {
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

// --- Middleware principal ---

/**
 * Middleware d'authentification Red Team 10/10.
 *
 * Règles :
 * 1. /api/healthz → public (pour Railway / healthcheck)
 * 2. /api ou /api/* → privé (token requis + rate limit + anti-brute-force)
 * 3. Tout le reste (/, /dashboard, /assets/*, etc.) → public (SPA)
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const path = req.path;
  const ip = extractIp(req);
  const endpoint = path;

  // 1. Healthcheck public
  if (path === "/api/healthz") {
    return next();
  }

  // 2. Routes API
  const isApiRoute = path === "/api" || path.startsWith("/api/");

  if (isApiRoute) {
    // Rate limiting
    const { ok: rateOk, remaining: rateRemaining } = checkRateLimit(ip, endpoint);
    if (!rateOk) {
      logger.warn(
        { url: req.url, method: req.method, ip, endpoint },
        "Rate limit exceeded for IP",
      );

      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader("X-RateLimit-Limit", String(config.maxAuthRequestsPerMinute));
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    res.setHeader("X-RateLimit-Remaining", String(rateRemaining));
    res.setHeader("X-RateLimit-Limit", String(config.maxAuthRequestsPerMinute));

    // Anti-brute-force
    const { ok: failOk, remaining: failRemaining } = checkAndRecordFailure(ip);
    if (!failOk) {
      logger.warn(
        { url: req.url, method: req.method, ip, endpoint },
        "IP blocked for excessive auth failures",
      );

      res.setHeader("X-Auth-Failures-Remaining", "0");
      res.status(403).json({ error: "Access blocked. Contact support." });
      return;
    }

    res.setHeader("X-Auth-Failures-Remaining", String(failRemaining));

    // Token
    const token = extractToken(req);
    if (!token) {
      logger.warn(
        { url: req.url, method: req.method, ip, endpoint },
        "Missing auth token",
      );

      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { valid, type } = isValid(token);
    if (!valid) {
      logger.warn(
        { url: req.url, method: req.method, ip, endpoint },
        "Invalid auth token",
      );

      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Succès → on reset un peu les failures
    resetSuccess(ip);

    if (type === "previous") {
      logger.info(
        { url: req.url, method: req.method, ip, endpoint },
        "Client using previous token (rotation in progress)",
      );
    }

    // Attache contexte d'auth
    req.headers["x-auth-token-type"] = type;

    return next();
  }

  // 3. Frontend public
  next();
}
