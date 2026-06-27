import { Router } from "express";
import { db } from "@workspace/db";
import { tasksTable, projectsTable } from "@workspace/db";
import { eq, and, sql, getTableColumns } from "drizzle-orm";
import { logActivity } from "../lib/activity";
import {
  CreateTaskBody,
  UpdateTaskBody,
  ListTasksQueryParams,
} from "@workspace/api-zod";

const router = Router();

// LIST tasks with pagination and proper JOIN
router.get("/tasks", async (req, res) => {
  try {
    // Validate query params
    const parsedQuery = ListTasksQueryParams.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({ error: "Invalid query parameters", details: parsedQuery.error.issues });
    }
    const { status, priority, projectId } = parsedQuery.data;

    // Pagination
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    // Build WHERE conditions
    const conditions: any[] = [];
    if (status) conditions.push(eq(tasksTable.status, status));
    if (priority) conditions.push(eq(tasksTable.priority, priority));
    if (projectId !== undefined && projectId !== null) {
      conditions.push(eq(tasksTable.projectId, projectId));
    }

    // Single query with JOIN (no N+1)
    const tasks = await db
      .select({
        ...getTableColumns(tasksTable),
        projectName: projectsTable.name,
      })
      .from(tasksTable)
      .leftJoin(projectsTable, eq(tasksTable.projectId, projectsTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(tasksTable.createdAt)
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    const [{ total }] = await db
      .select({ total: sql<number>`COUNT(*)` })
      .from(tasksTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return res.json(tasks);
  } catch (err) {
    req.log.error({ err }, "Error listing tasks");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// CREATE task with Zod validation
router.post("/tasks", async (req, res) => {
  try {
    const parsed = CreateTaskBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { title, description, status, priority, projectId, dueDate } = parsed.data;

    const [created] = await db.insert(tasksTable).values({
      title,
      description: description ?? null,
      status: status ?? "todo",
      priority: priority ?? "medium",
      projectId: projectId ?? null,
      dueDate: dueDate ? dueDate.toISOString().split('T')[0] : null,
    }).returning();

    // Get project name if linked
    let projectName: string | null = null;
    if (created.projectId) {
      const [proj] = await db.select({ name: projectsTable.name })
        .from(projectsTable)
        .where(eq(projectsTable.id, created.projectId))
        .limit(1);
      projectName = proj?.name ?? null;
    }

    await logActivity("task", title, `Tâche créée : ${title}`, created.id);
    return res.status(201).json({ data: { ...created, projectName } });
  } catch (err) {
    req.log.error({ err }, "Error creating task");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET task
router.get("/tasks/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const [result] = await db
      .select({
        ...getTableColumns(tasksTable),
        projectName: projectsTable.name,
      })
      .from(tasksTable)
      .leftJoin(projectsTable, eq(tasksTable.projectId, projectsTable.id))
      .where(eq(tasksTable.id, id))
      .limit(1);

    if (!result) return res.status(404).json({ error: "Not found" });
    return res.json({ data: result });
  } catch (err) {
    req.log.error({ err }, "Error getting task");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// UPDATE task with Zod validation
router.patch("/tasks/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const parsed = UpdateTaskBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const data = parsed.data;
    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.status !== undefined) updates.status = data.status;
    if (data.priority !== undefined) updates.priority = data.priority;
    if (data.projectId !== undefined) updates.projectId = data.projectId;
    if (data.dueDate !== undefined) updates.dueDate = data.dueDate ? data.dueDate.toISOString().split('T')[0] : null;

    const [updated] = await db.update(tasksTable).set(updates).where(eq(tasksTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

    // Get project name
    let projectName: string | null = null;
    if (updated.projectId) {
      const [proj] = await db.select({ name: projectsTable.name })
        .from(projectsTable)
        .where(eq(projectsTable.id, updated.projectId))
        .limit(1);
      projectName = proj?.name ?? null;
    }

    await logActivity("task", updated.title, `Tâche mise à jour : statut ${updated.status}`, updated.id);
    return res.json({ data: { ...updated, projectName } });
  } catch (err) {
    req.log.error({ err }, "Error updating task");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE task
router.delete("/tasks/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }
    await db.delete(tasksTable).where(eq(tasksTable.id, id));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting task");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
