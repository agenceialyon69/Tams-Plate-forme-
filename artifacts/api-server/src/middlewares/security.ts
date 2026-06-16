import type { Request, Response, NextFunction } from "express";

// Strict policy for JSON API responses (no resources loaded at all).
const API_CSP = "default-src 'none'; frame-ancestors 'none'";

// SPA-friendly policy for the served web app. Allows same-origin scripts and
// inline styles (some UI libs inject <style> at runtime), data/blob images.
const APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * Baseline security response headers. The strict CSP applies to API routes;
 * the served frontend gets a policy that still locks the app to same-origin
 * resources without breaking it.
 */
export function securityHeaders(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(self), camera=()");
  res.setHeader(
    "Content-Security-Policy",
    req.path.startsWith("/api") ? API_CSP : APP_CSP,
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
