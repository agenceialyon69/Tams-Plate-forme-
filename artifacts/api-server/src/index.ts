import { ensureSchema } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";
import helmet from "helmet";
import express from "express";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// --- Security headers globally ---
app.use(helmet());
app.disable("x-powered-by");

// --- Logging middleware (optionnel, mais recommandé) ---
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info(
      {
        method: req.method,
        url: req.url,
        path: req.path,
        status: res.statusCode,
        duration,
        ip: req.ip,
      },
      "HTTP request",
    );
  });
  next();
});

// Start listening immediately so the platform health check (/api/healthz, which
// does not touch the database) passes right away. Schema creation runs in the
// background and retries until the database is reachable — a slow-starting
// Postgres must not fail the deploy.
app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Prepare the schema in the background. ensureSchema never throws, so a
  // database issue degrades DB-backed routes but never crashes the process
  // (no restart loop). The server ke

eps serving the web app and /api/healthz.
  void ensureSchema().then((ok) => {
    if (ok) {
      logger.info("Database schema ready");
    } else {
      logger.error(
        "Database schema not ready after background initialization",
      );
    }
  }).catch((err) => {
    logger.error({ err }, "ensureSchema failed");
  });
});
