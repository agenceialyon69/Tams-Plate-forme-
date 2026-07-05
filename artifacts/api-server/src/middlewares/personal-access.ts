/**
 * TAMS — Personal Admin Access Gate.
 *
 * Rend TAMS PRIVÉ derrière UN SEUL accès admin (email + mot de passe), session
 * par cookie signé. Aligné sur la direction produit : agent personnel privé,
 * PAS de multi-tenant, PAS de token utilisateur, PAS de JWT public comme gate.
 *
 * Ce gate est INDÉPENDANT de REQUIRE_AUTH (auth Supabase JWT). Le code ne met
 * jamais REQUIRE_AUTH=false — voir REDTEAM_PERSONAL_ACCESS.md (bascule prod).
 *
 * Activé UNIQUEMENT si TAMS_PERSONAL_ACCESS_ENABLED=true ; sinon 100% no-op.
 * Fail-closed : activé mais mal configuré → 503, jamais d'accès ouvert.
 *
 * Inspiration (auth-jwt.ts) limitée à : timingSafeEqual, logs unauthorized,
 * public paths contrôlés. Aucun tenantId / role / register / invite / x-api-key.
 */
import type { Request, Response, NextFunction } from "express";
import { createHmac, timingSafeEqual, scryptSync } from "node:crypto";

const COOKIE_NAME = "tams_admin_session";
const DEFAULT_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 h

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export function personalAccessEnabled(): boolean {
  return env("TAMS_PERSONAL_ACCESS_ENABLED") === "true";
}

function maxAgeMs(): number {
  const raw = Number(env("TAMS_SESSION_MAX_AGE_MS") || env("TAMS_PERSONAL_ACCESS_MAX_AGE_MS") || DEFAULT_MAX_AGE_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_AGE_MS;
}

function adminEmail(): string | undefined {
  return env("TAMS_ADMIN_EMAIL");
}

/** Hash recommandé (scrypt) : format "scrypt$<saltHex>$<keyHex>". */
function adminPasswordHash(): string | undefined {
  return env("TAMS_ADMIN_PASSWORD_HASH");
}

/** Mot de passe en clair — SEULEMENT toléré en dev local (déconseillé en prod). */
function adminPasswordPlain(): string | undefined {
  return env("TAMS_ADMIN_PASSWORD");
}

function sessionSecret(): string | undefined {
  // TAMS_SESSION_SECRET prioritaire ; fallbacks pour ne pas casser l'existant.
  return env("TAMS_SESSION_SECRET") || env("TAMS_PERSONAL_ACCESS_SECRET") || env("SESSION_SECRET");
}

function configReady(): boolean {
  const hasSecret = !!adminPasswordHash() || !!adminPasswordPlain();
  return !!adminEmail() && hasSecret && !!sessionSecret();
}

/** Comparaison à temps constant, résistante aux longueurs différentes. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function verifyEmail(input: string): boolean {
  const email = adminEmail();
  if (!email) return false;
  return safeEqual(input.trim().toLowerCase(), email.trim().toLowerCase());
}

/**
 * Vérifie le mot de passe : hash scrypt en priorité, sinon clair (dev).
 * Si un hash est présent mais mal formé → fail-closed (false).
 */
function verifyPassword(input: string): boolean {
  const hash = adminPasswordHash();
  if (hash) {
    const parts = hash.split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;
    try {
      const salt = Buffer.from(parts[1], "hex");
      const expected = Buffer.from(parts[2], "hex");
      if (salt.length === 0 || expected.length === 0) return false;
      const derived = scryptSync(input, salt, expected.length);
      return derived.length === expected.length && timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }
  const plain = adminPasswordPlain();
  if (plain) return safeEqual(input, plain);
  return false;
}

function sign(payload: string): string {
  const secret = sessionSecret();
  if (!secret) throw new Error("TAMS_SESSION_SECRET_MISSING");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function issueToken(email: string): string {
  const payload = Buffer.from(JSON.stringify({ e: email.toLowerCase(), iat: Date.now() }), "utf8").toString("base64url");
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
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { e?: unknown; iat?: unknown };
    if (typeof parsed.e !== "string" || !verifyEmail(parsed.e)) return false;
    if (typeof parsed.iat !== "number") return false;
    if (Date.now() - parsed.iat > maxAgeMs()) return false;
    return true;
  } catch {
    return false;
  }
}

/** Empêche l'open-redirect via ?next= (chemin interne relatif uniquement). */
function internalNext(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (raw.startsWith("/personal-access")) return "/";
  return raw.slice(0, 256);
}

/**
 * Chemins toujours publics quand le gate est actif :
 *   - la surface de login elle-même + favicon ;
 *   - les health checks (Railway) : /api/health, /api/healthz.
 * La page de login est autoportée (CSS inline) : aucun asset statique requis.
 */
function isPublicPath(req: Request): boolean {
  const path = req.path;
  if (
    path === "/personal-access" ||
    path === "/personal-access/logout" ||
    path === "/favicon.ico"
  ) {
    return true;
  }
  return (
    path === "/api/health" ||
    path === "/api/healthz" ||
    path.startsWith("/api/health/") ||
    path.startsWith("/api/healthz/") ||
    // Webhook de capture (n8n → TAMS) : authentifié par son propre secret partagé.
    path === "/api/integrations/telegram-capture"
  );
}

function esc(s: string): string {
  return s.replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] || c));
}

function loginHtml(error?: string, next = "/"): string {
  const safeNext = internalNext(next);
  const errorBlock = error ? `<div class="error">${esc(error)}</div>` : "";

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TAMS — Accès admin</title>
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
    <h1>TAMS — Accès admin</h1>
    <p>Espace personnel privé. Connecte-toi pour accéder à Mon Agent, au Studio et aux fonctions IA.</p>
    ${errorBlock}
    <form method="post" action="/personal-access">
      <input type="hidden" name="next" value="${esc(safeNext)}" />
      <label for="email">Email admin</label>
      <input id="email" name="email" type="email" autocomplete="username" inputmode="email" placeholder="admin@exemple.com" required />
      <label for="password">Mot de passe</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required />
      <button type="submit">Se connecter</button>
    </form>
    <div class="hint">Accès personnel — aucun compte public, aucune inscription.</div>
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
    res.status(503).type("html").send(loginHtml("Accès admin mal configuré côté serveur."));
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
    res.status(503).type("html").send(loginHtml("Accès admin mal configuré côté serveur."));
    return;
  }

  const email = typeof req.body?.email === "string" ? req.body.email : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const next = internalNext(req.body?.next);

  // On vérifie TOUJOURS les deux (temps ~constant) pour ne pas révéler lequel est faux.
  const emailOk = verifyEmail(email);
  const passwordOk = verifyPassword(password);
  if (!emailOk || !passwordOk) {
    req.log?.warn?.({ path: "/personal-access", ok: false }, "personal-access: login refusé");
    res.status(401).type("html").send(loginHtml("Email ou mot de passe incorrect.", next));
    return;
  }

  res.cookie(COOKIE_NAME, issueToken(email), {
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
    // Fail-closed, message non secret.
    res.status(503).json({ error: "Acces admin mal configure", code: "PERSONAL_ACCESS_CONFIG_MISSING" });
    return;
  }

  if (verifyToken(readCookie(req, COOKIE_NAME))) {
    next();
    return;
  }

  if (req.path.startsWith("/api/")) {
    res.status(401).json({ error: "Acces admin requis", login: "/personal-access" });
    return;
  }

  res.redirect(`/personal-access?next=${encodeURIComponent(req.originalUrl || "/")}`);
}
