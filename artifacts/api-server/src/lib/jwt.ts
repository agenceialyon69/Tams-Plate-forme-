import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { logger } from "./logger";

const SESSION_DURATION = process.env.SESSION_DURATION ?? "8h";

/**
 * Resolve the JWT signing secret with the same priority as auth-jwt.ts:
 *   1. JWT_SECRET (>= 32 chars)
 *   2. Derived from API_AUTH_TOKEN (>= 16 chars) — backward-compat fallback
 * Throws if neither is set.
 */
export function getJwtSecret(): string {
  const explicit = process.env.JWT_SECRET;
  if (explicit && explicit.length >= 32) return explicit;

  const legacy = process.env.API_AUTH_TOKEN;
  if (legacy && legacy.length >= 16) {
    if (!explicit) {
      logger.warn(
        "JWT_SECRET not set — deriving from API_AUTH_TOKEN. " +
          "Set JWT_SECRET explicitly to invalidate old tokens on rotation.",
      );
    }
    return createHash("sha256").update("gandal-jwt:" + legacy).digest("hex");
  }

  throw new Error(
    "Authentication misconfigured: set JWT_SECRET (>= 32 chars) or " +
      "API_AUTH_TOKEN (>= 16 chars) environment variable.",
  );
}

export interface JwtUserPayload {
  id: number;
  email: string;
  name: string;
  role: string;
  tenantId: number;
}

/** Sign a JWT for a user+tenant pair. */
export function signUserJwt(
  user: JwtUserPayload,
  tenant: { slug: string },
): string {
  return jwt.sign(
    {
      sub: String(user.id),
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      tenantSlug: tenant.slug,
    },
    getJwtSecret(),
    { expiresIn: SESSION_DURATION } as jwt.SignOptions,
  );
}

export { SESSION_DURATION };
