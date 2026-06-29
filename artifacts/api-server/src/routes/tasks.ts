import { Router } from "express";
import { db } from "@workspace/db";
import { tasksTable, projectsTable, contactsTable } from "@workspace/db";
import { eq, and, sql, getTableColumns } from "drizzle-orm";
import { logActivity } from "../lib/activity";
import { suggestRelationships, autoLink } from "../lib/relationships";
import { invalidateDashboardCache } from "../lib/cache";
import { emitTaskCreated, emitTaskCompleted } from "../lib/workflows";
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
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const offset = Number(req.query.offset) || ((page - 1) * limit);

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

    const hasMore = offset + tasks.length < total;

    return res.json({ data: tasks, total, limit, offset, page, hasMore });
  } catch (err) {
    req.log.error({ err }, "Error listing tasks");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// CREATE task with Zod validation + auto-linking
router.post("/tasks", async (req, res) => {
  try {
    const parsed = CreateTaskBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { title, description, status, priority, projectId, dueDate } = parsed.data;

    // Validate project exists if provided
    let validatedProjectId = projectId ?? null;
    if (validatedProjectId) {
      const [proj] = await db.select({ id: projectsTable.id })
        .from(projectsTable)
        .where(eq(projectsTable.id, validatedProjectId))
        .limit(1);
      if (!proj) {
        return res.status(400).json({ error: "Invalid projectId", details: "Project does not exist" });
      }
    }

    const [created] = await db.insert(tasksTable).values({
      title,
      description: description ?? null,
      status: status ?? "todo",
      priority: priority ?? "medium",
      projectId: validatedProjectId,
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

    // Implicit links: check if title/description contains a contact name
    const allContacts = await db.select({ id: contactsTable.id, name: contactsTable.name }).from(contactsTable);
    const textToScan = `${title} ${description ?? ""}`.toLowerCase();
    for (const contact of allContacts) {
      if (contact.name && textToScan.includes(contact.name.toLowerCase())) {
        await logActivity("task", "Lien implicite", `Tâche mentionne le contact "${contact.name}"`, created.id);
      }
    }

    // Suggest project link from description
    if (!created.projectId && description) {
      const descWords = description.toLowerCase().split(/\s+/);
      const allProjects = await db.select({ id: projectsTable.id, name: projectsTable.name }).from(projectsTable);
      for (const proj of allProjects) {
        if (proj.name && descWords.includes(proj.name.toLowerCase())) {
          await logActivity("task", "Suggestion", `Description mentionne le projet "${proj.name}" — lien suggéré`, created.id);
        }
      }
    }

    await logActivity("task", title, `Tâche créée : ${title}`, created.id);
    await emitTaskCreated(created.id);
    await invalidateDashboardCache();
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
    if (updated.status === "done") {
      await emitTaskCompleted(updated.id);
    }
    await invalidateDashboardCache();
    return res.json({ data: { ...updated, projectName } });
  } catch (err) {
    req.log.error({ err }, "Error updating task");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// SUGGEST relationships for a task
router.get("/tasks/:id/suggestions", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id)).limit(1);
    if (!task) return res.status(404).json({ error: "Not found" });

    const suggestions = await suggestRelationships("task", id);
    return res.json({ data: suggestions });
  } catch (err) {
    req.log.error({ err }, "Error suggesting relationships for task");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// AUTO-LINK a task
router.post("/tasks/:id/auto-link", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id)).limit(1);
    if (!task) return res.status(404).json({ error: "Not found" });

    const linked = await autoLink("task", id);
    await invalidateDashboardCache();
    return res.json({ data: linked });
  } catch (err) {
    req.log.error({ err }, "Error auto-linking task");
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
    await invalidateDashboardCache();
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting task");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
