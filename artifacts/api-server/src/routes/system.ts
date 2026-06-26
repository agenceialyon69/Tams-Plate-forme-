import { Router } from "express";
import { db } from "@workspace/db";
import {
  tasksTable, projectsTable, contactsTable, memoriesTable,
  decisionsTable, conversationsTable, assetsTable, activityTable,
} from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";

const router = Router();

// AUDIT — full activity history with optional type filter
router.get("/system/audit", async (req, res) => {
  try {
    const { type, limit } = req.query;
    const max = Math.min(Number(limit) || 100, 500);

    let query = db.select().from(activityTable).orderBy(desc(activityTable.createdAt)).limit(max);
    const rows = await query;

    const filtered = type ? rows.filter(r => r.type === type) : rows;
    return res.json(filtered);
  } catch (err) {
    req.log.error({ err }, "Error getting audit log");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// STATS — system health and data counts
router.get("/system/stats", async (req, res) => {
  try {
    const [tasks, projects, contacts, memories, decisions, conversations, assets, activity] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(tasksTable),
      db.select({ count: sql<number>`COUNT(*)` }).from(projectsTable),
      db.select({ count: sql<number>`COUNT(*)` }).from(contactsTable),
      db.select({ count: sql<number>`COUNT(*)` }).from(memoriesTable),
      db.select({ count: sql<number>`COUNT(*)` }).from(decisionsTable),
      db.select({ count: sql<number>`COUNT(*)` }).from(conversationsTable),
      db.select({ count: sql<number>`COUNT(*)` }).from(assetsTable),
      db.select({ count: sql<number>`COUNT(*)` }).from(activityTable),
    ]);

    return res.json({
      tables: {
        tasks: Number(tasks[0]?.count ?? 0),
        projects: Number(projects[0]?.count ?? 0),
        contacts: Number(contacts[0]?.count ?? 0),
        memories: Number(memories[0]?.count ?? 0),
        decisions: Number(decisions[0]?.count ?? 0),
        conversations: Number(conversations[0]?.count ?? 0),
        assets: Number(assets[0]?.count ?? 0),
        activity: Number(activity[0]?.count ?? 0),
      },
      totalRecords: Number(tasks[0]?.count ?? 0) + Number(projects[0]?.count ?? 0) + Number(contacts[0]?.count ?? 0) + Number(memories[0]?.count ?? 0) + Number(decisions[0]?.count ?? 0) + Number(conversations[0]?.count ?? 0) + Number(assets[0]?.count ?? 0) + Number(activity[0]?.count ?? 0),
      status: "ok",
    });
  } catch (err) {
    req.log.error({ err }, "Error getting system stats");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// EXPORT — full data export for recovery (JSON)
router.get("/system/export", async (req, res) => {
  try {
    const [tasks, projects, contacts, memories, decisions, conversations, assets, activity] = await Promise.all([
      db.select().from(tasksTable),
      db.select().from(projectsTable),
      db.select().from(contactsTable),
      db.select().from(memoriesTable),
      db.select().from(decisionsTable),
      db.select().from(conversationsTable),
      db.select().from(assetsTable),
      db.select().from(activityTable).orderBy(desc(activityTable.createdAt)).limit(500),
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
