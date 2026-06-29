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
import { requireAuth, optionalAuth } from "./middlewares/auth";

const app: Express = express();

// Security headers with stricter CSP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      mediaSrc: ["'self'", "https:", "blob:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: [
        "'self'",
        "https://*.supabase.co",
        "https://api.groq.com",
        "https://generativelanguage.googleapis.com",
        "https://openrouter.ai",
        "https://api.deepseek.com",
        "https://dashscope-intl.aliyuncs.com",
        "https://api.mistral.ai",
        "https://router.huggingface.co",
        "https://image.pollinations.ai",
      ],
      frameSrc: [
        "'self'",
        "https://www.youtube.com",
        "https://www.youtube-nocookie.com",
        "https://player.vimeo.com",
        "https://w.soundcloud.com",
        "https://open.spotify.com",
      ],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  xssFilter: true,
  noSniff: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
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
 * CORS - secure strategy:
 *   1. ALLOWED_ORIGINS defined -> restrictive list
 *   2. FRONTEND_URL defined -> allow that specific origin
 *   3. In production without config -> REFUSE (secure default)
 *   4. In development -> localhost allowed
 */
function resolveOrigin(): cors.CorsOptions["origin"] {
  const env = process.env.NODE_ENV;

  if (env === "production") {
    if (process.env.ALLOWED_ORIGINS) {
      return process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim());
    }
    if (process.env.FRONTEND_URL) {
      return process.env.FRONTEND_URL;
    }
    return false;
  }

  const devOrigins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:4173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
  ];

  if (process.env.ALLOWED_ORIGINS) {
    return [...process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim()), ...devOrigins];
  }

  return devOrigins;
}

app.use(cors({
  origin: resolveOrigin(),
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Client-Info", "Apikey", "X-Request-ID"],
  exposedHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "Retry-After"],
  maxAge: 86400,
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

// Auth middleware - public health/auth endpoints always optional.
app.use("/api/healthz", optionalAuth);
app.use("/api/health", optionalAuth);
app.use("/api/auth", optionalAuth);

// INVARIANT (/AGENTS.md) : auth OPTIONNELLE par défaut. TAMS est une plateforme
// PERSONNELLE et le frontend n'authentifie pas encore (aucun token envoyé) :
// exiger requireAuth sur tout /api renvoie 401 partout → app ENTIÈREMENT cassée.
// Mettre REQUIRE_AUTH=true (quand une UI de login Supabase existe) pour exiger le
// JWT. Sinon, on attache l'utilisateur si un token est présent, sans bloquer.
const AUTH_REQUIRED = process.env.REQUIRE_AUTH === "true";
app.use("/api", (req, res, next) => {
  if (req.path.startsWith("/healthz") || req.path.startsWith("/health") || req.path.startsWith("/auth")) {
    return next();
  }
  return AUTH_REQUIRED ? requireAuth(req, res, next) : optionalAuth(req, res, next);
});

app.use("/api", router);

// Serve frontend (SPA)
const __serverDir = dirname(fileURLToPath(import.meta.url));
const staticDir = path.resolve(__serverDir, "..", "..", "tams", "dist", "public");

if (existsSync(staticDir)) {
  app.use(express.static(staticDir, {
    etag: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      } else {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }));
  app.get("/{*splat}", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path.join(staticDir, "index.html"));
  });
  logger.info({ staticDir }, "Serving frontend static files");
} else {
  logger.warn({ staticDir }, "Frontend build not found - only API routes will respond");
}

app.use(errorHandler);

export default app;
