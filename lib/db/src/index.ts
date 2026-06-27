import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

// Ne JAMAIS planter le process à l'import (Pilier 11 — observabilité/résilience).
// Le serveur doit démarrer et servir le frontend + /api/healthz pour que le
// déploiement Railway soit « healthy » ; les routes DB échouent proprement
// jusqu'à ce qu'une base soit joignable. node-postgres retombe sur les variables
// PG* standard (PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE) quand aucune chaîne
// de connexion n'est fournie — c'est ce que des hôtes comme Railway injectent.
if (!connectionString && !process.env.PGHOST && !process.env.PGDATABASE) {
  console.error(
    "[db] Aucune DATABASE_URL ni variable PG* trouvée. Les fonctionnalités " +
      "base de données seront indisponibles jusqu'à configuration d'une base.",
  );
}

export const pool = new Pool(connectionString ? { connectionString } : {});
export const db = drizzle(pool, { schema });

export * from "./schema";
export { ensureSchema } from "./ensure-schema";
