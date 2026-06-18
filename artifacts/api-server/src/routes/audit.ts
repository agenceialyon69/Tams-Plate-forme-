import { Router, type IRouter } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { desc, gte, lte, and } from "drizzle-orm";

const router: IRouter = Router();

router.get("/audit", async (req, res): Promise<void> => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10), 500);
    const offset = parseInt(String(req.query.offset ?? "0"), 10);
    const resource = req.query.resource as string | undefined;
    const since = req.query.since as string | undefined;
    const until = req.query.until as string | undefined;

    let query = db.select().from(auditLogsTable).$dynamic();

    const conditions = [];
    if (resource) {
      const { eq } = await import("drizzle-orm");
      conditions.push(eq(auditLogsTable.resource, resource));
    }
    if (since) conditions.push(gte(auditLogsTable.createdAt, new Date(since)));
    if (until) conditions.push(lte(auditLogsTable.createdAt, new Date(until)));
    if (conditions.length > 0) query = query.where(and(...conditions));

    const logs = await query
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

export default router;
