import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

// Don't crash the process at import. The server should still boot and serve the
// web app + /api/healthz so the deploy is healthy; DB-backed routes fail with a
// clear error until a database is reachable. node-postgres falls back to the
// standard PG* env vars (PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE) when no
// connection string is given — these are what hosts like Railway inject.
if (!connectionString && !process.env.PGHOST && !process.env.PGDATABASE) {
  console.error(
    "[db] No DATABASE_URL or PG* env vars found. Database features will be " +
      "unavailable until a database connection is configured.",
  );
}

export const pool = new Pool(connectionString ? { connectionString } : {});
export const db = drizzle(pool, { schema });

export * from "./schema";
export { ensureSchema, getDbStatus } from "./ensure-schema";
