import { Router } from "express";
import { db } from "@workspace/db";
import {
  tasksTable, projectsTable, contactsTable, memoriesTable,
  decisionsTable, conversationsTable, assetsTable, activityTable
} from "@workspace/db";
import { desc } from "drizzle-orm";

const router = Router();

// DASHBOARD SUMMARY
router.get("/dashboard/summary", async (req, res) => {
  try {
    const [tasks, projects, contacts, memories, decisions, conversations, assets] = await Promise.all([
      db.select().from(tasksTable),
      db.select().from(projectsTable),
      db.select().from(contactsTable),
      db.select().from(memoriesTable),
      db.select().from(decisionsTable),
      db.select().from(conversationsTable),
      db.select().from(assetsTable),
    ]);

    return res.json({
      taskStats: {
        total: tasks.length,
        todo: tasks.filter(t => t.status === "todo").length,
        inProgress: tasks.filter(t => t.status === "in_progress").length,
        done: tasks.filter(t => t.status === "done").length,
        urgent: tasks.filter(t => t.priority === "urgent").length,
      },
      projectStats: {
        total: projects.length,
        active: projects.filter(p => p.status === "active").length,
        paused: projects.filter(p => p.status === "paused").length,
        completed: projects.filter(p => p.status === "completed").length,
      },
      contactStats: {
        total: contacts.length,
        prospects: contacts.filter(c => c.status === "prospect").length,
        clients: contacts.filter(c => c.status === "client").length,
        active: contacts.filter(c => c.status === "active").length,
      },
      memoryCount: memories.length,
      decisionCount: decisions.length,
      conversationCount: conversations.length,
      assetCount: assets.length,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting dashboard summary");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// RECENT ACTIVITY
router.get("/dashboard/activity", async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 20;
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

// WORKLOAD
router.get("/dashboard/workload", async (req, res) => {
  try {
    const tasks = await db.select().from(tasksTable);
    const projects = await db.select().from(projectsTable);

    const now = new Date();
    const today = now.toISOString().split("T")[0];

    const urgent = tasks.filter(t => t.priority === "urgent" && t.status !== "done" && t.status !== "cancelled");
    const dueToday = tasks.filter(t => t.dueDate === today && t.status !== "done" && t.status !== "cancelled");
    const overdue = tasks.filter(t => t.dueDate && t.dueDate < today && t.status !== "done" && t.status !== "cancelled");
    const activeProjects = projects.filter(p => p.status === "active");

    const activeTasks = tasks.filter(t => t.status !== "done" && t.status !== "cancelled");
    const capacity = Math.min(100, Math.max(0, Math.round((activeTasks.length / Math.max(1, activeTasks.length + 5)) * 100)));

    const pOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    const topPriorities = tasks
      .filter(t => t.status !== "done" && t.status !== "cancelled")
      .sort((a, b) => {
        return (pOrder[a.priority] ?? 2) - (pOrder[b.priority] ?? 2);
      })
      .slice(0, 5)
      .map(t => ({ ...t, projectName: null }));

    return res.json({
      urgentTaskCount: urgent.length,
      dueTodayCount: dueToday.length,
      overdueCount: overdue.length,
      activeProjectCount: activeProjects.length,
      weeklyCapacity: capacity,
      topPriorities,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting workload");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
