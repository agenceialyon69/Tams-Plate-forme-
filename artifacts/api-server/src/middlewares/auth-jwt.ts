import { createHash, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: "owner" | "admin" | "member" | "viewer";
  tenantId: number;
  tenantSlug: string;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      tenantId?: number;
    }
  }
}

function getJwtSecret(): string | null {
  const s = process.env.JWT_SECRET;
  return s && s.length >= 32 ? s : null;
}

function getLegacyToken(): string | null {
  return process.env.API_AUTH_TOKEN ?? null;
}

function extractRawToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    const t = header.slice(7).trim();
    if (t.length > 0 && t.length <= 2048) return t;
  }
  const apiKey = req.headers["x-api-key"];
  if (typeof apiKey === "string" && apiKey.length > 0 && apiKey.length <= 2048) {
    return apiKey;
  }
  return null;
}

const PUBLIC_PATHS = new Set([
  "/healthz",
  "/api/healthz",
  "/_debug",
  "/api/_debug",
  "/auth/login",
  "/api/auth/login",
  "/auth/register",
  "/api/auth/register",
]);

export async function requireAuthJwt(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const path = req.path;

  if (PUBLIC_PATHS.has(path)) {
    return next();
  }

  const rawToken = extractRawToken(req);
  if (!rawToken) {
    res.status(401).json({ error: "Non authentifié." });
    return;
  }

  const jwtSecret = getJwtSecret();

  if (jwtSecret) {
    try {
      const payload = jwt.verify(rawToken, jwtSecret) as {
        sub: string;
        email: string;
        name: string;
        role: string;
        tenantId: number;
        tenantSlug: string;
      };

      req.authUser = {
        id: Number(payload.sub),
        email: payload.email,
        name: payload.name,
        role: payload.role as AuthUser["role"],
        tenantId: payload.tenantId,
        tenantSlug: payload.tenantSlug,
      };
      req.tenantId = payload.tenantId;
      return next();
    } catch {
    }
  }

  const legacyToken = getLegacyToken();
  if (legacyToken && legacyToken.length >= 16) {
    const candidateDigest = createHash("sha256").update(rawToken).digest();
    const legacyDigest = createHash("sha256").update(legacyToken).digest();

    if (
      candidateDigest.length === legacyDigest.length &&
      timingSafeEqual(candidateDigest, legacyDigest)
    ) {
      req.authUser = {
        id: 0,
        email: "system@gandal.local",
        name: "System",
        role: "owner",
        tenantId: 1,
        tenantSlug: "default",
      };
      req.tenantId = 1;
      return next();
    }
  }

  logger.warn({ path, ip: req.ip }, "Unauthorized request");
  res.status(401).json({ error: "Non authentifié." });
}

export function requireRole(...roles: AuthUser["role"][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: "Non authentifié." });
      return;
    }

    const roleHierarchy: Record<AuthUser["role"], number> = {
      owner: 4,
      admin: 3,
      member: 2,
      viewer: 1,
    };

    const userLevel = roleHierarchy[req.authUser.role] ?? 0;
    const requiredLevel = Math.min(...roles.map((r) => roleHierarchy[r] ?? 99));

    if (userLevel < requiredLevel) {
      res.status(403).json({ error: "Permissions insuffisantes." });
      return;
    }

    next();
  };
}
