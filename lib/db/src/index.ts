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

// INVARIANT (/AGENTS.md) : Postgres hébergé en PUBLIC (Railway proxy, Supabase,
// Neon, Heroku…) EXIGE TLS. Sans `ssl`, node-postgres se connecte en clair →
// la connexion est refusée → TOUTES les requêtes DB échouent (écrans noirs),
// alors que /api/healthz et les endpoints sans DB répondent quand même.
// On active donc SSL automatiquement, SAUF pour localhost et l'URL interne
// Railway (*.railway.internal) qui n'en ont pas besoin — ainsi la CI (Postgres
// local) et le réseau privé Railway continuent de fonctionner.
function buildPoolConfig(): pg.PoolConfig {
  if (!connectionString) return {};
  const isLocalOrInternal =
    /@(localhost|127\.0\.0\.1|\[::1\]|[^/@:]*\.railway\.internal)(:|\/)/.test(connectionString) ||
    /\bsslmode=disable\b/.test(connectionString);
  const needsSSL = !isLocalOrInternal || /\bsslmode=require\b/.test(connectionString);
  return { connectionString, ssl: needsSSL ? { rejectUnauthorized: false } : undefined };
}

export const pool = new Pool(buildPoolConfig());
export const db = drizzle(pool, { schema });

export * from "./schema";
export { ensureSchema } from "./ensure-schema";
