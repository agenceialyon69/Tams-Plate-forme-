import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import path, { dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { logger } from "./lib/logger";
import { aiRateLimit, defaultRateLimit } from "./middlewares/rate-limit";
import { errorHandler } from "./middlewares/error-handler";
import { trackRequest, startObservability } from "./lib/observability";

const app: Express = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      mediaSrc: ["'self'", "https:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      // Embeds Studio (lecteurs gratuits) : YouTube, Vimeo, SoundCloud, Spotify.
      frameSrc: [
        "'self'",
        "https://www.youtube.com",
        "https://www.youtube-nocookie.com",
        "https://player.vimeo.com",
        "https://w.soundcloud.com",
        "https://open.spotify.com",
      ],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

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

/**
 * CORS — stratégie :
 *   1. ALLOWED_ORIGINS défini   → liste restrictive (séparée par des virgules)
 *   2. FRONTEND_URL défini      → autoriser cette origine spécifique
 *   3. Aucun des deux           → origine réfléchie (reflect-origin, compatible credentials)
 *      En production Railway, le frontend est servi par le même process :
 *      les requêtes sont same-origin et les headers CORS ne s'appliquent pas.
 *      Cette config n'affecte que les requêtes cross-origin (dev, Postman, etc.).
 */
function resolveOrigin(): cors.CorsOptions["origin"] {
  if (process.env.NODE_ENV !== "production") return true;
  if (process.env.ALLOWED_ORIGINS) return process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim());
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL;
  // reflect-origin : compatible avec credentials et toutes origines
  return true;
}

app.use(cors({
  origin: resolveOrigin(),
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting: AI endpoints first (stricter), then general API
app.use("/api/chat", aiRateLimit);
app.use("/api/briefing", aiRateLimit);
app.use("/api/decisions", aiRateLimit);
app.use("/api/studio", aiRateLimit);
app.use("/api/conversations", aiRateLimit);
app.use("/api/agents", aiRateLimit);
app.use("/api", defaultRateLimit);

// Request tracking middleware for observability
app.use("/api", (req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    trackRequest(req, res, duration);
  });
  next();
});

app.use("/api", router);

// Start observability layer
startObservability();

// Centralized error handler — must be last
app.use(errorHandler);

if (process.env.NODE_ENV === "production") {
  // Bundle est à : <root>/artifacts/api-server/dist/index.mjs
  // Frontend est à : <root>/artifacts/tams/dist/public
  // Depuis dist/ → ../.. → artifacts/ → tams/dist/public
  const __serverDir = dirname(fileURLToPath(import.meta.url));
  const staticDir = path.resolve(__serverDir, "..", "..", "tams", "dist", "public");

  if (existsSync(staticDir)) {
    app.use(express.static(staticDir));
    // Express 5 : /{*splat} pour le wildcard (pas *)
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
    logger.info({ staticDir }, "Serving frontend static files");
  } else {
    logger.warn({ staticDir }, "Frontend build not found — only API routes will respond");
  }
}

export default app;
