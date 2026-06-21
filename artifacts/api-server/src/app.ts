import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { getDbStatus } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";
import { securityHeaders } from "./middlewares/security";
import { rateLimit } from "./middlewares/rate-limit";
import { requireAuthJwt } from "./middlewares/auth-jwt";

const app: Express = express();

// --- Trust proxy & security basics ---
app.set("trust proxy", 1);
app.disable("x-powered-by");

// --- Logging middleware (pino-http) ---
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// --- Security headers (CSP, HSTS, nosniff, frame-deny, referrer, CORP, COOP) ---
// Covers everything helmet would add; no third-party dep required.
app.use(securityHeaders);

// --- CORS (API routes only) ---
// Static files must NOT go through CORS: Vite production builds add the
// `crossorigin` attribute to <script> and <link> tags, which causes the
// browser to send an Origin header even for same-origin loads. Applying CORS
// globally would block those resources when FRONTEND_URL is not set.
const allowedOrigins = (process.env.FRONTEND_URL ?? "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);

// Safe local/dev patterns: localhost variants + Replit dev domains
const SAFE_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$|^https?:\/\/[^.]+\.replit\.dev(:\d+)?$|^https?:\/\/[^.]+\.repl\.co(:\d+)?$/;

const corsMiddleware = cors({
  origin(origin, callback) {
    // No Origin header = server-to-server or same-origin simple request → allow.
    if (!origin) { callback(null, true); return; }
    // Explicit allowlist (FRONTEND_URL) → allow.
    if (allowedOrigins.includes(origin)) { callback(null, true); return; }
    // No allowlist configured: only allow localhost and Replit dev domains.
    // Reject any external/unknown origin even in single-service mode.
    if (allowedOrigins.length === 0 && SAFE_ORIGIN_RE.test(origin)) { callback(null, true); return; }
    callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Api-Key"],
  credentials: false,
  maxAge: 600,
});

// --- Global baseline rate limit (per IP) ---
// In dev all traffic appears as 127.0.0.1 (Vite proxy) — skip localhost to avoid
// the Red Team test suite exhausting the quota for normal page loads.
const isDev = process.env.NODE_ENV !== "production";
app.use(rateLimit({
  windowMs: 60_000,
  max: 120,
  skip: (req) => isDev && (req.ip === "127.0.0.1" || req.ip === "::1" || req.ip === "::ffff:127.0.0.1"),
}));

// --- Body size caps ---
// Media uploads (audio transcription, ffmpeg processing) need a larger body
// than regular JSON. Keep everything else tight to limit abuse.
const mediaJson = express.json({ limit: "25mb" });
const textJson = express.json({ limit: "512kb" });
const mediaPaths = new Set(["/api/ai/transcribe"]);
app.use((req, res, next) =>
  mediaPaths.has(req.path) || req.path.startsWith("/api/integrations/ffmpeg/")
    ? mediaJson(req, res, next)
    : textJson(req, res, next),
);
app.use(express.urlencoded({ extended: true, limit: "64kb" }));

// --- Locate the built web app ---
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDirCandidates = [
  process.env.CLIENT_DIR,
  path.resolve(process.cwd(), "artifacts/kore/dist/public"),
  path.resolve(here, "../../kore/dist/public"),
  path.resolve(here, "../../../kore/dist/public"),
  path.resolve(here, "public"),
].filter((d): d is string => Boolean(d));

const clientDir = clientDirCandidates.find((d) =>
  existsSync(path.join(d, "index.html")),
);

// --- Healthcheck public ---
// Always returns 200 so the platform healthcheck stays green even while the DB
// is still connecting (resilient startup). The `db` field reports the real
// readiness ("ready" once the schema is applied, "connecting" otherwise) — an
// honest operational signal, with no secret/host leak. Liveness vs readiness.
app.get("/api/healthz", (_req, res) => {
  const db = getDbStatus().dbReady ? "ready" : "connecting";
  res.status(200).json({ status: "ok", db });
});

// --- Debug endpoint protégé ---
app.get("/api/_debug", (_req, res) => {
  // Always forbidden in production.
  if (process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // In dev: DEBUG_TOKEN must be explicitly configured AND provided.
  // If DEBUG_TOKEN is not set, nobody can access this endpoint (safe default).
  const configuredToken = process.env.DEBUG_TOKEN;
  const providedToken = _req.query.debugToken;
  if (!configuredToken || providedToken !== configuredToken) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const info: Record<string, unknown> = {
    ok: true,
    cwd: process.cwd(),
    here,
    nodeVersion: process.version,
    db: getDbStatus(),
    frontendServed: Boolean(clientDir),
    clientDir: clientDir ?? null,
    candidates: clientDirCandidates.map((d) => ({
      path: d,
      indexExists: existsSync(path.join(d, "index.html")),
    })),
  };

  if (clientDir) {
    try {
      info.clientDirFiles = readdirSync(clientDir);
      const assetsDir = path.join(clientDir, "assets");
      info.assetsFiles = existsSync(assetsDir) ? readdirSync(assetsDir) : null;
      const html = readFileSync(path.join(clientDir, "index.html"), "utf8");
      const refs = Array.from(html.matchAll(/\/assets\/[^"')]+/g)).map(
        (m) => m[0],
      );
      info.referencedAssets = refs.map((r) => ({
        ref: r,
        exists: existsSync(path.join(clientDir, r)),
      }));
    } catch (e) {
      info.readError = String(e);
    }
  }

  res.json(info);
});

// --- CORS sur les routes API uniquement ---
app.use("/api", corsMiddleware);

// --- Auth sur toutes les routes API moins healthz / _debug / auth ---
app.use("/api", requireAuthJwt);

// --- API router (protégé) ---
app.use("/api", router);

// --- Unknown API routes → 404 JSON ---
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// --- Single-service mode: serve web app ---
if (clientDir) {
  logger.info({ clientDir }, "Serving web app");
  app.use(
    express.static(clientDir, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );

  app.use((req, res, next) => {
    if (req.method !== "GET") {
      next();
      return;
    }
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(clientDir, "index.html"));
  });
} else {
  logger.warn(
    { candidates: clientDirCandidates },
    "Web app build not found — serving API only",
  );
}

// --- Centralized error handler ---
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof Error && err.message === "Not allowed by CORS") {
    res.status(403).json({ error: "Origin not allowed" });
    return;
  }
  const errType =
    err && typeof err === "object" && "type" in err
      ? (err as { type?: string }).type
      : undefined;
  if (errType === "entity.too.large") {
    res.status(413).json({ error: "Payload too large" });
    return;
  }
  if (errType === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }
  req.log?.error({ err }, "Unhandled request error");
  res.status(500).json({ error: "Internal server error" });
});

export default app;
