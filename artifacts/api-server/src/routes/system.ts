import { Router } from "express";
import { db, pool, ensureSchema } from "@workspace/db";
import {
  tasksTable, projectsTable, contactsTable, memoriesTable,
  decisionsTable, conversationsTable, assetsTable, activityTable,
} from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";

const router = Router();

/**
 * Admin-only middleware for sensitive system endpoints
 */
function requireAdminOrDev(_req: any, res: any, next: any) {
  if (process.env.NODE_ENV === "production") {
    const user = _req.user;
    if (!user) {
      return res.status(401).json({ error: "Authentification requise" });
    }
    if (user.role !== "admin") {
      return res.status(403).json({ error: "Acces refuse - droits administrateur requis" });
    }
  }
  next();
}

router.get("/system/validate", requireAdminOrDev, async (_req, res) => {
  try {
    const { runValidation } = await import("../lib/validation");
    const report = await runValidation();
    return res.json(report);
  } catch (err) {
    return res.status(500).json({ error: "Validation echouee", detail: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/system/usage", requireAdminOrDev, async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT type, title, COUNT(*)::int AS count, MAX(created_at) AS last_used
       FROM activity
       WHERE type IN ('tool_call','ai_call','decision')
       GROUP BY type, title
       ORDER BY MAX(created_at) DESC
       LIMIT 60`,
    );
    return res.json({ components: r.rows, generatedAt: new Date().toISOString() });
  } catch (err) {
    return res.status(500).json({ error: "Usage indisponible", detail: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/system/scenarios", requireAdminOrDev, async (_req, res) => {
  try {
    const { runScenarios } = await import("../lib/scenarios");
    return res.json(await runScenarios());
  } catch (err) {
    return res.status(500).json({ error: "Scenarios echoues", detail: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/system/selftest", requireAdminOrDev, async (_req, res) => {
  try {
    const { runSelfTest } = await import("../lib/validation");
    return res.json(await runSelfTest());
  } catch (err) {
    return res.status(500).json({ error: "Self-test echoue", detail: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/system/db", requireAdminOrDev, async (_req, res) => {
  const out: Record<string, unknown> = {};
  const url = process.env.DATABASE_URL || "";
  out.hasDatabaseUrl = !!url;
  out.host = (url.match(/@([^/:]+)/)?.[1]) ?? null;
  out.sslmodeInUrl = url.match(/sslmode=\w+/)?.[0] ?? null;

  try {
    await pool.query("SELECT 1");
    out.canConnect = true;
  } catch (err) {
    out.canConnect = false;
    out.connectError = err instanceof Error ? err.message : String(err);
  }

  if (out.canConnect) {
    try {
      const r = await pool.query("SELECT to_regclass('public.tasks') AS t");
      out.tasksTableExists = r.rows[0]?.t != null;
    } catch (err) {
      out.tasksTableExists = "error";
      out.schemaCheckError = err instanceof Error ? err.message : String(err);
    }
  }
  return res.json(out);
});

router.get("/system/ensure-schema", requireAdminOrDev, async (_req, res) => {
  try {
    const ok = await ensureSchema();
    return res.json({ ok });
  } catch (err) {
    return res.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/system/audit", async (req, res) => {
  try {
    const { type, limit } = req.query;
    const max = Math.min(Number(limit) || 100, 500);
    let query = db.select().from(activityTable).orderBy(desc(activityTable.createdAt)).limit(max);
    const rows = await query;
    const userId = (req as any).user?.id;
    const filtered = rows.filter(r => {
      if (!userId) return false;
      return (r as any).user_id === userId || (!type ? true : r.type === type);
    });
    return res.json(filtered.slice(0, max));
  } catch (err) {
    req.log.error({ err }, "Error getting audit log");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/system/stats", async (req, res) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.json({
        tables: { tasks: 0, projects: 0, contacts: 0, memories: 0, decisions: 0, conversations: 0, assets: 0, activity: 0 },
        totalRecords: 0,
        status: "unauthenticated",
      });
    }

    const [tasks, projects, contacts, memories, decisions, conversations, assets, activity] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(tasksTable).where(eq((tasksTable as any).user_id, userId)),
      db.select({ count: sql<number>`COUNT(*)` }).from(projectsTable).where(eq((projectsTable as any).user_id, userId)),
      db.select({ count: sql<number>`COUNT(*)` }).from(contactsTable).where(eq((contactsTable as any).user_id, userId)),
      db.select({ count: sql<number>`COUNT(*)` }).from(memoriesTable).where(eq((memoriesTable as any).user_id, userId)),
      db.select({ count: sql<number>`COUNT(*)` }).from(decisionsTable).where(eq((decisionsTable as any).user_id, userId)),
      db.select({ count: sql<number>`COUNT(*)` }).from(conversationsTable).where(eq((conversationsTable as any).user_id, userId)),
      db.select({ count: sql<number>`COUNT(*)` }).from(assetsTable).where(eq((assetsTable as any).user_id, userId)),
      db.select({ count: sql<number>`COUNT(*)` }).from(activityTable).where(eq((activityTable as any).user_id, userId)),
    ]);

    return res.json({
      tables: {
        tasks: Number(tasks[0]?.count ?? 0), projects: Number(projects[0]?.count ?? 0),
        contacts: Number(contacts[0]?.count ?? 0), memories: Number(memories[0]?.count ?? 0),
        decisions: Number(decisions[0]?.count ?? 0), conversations: Number(conversations[0]?.count ?? 0),
        assets: Number(assets[0]?.count ?? 0), activity: Number(activity[0]?.count ?? 0),
      },
      totalRecords: Number(tasks[0]?.count ?? 0) + Number(projects[0]?.count ?? 0) + Number(contacts[0]?.count ?? 0) + Number(memories[0]?.count ?? 0) + Number(decisions[0]?.count ?? 0) + Number(conversations[0]?.count ?? 0) + Number(assets[0]?.count ?? 0) + Number(activity[0]?.count ?? 0),
      status: "ok",
    });
  } catch (err) {
    req.log.error({ err }, "Error getting system stats");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/system/ai", async (_req, res) => {
  try {
    const { aiConfigured, aiProviders } = await import("../lib/ai");
    const provs = aiProviders();
    return res.json({
      configured: aiConfigured(),
      providers: provs,
      primary: provs[0] ?? null,
      hint: provs.length === 0 ? "Aucun fournisseur IA gratuit configure." : null,
    });
  } catch (err) {
    _req.log?.error?.({ err }, "Error getting AI status");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/system/export", async (req, res) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Authentification requise" });
    }

    const [tasks, projects, contacts, memories, decisions, conversations, assets, activity] = await Promise.all([
      db.select().from(tasksTable).where(eq((tasksTable as any).user_id, userId)),
      db.select().from(projectsTable).where(eq((projectsTable as any).user_id, userId)),
      db.select().from(contactsTable).where(eq((contactsTable as any).user_id, userId)),
      db.select().from(memoriesTable).where(eq((memoriesTable as any).user_id, userId)),
      db.select().from(decisionsTable).where(eq((decisionsTable as any).user_id, userId)),
      db.select().from(conversationsTable).where(eq((conversationsTable as any).user_id, userId)),
      db.select().from(assetsTable).where(eq((assetsTable as any).user_id, userId)),
      db.select().from(activityTable).where(eq((activityTable as any).user_id, userId)).orderBy(desc(activityTable.createdAt)).limit(500),
    ]);

    return res.json({
      exportedAt: new Date().toISOString(),
      version: "1.0",
      data: { tasks, projects, contacts, memories, decisions, conversations, assets, activity },
    });
  } catch (err) {
    req.log.error({ err }, "Error exporting data");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
