import app from "./app";
import { logger } from "./lib/logger";
import { startObservability, stopObservability } from "./lib/observability";
import { runWorkflowEngine, stopWorkflowEngine } from "./lib/workflows";
import { initCacheTable } from "./lib/cache-db";

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

// Initialize persistent cache table before starting server
initCacheTable().catch((err) => {
  logger.error({ err }, "Failed to initialize cache table");
});

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  startObservability();
  runWorkflowEngine();
  logger.info({ port }, "Server listening");
});

process.on("SIGTERM", () => {
  stopObservability();
  stopWorkflowEngine();
  process.exit(0);
});

process.on("SIGINT", () => {
  stopObservability();
  stopWorkflowEngine();
  process.exit(0);
});
