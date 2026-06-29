import { Router } from "express";
import { db } from "@workspace/db";
import { projectsTable, tasksTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logActivity } from "../lib/activity";
import { getProjectRelated, suggestRelationships, autoLink } from "../lib/relationships";
import { invalidateDashboardCache } from "../lib/cache";
import { emitProjectCreated } from "../lib/workflows";
import {
  CreateProjectBody,
  UpdateProjectBody,
} from "@workspace/api-zod";

const router = Router();

// LIST projects with task counts (single aggregation query)
router.get("/projects", async (req, res) => {
  try {
    // Pagination
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const offset = Number(req.query.offset) || ((page - 1) * limit);

    // Single query with aggregation (no N+1)
    const projects = await db
      .select({
        id: projectsTable.id,
        name: projectsTable.name,
        description: projectsTable.description,
        status: projectsTable.status,
        createdAt: projectsTable.createdAt,
        updatedAt: projectsTable.updatedAt,
        taskCount: sql<number>`COUNT(${tasksTable.id})`,
        completedTaskCount: sql<number>`COUNT(CASE WHEN ${tasksTable.status} = 'done' THEN 1 END)`,
      })
      .from(projectsTable)
      .leftJoin(tasksTable, eq(tasksTable.projectId, projectsTable.id))
      .groupBy(projectsTable.id)
      .orderBy(projectsTable.createdAt)
      .limit(limit)
      .offset(offset);

    // Get total count
    const [{ total }] = await db
      .select({ total: sql<number>`COUNT(*)` })
      .from(projectsTable);

    const hasMore = offset + projects.length < total;

    return res.json(projects);
  } catch (err) {
    req.log.error({ err }, "Error listing projects");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// CREATE project with Zod validation
router.post("/projects", async (req, res) => {
  try {
    const parsed = CreateProjectBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { name, description, status } = parsed.data;

    const [created] = await db.insert(projectsTable).values({
      name,
      description: description ?? null,
      status: status ?? "active",
    }).returning();

    await logActivity("project", name, `Projet créé : ${name}`, created.id);
    await emitProjectCreated(created.id);
    await invalidateDashboardCache();
    return res.status(201).json({ data: { ...created, taskCount: 0, completedTaskCount: 0 } });
  } catch (err) {
    req.log.error({ err }, "Error creating project");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// UPDATE project with Zod validation
router.patch("/projects/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const parsed = UpdateProjectBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { name, description, status } = parsed.data;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (status !== undefined) updates.status = status;

    const [updated] = await db.update(projectsTable).set(updates).where(eq(projectsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

    // Get task counts
    const [counts] = await db
      .select({
        taskCount: sql<number>`COUNT(*)`,
        completedTaskCount: sql<number>`COUNT(CASE WHEN status = 'done' THEN 1 END)`,
      })
      .from(tasksTable)
      .where(eq(tasksTable.projectId, id));

    await invalidateDashboardCache();
    return res.json({ data: { ...updated, ...counts } });
  } catch (err) {
    req.log.error({ err }, "Error updating project");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET related entities for a project
router.get("/projects/:id/related", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const related = await getProjectRelated(id);
    if (!related) return res.status(404).json({ error: "Not found" });

    return res.json({ data: related });
  } catch (err) {
    req.log.error({ err }, "Error getting related project entities");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// SUGGEST relationships for a project
router.get("/projects/:id/suggestions", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
    if (!project) return res.status(404).json({ error: "Not found" });

    const suggestions = await suggestRelationships("project", id);
    return res.json({ data: suggestions });
  } catch (err) {
    req.log.error({ err }, "Error suggesting relationships for project");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// AUTO-LINK a project
router.post("/projects/:id/auto-link", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
    if (!project) return res.status(404).json({ error: "Not found" });

    const linked = await autoLink("project", id);
    await invalidateDashboardCache();
    return res.json({ data: linked });
  } catch (err) {
    req.log.error({ err }, "Error auto-linking project");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE project with cascade (delete associated tasks first)
router.delete("/projects/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    // Delete associated tasks first (cascade)
    await db.delete(tasksTable).where(eq(tasksTable.projectId, id));
    await db.delete(projectsTable).where(eq(projectsTable.id, id));

    await invalidateDashboardCache();
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting project");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
