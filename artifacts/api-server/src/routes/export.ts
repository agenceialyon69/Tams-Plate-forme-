import { Router, type IRouter } from "express";
import {
  db,
  capturesTable,
  tasksTable,
  eventsTable,
  learningsTable,
  decisionsTable,
  memoryTable,
  eveningReviewsTable,
  energyLogsTable,
  auditLogsTable,
} from "@workspace/db";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/export", async (req, res): Promise<void> => {
  try {
    const [
      captures,
      tasks,
      events,
      learnings,
      decisions,
      memory,
      reviews,
      energy,
      audit,
    ] = await Promise.all([
      db.select().from(capturesTable).orderBy(desc(capturesTable.createdAt)),
      db.select().from(tasksTable).orderBy(desc(tasksTable.createdAt)),
      db.select().from(eventsTable).orderBy(desc(eventsTable.createdAt)),
      db.select().from(learningsTable).orderBy(desc(learningsTable.createdAt)),
      db.select().from(decisionsTable).orderBy(desc(decisionsTable.createdAt)),
      db.select().from(memoryTable).orderBy(desc(memoryTable.createdAt)),
      db.select().from(eveningReviewsTable).orderBy(desc(eveningReviewsTable.createdAt)),
      db.select().from(energyLogsTable).orderBy(desc(energyLogsTable.createdAt)),
      db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.createdAt)).limit(1000),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      data: {
        captures,
        tasks,
        events,
        learnings,
        decisions,
        memory,
        reviews,
        energy,
        audit,
      },
      counts: {
        captures: captures.length,
        tasks: tasks.length,
        events: events.length,
        learnings: learnings.length,
        decisions: decisions.length,
        memory: memory.length,
        reviews: reviews.length,
        energy: energy.length,
        audit: audit.length,
      },
    };

    const filename = `gandal-export-${new Date().toISOString().split("T")[0]}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.json(exportData);
  } catch (err) {
    res.status(500).json({ error: "Export failed" });
  }
});

export default router;
