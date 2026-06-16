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
import helmet from "helmet";
import { getDbStatus } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";
import { securityHeaders } from "./middlewares/security";
import { rateLimit } from "./middlewares/rate-limit";
import { requireAuth } from "./middlewares/requireAuth";

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

// --- Helmet security headers (global) ---
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: true,
    dnsPrefetchControl: true,
    frameGuard: true,
    hidePoweredBy: true,
    hsts: true,
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: true,
    referrerPolicy: true,
    xssFilter: true,
  }),
);

// --- Custom security headers (si tu veux compléter Helmet) ---
app.use(securityHeaders);

// --- CORS strict (Frontend_URL only) ---
const allowedOrigins = (process.env.FRONTEND_URL ?? "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Api-Key"],
    credentials: false,
    maxAge: 600,
  }),
);

// --- Global baseline rate limit (per IP) ---
app.use(rateLimit({ windowMs: 60_000, max: 120 }));

// --- Body size caps ---
const audioJson = express.json({ limit: "10mb" });
const textJson = express.json({ limit: "512kb" });
app.use((req, res, next) =>
  req.path === "/api/ai/transcribe"
    ? audioJson(req, res, next)
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
app.get("/api/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// --- Debug endpoint protégé ---
app.get("/api/_debug", (_req, res) => {
  // Option 1 : désactiver en production
  if (process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Option 2 : token obligatoire (si tu veux le garder en prod)
  const debugToken = _req.query.debugToken as string;
  if (debugToken !== process.env.DEBUG_TOKEN) {
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

// --- Auth sur toutes les routes API moins healthz / _debug ---
app.use("/api", requireAuth);

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
