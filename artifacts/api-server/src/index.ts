import { ensureSchema } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";
import { startObservability, stopObservability } from "./lib/observability";

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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  startObservability();
  logger.info({ port, builder: "nixpacks" }, "TAMS api-server listening (deploy OK)");

  // ensureSchema ne lève jamais : bootstrappe une base vierge en arrière-plan
  // sans bloquer le healthcheck ni crasher le process.
  void ensureSchema().then((ok) => {
    if (ok) logger.info("Database schema ready");
  });
});

process.on("SIGTERM", () => {
  stopObservability();
  process.exit(0);
});

process.on("SIGINT", () => {
  stopObservability();
  process.exit(0);
});
