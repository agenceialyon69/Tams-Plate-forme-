import { createHash, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

const rawToken = process.env.API_AUTH_TOKEN;

if (!rawToken || rawToken.length < 16) {
  throw new Error(
    "API_AUTH_TOKEN must be set to a strong secret (>= 16 chars). " +
      "Generate one with: openssl rand -hex 32",
  );
}

// Pre-hash the expected token once. Hashing both sides to a fixed-length
// digest lets us use a constant-time comparison without leaking length.
const expectedDigest = createHash("sha256").update(rawToken).digest();

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  const apiKey = req.headers["x-api-key"];
  if (typeof apiKey === "string" && apiKey.length > 0) {
    return apiKey;
  }
  return null;
}

function isValid(token: string): boolean {
  const candidate = createHash("sha256").update(token).digest();
  return timingSafeEqual(candidate, expectedDigest);
}

/**
 * Default-deny authentication for the API. Requires a bearer token (or
 * `x-api-key`) matching the `API_AUTH_TOKEN` secret. Single-user model:
 * the same secret protects every endpoint.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = extractToken(req);
  if (!token || !isValid(token)) {
    logger.warn({ url: req.url, method: req.method }, "Unauthorized request");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
