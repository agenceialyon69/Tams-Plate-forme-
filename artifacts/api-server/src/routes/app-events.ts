import { Router, type IRouter } from "express";
import { db, appEventsTable } from "@workspace/db";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { requireRole } from "../middlewares/auth-jwt";

const router: IRouter = Router();

/**
 * GET /api/app-events — admin viewer for structured app events (analytics).
 * Owner/admin only. Optional filters: category, source, severity. Paginated.
 */
router.get("/app-events", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const filters: SQL[] = [];
  const { category, source, severity } = req.query as Record<string, string | undefined>;
  if (typeof category === "string" && category) filters.push(eq(appEventsTable.category, category));
  if (typeof source === "string" && source) filters.push(eq(appEventsTable.source, source));
  if (typeof severity === "string" && severity) filters.push(eq(appEventsTable.severity, severity));

  try {
    const rows = await db
      .select()
      .from(appEventsTable)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(appEventsTable.createdAt))
      .limit(limit);
    res.json({ events: rows });
  } catch {
    res.status(500).json({ error: "Lecture des événements impossible." });
  }
});

export default router;
