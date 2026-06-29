import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

// Ne JAMAIS planter à l'import : le serveur doit démarrer et servir le frontend
// + /api/healthz. Fallback sur les variables PG* (Railway). NE PAS RÉVERTER.
if (!connectionString && !process.env.PGHOST && !process.env.PGDATABASE) {
  console.error("[db] Aucune DATABASE_URL ni variable PG*. Fonctionnalités DB indisponibles jusqu'à configuration.");
}

export const pool = new Pool(connectionString ? { connectionString } : {});
export const db = drizzle(pool, { schema });

export * from "./schema";
export { ensureSchema } from "./ensure-schema";
