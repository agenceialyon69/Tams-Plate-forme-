import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { securityHeaders } from "./middlewares/security";
import { rateLimit } from "./middlewares/rate-limit";

const app: Express = express();

// Trust the platform proxy so req.ip reflects the real client (rate limiting).
app.set("trust proxy", 1);
app.disable("x-powered-by");

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

app.use(securityHeaders);

// CORS: strict allowlist from FRONTEND_URL (comma-separated). No wildcard
// reflection, no broad ".vercel.app" suffix matching. Same-origin requests
// (no Origin header) are always allowed.
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

// Global baseline rate limit (per IP). Stricter per-route limits are applied
// to expensive LLM endpoints inside the router.
app.use(rateLimit({ windowMs: 60_000, max: 120 }));

// Explicit body size caps. Text endpoints are capped tightly; only the audio
// transcription endpoint is allowed a larger base64 payload.
const audioJson = express.json({ limit: "10mb" });
const textJson = express.json({ limit: "512kb" });
app.use((req, res, next) =>
  req.path === "/api/ai/transcribe"
    ? audioJson(req, res, next)
    : textJson(req, res, next),
);
app.use(express.urlencoded({ extended: true, limit: "64kb" }));

app.use("/api", router);

// Unknown API routes get a generic JSON 404 (no Express HTML default).
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Centralized error handler: generic message to the client, full detail to
// the server log. Must be registered last and take 4 args.
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
