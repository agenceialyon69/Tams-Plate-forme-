import type { Request, Response, NextFunction } from "express";

/**
 * Baseline security response headers. Hand-rolled to avoid adding a
 * dependency. The API serves JSON only (no HTML), so a restrictive CSP and
 * frame/MIME hardening are safe and cheap.
 */
export function securityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'",
  );
  // Tell browsers to pin HTTPS. Harmless over plain HTTP (ignored), valuable
  // behind the platform's TLS terminator in production.
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  res.removeHeader("X-Powered-By");
  next();
}
