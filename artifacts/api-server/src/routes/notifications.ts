import { Router } from "express";
import { db } from "@workspace/db";
import { tasksTable, contactsTable, decisionsTable, projectsTable } from "@workspace/db";
import { and, ne, isNotNull, lt, lte } from "drizzle-orm";

const router = Router();

router.get("/notifications", async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayStr = today.toISOString().split("T")[0];
    const staleContactThresholdDays = 14;
    const staleDate = new Date(today);
    staleDate.setDate(staleDate.getDate() - staleContactThresholdDays);

    const [tasks, contacts, decisions, projects] = await Promise.all([
      db.select().from(tasksTable),
      db.select().from(contactsTable),
      db.select().from(decisionsTable),
      db.select().from(projectsTable),
    ]);

    const notifications: Array<{
      id: string;
      type: string;
      severity: string;
      title: string;
      description: string;
      actionLabel: string;
      actionHref: string;
      entityId: number | null;
      createdAt: string;
    }> = [];

    // Overdue tasks
    const overdueTasks = tasks.filter(t => {
      if (t.status === "done" || t.status === "cancelled") return false;
      if (!t.dueDate) return false;
      return new Date(t.dueDate) < today;
    });
    overdueTasks.forEach(task => {
      const daysLate = Math.floor((today.getTime() - new Date(task.dueDate!).getTime()) / 86400000);
      notifications.push({
        id: `overdue_task_${task.id}`,
        type: "overdue_task",
        severity: "critical",
        title: `Tâche en retard : ${task.title}`,
        description: `Échéance dépassée de ${daysLate} jour${daysLate > 1 ? "s" : ""}`,
        actionLabel: "Voir les tâches",
        actionHref: "/travail",
        entityId: task.id,
        createdAt: now.toISOString(),
      });
    });

    // Tasks due today
    const dueTodayTasks = tasks.filter(t => {
      if (t.status === "done" || t.status === "cancelled") return false;
      if (!t.dueDate) return false;
      const dueStr = new Date(t.dueDate).toISOString().split("T")[0];
      return dueStr === todayStr;
    });
    if (dueTodayTasks.length > 0) {
      notifications.push({
        id: `due_today_${todayStr}`,
        type: "due_today",
        severity: "warning",
        title: `${dueTodayTasks.length} tâche${dueTodayTasks.length > 1 ? "s" : ""} à terminer aujourd'hui`,
        description: dueTodayTasks.map(t => t.title).slice(0, 2).join(", ") + (dueTodayTasks.length > 2 ? "..." : ""),
        actionLabel: "Voir les tâches",
        actionHref: "/travail",
        entityId: null,
        createdAt: now.toISOString(),
      });
    }

    // Urgent tasks
    const urgentTasks = tasks.filter(t => t.priority === "urgent" && t.status !== "done" && t.status !== "cancelled");
    urgentTasks.forEach(task => {
      const alreadyInOverdue = overdueTasks.find(o => o.id === task.id);
      if (!alreadyInOverdue) {
        notifications.push({
          id: `urgent_task_${task.id}`,
          type: "urgent_task",
          severity: "critical",
          title: `Urgence : ${task.title}`,
          description: "Cette tâche est marquée urgente et en attente",
          actionLabel: "Voir les tâches",
          actionHref: "/travail",
          entityId: task.id,
          createdAt: now.toISOString(),
        });
      }
    });

    // Contacts needing follow-up (not contacted in 14+ days, status prospect/active)
    const staleContacts = contacts.filter(c => {
      if (c.status === "inactive") return false;
      if (!c.lastContactedAt) return c.status === "prospect" || c.status === "active";
      return new Date(c.lastContactedAt) < staleDate;
    });
    if (staleContacts.length > 0) {
      notifications.push({
        id: `contact_followup_${todayStr}`,
        type: "contact_followup",
        severity: "warning",
        title: `${staleContacts.length} contact${staleContacts.length > 1 ? "s" : ""} à relancer`,
        description: staleContacts.map(c => c.name).slice(0, 2).join(", ") + (staleContacts.length > 2 ? "..." : ""),
        actionLabel: "Voir les contacts",
        actionHref: "/travail",
        entityId: null,
        createdAt: now.toISOString(),
      });
    }

    // Pending decisions
    const pendingDecisions = decisions.filter(d => d.status === "pending");
    if (pendingDecisions.length > 0) {
      notifications.push({
        id: `pending_decision_${todayStr}`,
        type: "pending_decision",
        severity: "info",
        title: `${pendingDecisions.length} décision${pendingDecisions.length > 1 ? "s" : ""} en attente d'analyse`,
        description: pendingDecisions.map(d => d.title).slice(0, 2).join(", "),
        actionLabel: "Analyser",
        actionHref: "/systeme",
        entityId: null,
        createdAt: now.toISOString(),
      });
    }

    // Stale active projects (no tasks updated in 7 days)
    const activeProjects = projects.filter(p => p.status === "active");
    const staleProjectThreshold = new Date(today);
    staleProjectThreshold.setDate(staleProjectThreshold.getDate() - 7);
    for (const project of activeProjects) {
      const projectTasks = tasks.filter(t => t.projectId === project.id && t.status !== "done" && t.status !== "cancelled");
      const recentActivity = projectTasks.some(t => new Date(t.updatedAt) > staleProjectThreshold);
      if (projectTasks.length > 0 && !recentActivity) {
        notifications.push({
          id: `stale_project_${project.id}`,
          type: "stale_project",
          severity: "info",
          title: `Projet inactif : ${project.name}`,
          description: `Aucune activité depuis 7+ jours — ${projectTasks.length} tâche${projectTasks.length > 1 ? "s" : ""} en attente`,
          actionLabel: "Voir les projets",
          actionHref: "/travail",
          entityId: project.id,
          createdAt: now.toISOString(),
        });
      }
    }

    // Sort: critical first, then warning, then info
    const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    notifications.sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2));

    return res.json(notifications);
  } catch (err) {
    req.log.error({ err }, "Error computing notifications");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
