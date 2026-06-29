import app from "./app";
import { logger } from "./lib/logger";
import { startObservability, stopObservability } from "./lib/observability";
import { ensureSchema } from "@workspace/db";

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

function listen() {
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    startObservability();
    logger.info({ port }, "Server listening");
  });
}

// INVARIANT (/AGENTS.md) : auto-migration idempotente (pgvector + enums + 13
// tables) pour qu'une base Railway vierge fonctionne sans étape manuelle.
// Sans ça : tables absentes -> endpoints 500 -> écrans noirs.
//
// On lance ensureSchema EN ARRIÈRE-PLAN et on écoute IMMÉDIATEMENT : le
// healthcheck Railway (timeout 30 s) doit répondre tout de suite, alors que
// waitForDatabase peut attendre jusqu'à 60 s qu'une DB lente démarre. La
// liveness (écoute/healthz) ne doit jamais dépendre de la readiness (schéma).
// NE PAS RETIRER cet appel à ensureSchema().
ensureSchema()
  .then(() => logger.info("ensureSchema: schéma vérifié/créé"))
  .catch((err) => logger.error({ err }, "ensureSchema a échoué — on sert quand même"));

listen();

process.on("SIGTERM", () => {
  stopObservability();
  process.exit(0);
});

process.on("SIGINT", () => {
  stopObservability();
  process.exit(0);
});
