import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL && process.env.NODE_ENV === 'production') {
  throw new Error(
    "DATABASE_URL must be set in production. Did you forget to provision a database?",
  );
}

export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;
export const db = pool ? drizzle(pool, { schema }) : null;

export * from "./schema";
export { ensureSchema } from "./ensure-schema";
