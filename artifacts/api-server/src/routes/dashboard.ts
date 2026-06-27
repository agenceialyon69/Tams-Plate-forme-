import { Router } from "express";
import { db } from "@workspace/db";
import {
  tasksTable, projectsTable, contactsTable, memoriesTable,
  decisionsTable, conversationsTable, assetsTable, activityTable
} from "@workspace/db";
import { desc, sql } from "drizzle-orm";

const router = Router();

// ─── DASHBOARD SUMMARY (COUNT(*) SQL — pas de SELECT * global) ────────────────
router.get("/dashboard/summary", async (req, res) => {
  try {
    const [
      taskStats,
      projectStats,
      contactStats,
      [memRow],
      [decRow],
      [convRow],
      [assetRow],
    ] = await Promise.all([
      db.select({
        status: tasksTable.status,
        priority: tasksTable.priority,
        count: sql<number>`COUNT(*)`.mapWith(Number),
      }).from(tasksTable).groupBy(tasksTable.status, tasksTable.priority),

      db.select({
        status: projectsTable.status,
        count: sql<number>`COUNT(*)`.mapWith(Number),
      }).from(projectsTable).groupBy(projectsTable.status),

      db.select({
        status: contactsTable.status,
        count: sql<number>`COUNT(*)`.mapWith(Number),
      }).from(contactsTable).groupBy(contactsTable.status),

      db.select({ count: sql<number>`COUNT(*)`.mapWith(Number) }).from(memoriesTable),
      db.select({ count: sql<number>`COUNT(*)`.mapWith(Number) }).from(decisionsTable),
      db.select({ count: sql<number>`COUNT(*)`.mapWith(Number) }).from(conversationsTable),
      db.select({ count: sql<number>`COUNT(*)`.mapWith(Number) }).from(assetsTable),
    ]);

    // Agréger les stats tâches
    const taskAgg = { total: 0, todo: 0, in_progress: 0, done: 0, cancelled: 0, urgent: 0 };
    for (const row of taskStats) {
      const c = Number(row.count);
      taskAgg.total += c;
      if (row.status === "todo") taskAgg.todo += c;
      if (row.status === "in_progress") taskAgg.in_progress += c;
      if (row.status === "done") taskAgg.done += c;
      if (row.status === "cancelled") taskAgg.cancelled += c;
      if (row.priority === "urgent") taskAgg.urgent += c;
    }

    const projectAgg = { total: 0, active: 0, paused: 0, completed: 0 };
    for (const row of projectStats) {
      const c = Number(row.count);
      projectAgg.total += c;
      if (row.status === "active") projectAgg.active += c;
      if (row.status === "paused") projectAgg.paused += c;
      if (row.status === "completed") projectAgg.completed += c;
    }

    const contactAgg = { total: 0, prospects: 0, clients: 0, active: 0, inactive: 0 };
    for (const row of contactStats) {
      const c = Number(row.count);
      contactAgg.total += c;
      if (row.status === "prospect") contactAgg.prospects += c;
      if (row.status === "client") contactAgg.clients += c;
      if (row.status === "active") contactAgg.active += c;
      if (row.status === "inactive") contactAgg.inactive += c;
    }

    return res.json({
      taskStats: {
        total: taskAgg.total,
        todo: taskAgg.todo,
        inProgress: taskAgg.in_progress,
        done: taskAgg.done,
        urgent: taskAgg.urgent,
      },
      projectStats: projectAgg,
      contactStats: contactAgg,
      memoryCount: memRow?.count ?? 0,
      decisionCount: decRow?.count ?? 0,
      conversationCount: convRow?.count ?? 0,
      assetCount: assetRow?.count ?? 0,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting dashboard summary");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── RECENT ACTIVITY ──────────────────────────────────────────────────────────
router.get("/dashboard/activity", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const activity = await db
      .select()
      .from(activityTable)
      .orderBy(desc(activityTable.createdAt))
      .limit(limit);
    return res.json(activity);
  } catch (err) {
    req.log.error({ err }, "Error getting recent activity");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── WORKLOAD (tâches urgentes / overdue) ─────────────────────────────────────
router.get("/dashboard/workload", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    const [urgent, overdue, inProgress] = await Promise.all([
      db.select({
        id: tasksTable.id,
        title: tasksTable.title,
        priority: tasksTable.priority,
        dueDate: tasksTable.dueDate,
      }).from(tasksTable)
        .where(sql`${tasksTable.priority} = 'urgent' AND ${tasksTable.status} NOT IN ('done','cancelled')`)
        .orderBy(tasksTable.dueDate)
        .limit(10),

      db.select({
        id: tasksTable.id,
        title: tasksTable.title,
        priority: tasksTable.priority,
        dueDate: tasksTable.dueDate,
      }).from(tasksTable)
        .where(sql`${tasksTable.dueDate} IS NOT NULL AND ${tasksTable.dueDate} < ${today} AND ${tasksTable.status} NOT IN ('done','cancelled')`)
        .orderBy(tasksTable.dueDate)
        .limit(10),

      db.select({
        id: tasksTable.id,
        title: tasksTable.title,
        priority: tasksTable.priority,
      }).from(tasksTable)
        .where(sql`${tasksTable.status} = 'in_progress'`)
        .orderBy(desc(tasksTable.updatedAt))
        .limit(10),
    ]);

    return res.json({ urgent, overdue, inProgress });
  } catch (err) {
    req.log.error({ err }, "Error getting workload");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
