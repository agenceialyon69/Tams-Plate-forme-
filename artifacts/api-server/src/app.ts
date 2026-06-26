import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path, { dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

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
