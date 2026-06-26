import { Router } from "express";
import { db } from "@workspace/db";
import { projectsTable, tasksTable, activityTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

async function logActivity(type: string, title: string, description: string, entityId: number) {
  try {
    await db.insert(activityTable).values({ type: type as any, title, description, entityId });
  } catch {}
}

// LIST projects
router.get("/projects", async (req, res) => {
  try {
    const projects = await db.select().from(projectsTable).orderBy(projectsTable.createdAt);
    const allTasks = await db.select().from(tasksTable);

    const result = projects.map(p => {
      const projectTasks = allTasks.filter(t => t.projectId === p.id);
      return {
        ...p,
        taskCount: projectTasks.length,
        completedTaskCount: projectTasks.filter(t => t.status === "done").length,
      };
    });

    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error listing projects");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// CREATE project
router.post("/projects", async (req, res) => {
  try {
    const { name, description, status } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });

    const [created] = await db.insert(projectsTable).values({
      name,
      description: description ?? null,
      status: status ?? "active",
    }).returning();

    await logActivity("project", name, `Projet créé : ${name}`, created.id);
    return res.status(201).json({ ...created, taskCount: 0, completedTaskCount: 0 });
  } catch (err) {
    req.log.error({ err }, "Error creating project");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// UPDATE project
router.patch("/projects/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, description, status } = req.body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (status !== undefined) updates.status = status;

    const [updated] = await db.update(projectsTable).set(updates).where(eq(projectsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

    const allTasks = await db.select().from(tasksTable).where(eq(tasksTable.projectId, id));
    return res.json({
      ...updated,
      taskCount: allTasks.length,
      completedTaskCount: allTasks.filter(t => t.status === "done").length,
    });
  } catch (err) {
    req.log.error({ err }, "Error updating project");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE project
router.delete("/projects/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(projectsTable).where(eq(projectsTable.id, id));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting project");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
