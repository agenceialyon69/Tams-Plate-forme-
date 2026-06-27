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

// CORS: restrict in production
app.use(cors({
  origin: process.env.NODE_ENV === "production"
    ? (process.env.ALLOWED_ORIGINS?.split(",") || false)
    : true,
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
app.use("/api", defaultRateLimit);

app.use("/api", router);

// Centralized error handler — must be last
app.use(errorHandler);

if (process.env.NODE_ENV === "production") {
  // Bundle is at: <root>/artifacts/api-server/dist/index.mjs
  // Frontend is at: <root>/artifacts/tams/dist/public
  // From dist/ → ../.. → artifacts/ → tams/dist/public
  const __serverDir = dirname(fileURLToPath(import.meta.url));
  const staticDir = path.resolve(__serverDir, "..", "..", "tams", "dist", "public");

  if (existsSync(staticDir)) {
    app.use(express.static(staticDir));
    // Express 5: use /{*splat} instead of * for wildcard
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
    logger.info({ staticDir }, "Serving frontend static files");
  } else {
    logger.warn({ staticDir }, "Frontend build not found");
  }
}

export default app;
