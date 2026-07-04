import type { Request, Response, NextFunction } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "tams_personal_session";
const DEFAULT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export function personalAccessEnabled(): boolean {
  return env("TAMS_PERSONAL_ACCESS_ENABLED") === "true";
}

function maxAgeMs(): number {
  const raw = Number(env("TAMS_PERSONAL_ACCESS_MAX_AGE_MS") || DEFAULT_MAX_AGE_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_AGE_MS;
}

function accessUsername(): string | undefined {
  return env("TAMS_PERSONAL_ACCESS_USERNAME") || env("ADMIN_USERNAME") || "admin";
}

function accessPassword(): string | undefined {
  return env("TAMS_PERSONAL_ACCESS_PASSWORD") || env("ADMIN_PASSWORD");
}

function accessSecret(): string | undefined {
  return env("TAMS_PERSONAL_ACCESS_SECRET") || env("SESSION_SECRET") || env("JWT_SECRET");
}

function configReady(): boolean {
  return !!accessUsername() && !!accessPassword() && !!accessSecret();
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function sign(payload: string): string {
  const secret = accessSecret();
  if (!secret) throw new Error("TAMS_PERSONAL_ACCESS_SECRET_MISSING");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function issueToken(username: string): string {
  const payload = Buffer.from(JSON.stringify({ u: username, iat: Date.now() }), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function verifyToken(token: string | undefined): boolean {
  if (!token || !configReady()) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = sign(payload);
  if (!safeEqual(signature, expected)) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u?: unknown; iat?: unknown };
    if (parsed.u !== accessUsername()) return false;
    if (typeof parsed.iat !== "number") return false;
    if (Date.now() - parsed.iat > maxAgeMs()) return false;
    return true;
  } catch {
    return false;
  }
}

function internalNext(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (raw.startsWith("/personal-access")) return "/";
  return raw.slice(0, 256);
}

function isPublicPath(req: Request): boolean {
  const path = req.path;
  // Login surface toujours accessible.
  if (
    path === "/personal-access" ||
    path === "/personal-access/logout" ||
    path === "/favicon.ico"
  ) {
    return true;
  }
  // Endpoints toujours ouverts : santé (health checks Railway) + auth Supabase.
  // startsWith pour couvrir les sous-chemins éventuels (ex: /api/auth/callback).
  return (
    path === "/api/health" ||
    path === "/api/healthz" ||
    path.startsWith("/api/health/") ||
    path.startsWith("/api/healthz/") ||
    path === "/api/auth" ||
    path.startsWith("/api/auth/")
  );
}

function loginHtml(error?: string, next = "/"): string {
  const safeNext = internalNext(next);
  const errorBlock = error
    ? `<div class="error">${error.replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] || c))}</div>`
    : "";

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TAMS — Accès personnel</title>
  <style>
    :root { color-scheme: dark; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; font-family:Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:#0b1120; color:#e5e7eb; }
    main { width:min(92vw, 420px); padding:28px; border:1px solid rgba(148,163,184,.25); border-radius:20px; background:rgba(15,23,42,.92); box-shadow:0 24px 80px rgba(0,0,0,.38); }
    h1 { margin:0 0 8px; font-size:24px; }
    p { margin:0 0 22px; color:#94a3b8; line-height:1.45; }
    label { display:block; margin:14px 0 6px; color:#cbd5e1; font-size:14px; }
    input { width:100%; box-sizing:border-box; border:1px solid rgba(148,163,184,.35); border-radius:12px; padding:12px 14px; background:#020617; color:#f8fafc; font-size:16px; }
    button { width:100%; margin-top:18px; border:0; border-radius:12px; padding:12px 16px; background:#2563eb; color:white; font-weight:700; font-size:16px; cursor:pointer; }
    button:hover { background:#1d4ed8; }
    .error { margin-bottom:14px; padding:10px 12px; border-radius:12px; background:rgba(220,38,38,.16); border:1px solid rgba(248,113,113,.35); color:#fecaca; }
    .hint { margin-top:14px; font-size:12px; color:#64748b; }
  </style>
</head>
<body>
  <main>
    <h1>TAMS — Accès personnel</h1>
    <p>Projet personnel protégé. Connecte-toi avant d'accéder au Studio et aux fonctions IA.</p>
    ${errorBlock}
    <form method="post" action="/personal-access">
      <input type="hidden" name="next" value="${safeNext.replace(/"/g, "&quot;")}" />
      <label for="username">Identifiant</label>
      <input id="username" name="username" autocomplete="username" value="admin" required />
      <label for="password">Mot de passe</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required />
      <button type="submit">Entrer</button>
    </form>
    <div class="hint">Mode: free-personal. Aucun accès public.</div>
  </main>
</body>
</html>`;
}

export function personalAccessLoginPage(req: Request, res: Response): void {
  if (!personalAccessEnabled()) {
    res.redirect("/");
    return;
  }
  if (!configReady()) {
    res.status(503).type("html").send(loginHtml("Accès personnel mal configuré côté serveur."));
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(loginHtml(undefined, internalNext(req.query.next)));
}

export function personalAccessLoginSubmit(req: Request, res: Response): void {
  if (!personalAccessEnabled()) {
    res.redirect("/");
    return;
  }
  if (!configReady()) {
    res.status(503).type("html").send(loginHtml("Accès personnel mal configuré côté serveur."));
    return;
  }

  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const next = internalNext(req.body?.next);

  if (!safeEqual(username, accessUsername() || "") || !safeEqual(password, accessPassword() || "")) {
    res.status(401).type("html").send(loginHtml("Identifiant ou mot de passe incorrect.", next));
    return;
  }

  res.cookie(COOKIE_NAME, issueToken(username), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: maxAgeMs(),
    path: "/",
  });
  res.redirect(next);
}

export function personalAccessLogout(_req: Request, res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.redirect("/personal-access");
}

export function personalAccessGate(req: Request, res: Response, next: NextFunction): void {
  if (!personalAccessEnabled()) {
    next();
    return;
  }

  if (isPublicPath(req)) {
    next();
    return;
  }

  if (!configReady()) {
    res.status(503).json({ error: "Acces personnel mal configure", code: "PERSONAL_ACCESS_CONFIG_MISSING" });
    return;
  }

  if (verifyToken(readCookie(req, COOKIE_NAME))) {
    next();
    return;
  }

  if (req.path.startsWith("/api/")) {
    res.status(401).json({ error: "Acces personnel requis", login: "/personal-access" });
    return;
  }

  res.redirect(`/personal-access?next=${encodeURIComponent(req.originalUrl || "/")}`);
}
