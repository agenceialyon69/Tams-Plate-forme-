import { Router } from "express";
import { db } from "@workspace/db";
import { tasksTable, projectsTable, activityTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";

const router = Router();

async function logActivity(type: string, title: string, description: string, entityId: number) {
  try {
    await db.insert(activityTable).values({ type: type as any, title, description, entityId });
  } catch {}
}

// LIST tasks
router.get("/tasks", async (req, res) => {
  try {
    const { status, priority, projectId } = req.query;

    const allTasks = await db.select().from(tasksTable).orderBy(tasksTable.createdAt);
    const projects = await db.select().from(projectsTable);
    const projectMap = new Map(projects.map(p => [p.id, p.name]));

    let filtered = allTasks;
    if (status) filtered = filtered.filter(t => t.status === status);
    if (priority) filtered = filtered.filter(t => t.priority === priority);
    if (projectId === "null") filtered = filtered.filter(t => t.projectId === null);
    else if (projectId) filtered = filtered.filter(t => t.projectId === Number(projectId));

    const result = filtered.map(t => ({
      ...t,
      projectName: t.projectId ? (projectMap.get(t.projectId) ?? null) : null,
    }));

    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error listing tasks");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// CREATE task
router.post("/tasks", async (req, res) => {
  try {
    const { title, description, status, priority, projectId, dueDate } = req.body;
    if (!title) return res.status(400).json({ error: "title is required" });

    const [created] = await db.insert(tasksTable).values({
      title,
      description: description ?? null,
      status: status ?? "todo",
      priority: priority ?? "medium",
      projectId: projectId ?? null,
      dueDate: dueDate ?? null,
    }).returning();

    await logActivity("task", title, `Tâche créée : ${title}`, created.id);
    return res.status(201).json({ ...created, projectName: null });
  } catch (err) {
    req.log.error({ err }, "Error creating task");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET task
router.get("/tasks/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
    if (!task) return res.status(404).json({ error: "Not found" });

    let projectName: string | null = null;
    if (task.projectId) {
      const [proj] = await db.select().from(projectsTable).where(eq(projectsTable.id, task.projectId));
      projectName = proj?.name ?? null;
    }

    return res.json({ ...task, projectName });
  } catch (err) {
    req.log.error({ err }, "Error getting task");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// UPDATE task
router.patch("/tasks/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, description, status, priority, projectId, dueDate } = req.body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (status !== undefined) updates.status = status;
    if (priority !== undefined) updates.priority = priority;
    if (projectId !== undefined) updates.projectId = projectId;
    if (dueDate !== undefined) updates.dueDate = dueDate;

    const [updated] = await db.update(tasksTable).set(updates).where(eq(tasksTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

    await logActivity("task", updated.title, `Tâche mise à jour : statut ${updated.status}`, updated.id);
    return res.json({ ...updated, projectName: null });
  } catch (err) {
    req.log.error({ err }, "Error updating task");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE task
router.delete("/tasks/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(tasksTable).where(eq(tasksTable.id, id));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting task");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
