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

// On écoute IMMÉDIATEMENT pour que le healthcheck plateforme (/api/healthz, qui
// ne touche pas la base) passe tout de suite. La préparation du schéma tourne en
// arrière-plan et réessaie jusqu'à ce que Postgres soit joignable — une base qui
// démarre lentement ne doit pas faire échouer le déploiement (pas de crash-loop).
app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  startObservability();
  logger.info({ port }, "Server listening");

  // ensureSchema ne lève jamais : un souci DB dégrade les routes DB sans crasher
  // le process. Le serveur continue de servir le frontend et /api/healthz.
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
