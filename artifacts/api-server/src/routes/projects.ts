import { Router } from "express";
import { db } from "@workspace/db";
import { projectsTable, tasksTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logActivity } from "../lib/activity";
import {
  CreateProjectBody,
  UpdateProjectBody,
} from "@workspace/api-zod";

const router = Router();

// LIST projects with task counts (single aggregation query)
router.get("/projects", async (req, res) => {
  try {
    // Pagination
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

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

    return res.json({ data: projects, total, limit, offset });
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

    return res.json({ data: { ...updated, ...counts } });
  } catch (err) {
    req.log.error({ err }, "Error updating project");
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

    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting project");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
