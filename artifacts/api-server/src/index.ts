import { ensureSchema } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";

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
  // (no restart loop). The server keeps serving the web app and /api/healthz.
  void ensureSchema().then((ok) => {
    if (ok) {
      logger.info("Database schema ready");
    } else {
      logger.error("Database schema not ready after background initialization");
    }
  }).catch((err) => {
    logger.error({ err }, "ensureSchema failed");
  });
});
