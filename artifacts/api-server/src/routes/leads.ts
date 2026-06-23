import { Router, type IRouter } from "express";
import { db, leadsTable, leadActivitiesTable } from "@workspace/db";
import { scoreLead } from "../lib/ai";
import { desc, eq, asc } from "drizzle-orm";
import { rateLimit } from "../middlewares/rate-limit";
import { requireRole } from "../middlewares/auth-jwt";

const router: IRouter = Router();
const scoreLimiter = rateLimit({ windowMs: 60_000, max: 15 });

type LeadStatus = "new" | "contacted" | "nurturing" | "proposal" | "won" | "lost" | "paused";
type LeadPriority = "high" | "medium" | "low";
const VALID_STATUSES: LeadStatus[] = ["new", "contacted", "nurturing", "proposal", "won", "lost", "paused"];
const VALID_PRIORITIES: LeadPriority[] = ["high", "medium", "low"];

function asStr(v: unknown, max = 1000): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  return v.trim().slice(0, max);
}
function isStatus(v: unknown): v is LeadStatus {
  return typeof v === "string" && (VALID_STATUSES as string[]).includes(v);
}
function isPriority(v: unknown): v is LeadPriority {
  return typeof v === "string" && (VALID_PRIORITIES as string[]).includes(v);
}

/** GET /api/leads */
router.get("/leads", async (req, res): Promise<void> => {
  const leads = await db.select().from(leadsTable).orderBy(
    desc(leadsTable.score),
    desc(leadsTable.createdAt),
  ).limit(200);
  res.json(leads);
});

/** GET /api/leads/:id */
router.get("/leads/:id", async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, id));
  if (!lead) { res.status(404).json({ error: "Not found" }); return; }
  const activities = await db.select().from(leadActivitiesTable)
    .where(eq(leadActivitiesTable.leadId, id))
    .orderBy(asc(leadActivitiesTable.createdAt));
  res.json({ ...lead, activities });
});

/** POST /api/leads */
router.post("/leads", async (req, res): Promise<void> => {
  const b = req.body ?? {};
  const name = asStr(b.name, 200);
  if (!name) { res.status(400).json({ error: "name requis" }); return; }

  const [lead] = await db.insert(leadsTable).values({
    name,
    company: asStr(b.company, 200),
    email: asStr(b.email, 200),
    phone: asStr(b.phone, 50),
    linkedin: asStr(b.linkedin, 300),
    website: asStr(b.website, 300),
    role: asStr(b.role, 200),
    industry: asStr(b.industry, 200),
    source: asStr(b.source, 100) ?? "manual",
    status: isStatus(b.status) ? b.status : "new",
    priority: isPriority(b.priority) ? b.priority : "medium",
    companySize: asStr(b.companySize, 100),
    budget: asStr(b.budget, 200),
    decisionTimeline: asStr(b.decisionTimeline, 200),
    painPoints: asStr(b.painPoints, 2000),
    signals: asStr(b.signals, 2000),
    notes: asStr(b.notes, 5000),
    nextActionDate: asStr(b.nextActionDate, 20),
    tags: Array.isArray(b.tags) ? b.tags.filter((t: unknown) => typeof t === "string").map(String) : [],
  }).returning();

  // Log creation activity
  await db.insert(leadActivitiesTable).values({
    leadId: lead.id,
    type: "note",
    content: `Lead créé depuis ${lead.source}.`,
  });

  res.status(201).json(lead);
});

/** PATCH /api/leads/:id */
router.patch("/leads/:id", async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const b = req.body ?? {};

  const [existing] = await db.select().from(leadsTable).where(eq(leadsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const updates: Partial<typeof leadsTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (b.name !== undefined) updates.name = asStr(b.name, 200) ?? existing.name;
  if (b.company !== undefined) updates.company = asStr(b.company, 200);
  if (b.email !== undefined) updates.email = asStr(b.email, 200);
  if (b.phone !== undefined) updates.phone = asStr(b.phone, 50);
  if (b.linkedin !== undefined) updates.linkedin = asStr(b.linkedin, 300);
  if (b.website !== undefined) updates.website = asStr(b.website, 300);
  if (b.role !== undefined) updates.role = asStr(b.role, 200);
  if (b.industry !== undefined) updates.industry = asStr(b.industry, 200);
  if (b.source !== undefined) updates.source = asStr(b.source, 100) ?? "manual";
  if (isStatus(b.status)) updates.status = b.status;
  if (isPriority(b.priority)) updates.priority = b.priority;
  if (b.companySize !== undefined) updates.companySize = asStr(b.companySize, 100);
  if (b.budget !== undefined) updates.budget = asStr(b.budget, 200);
  if (b.decisionTimeline !== undefined) updates.decisionTimeline = asStr(b.decisionTimeline, 200);
  if (b.painPoints !== undefined) updates.painPoints = asStr(b.painPoints, 2000);
  if (b.signals !== undefined) updates.signals = asStr(b.signals, 2000);
  if (b.notes !== undefined) updates.notes = asStr(b.notes, 5000);
  if (b.nextActionDate !== undefined) updates.nextActionDate = asStr(b.nextActionDate, 20);
  if (Array.isArray(b.tags)) updates.tags = b.tags.filter((t: unknown) => typeof t === "string").map(String);

  // Log status change
  if (isStatus(b.status) && b.status !== existing.status) {
    await db.insert(leadActivitiesTable).values({
      leadId: id,
      type: "status_change",
      content: `Statut changé : ${existing.status} → ${b.status}`,
    });
  }

  const [updated] = await db.update(leadsTable).set(updates).where(eq(leadsTable.id, id)).returning();
  res.json(updated);
});

/** POST /api/leads/:id/score — AI Red Team scoring */
router.post("/leads/:id/score", scoreLimiter, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, id));
  if (!lead) { res.status(404).json({ error: "Not found" }); return; }

  try {
    const result = await scoreLead(lead);

    const [updated] = await db.update(leadsTable).set({
      score: result.score,
      conversionProbability: result.conversionProbability,
      priority: result.priority,
      nextBestAction: result.nextBestAction,
      redTeamWarning: result.redTeamWarning,
      scoredAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(leadsTable.id, id)).returning();

    await db.insert(leadActivitiesTable).values({
      leadId: id,
      type: "score",
      content: `Score IA : ${result.score}/100 — ${result.rationale}`,
    });

    res.json({ ...updated, rationale: result.rationale });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "AI error";
    res.status(500).json({ error: msg });
  }
});

/** POST /api/leads/:id/activities — log an activity */
router.post("/leads/:id/activities", async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const b = req.body ?? {};
  const content = asStr(b.content, 3000);
  const type = asStr(b.type, 50) ?? "note";
  if (!content) { res.status(400).json({ error: "content requis" }); return; }

  const [act] = await db.insert(leadActivitiesTable).values({
    leadId: id, type, content,
  }).returning();

  // Update lead updatedAt
  await db.update(leadsTable).set({ updatedAt: new Date() }).where(eq(leadsTable.id, id));
  res.status(201).json(act);
});

/** DELETE /api/leads/:id */
router.delete("/leads/:id", async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(leadActivitiesTable).where(eq(leadActivitiesTable.leadId, id));
  await db.delete(leadsTable).where(eq(leadsTable.id, id));
  res.status(204).end();
});

/** GET /api/leads/export.csv */
router.get("/leads/export.csv", requireRole("admin", "owner"), async (_req, res): Promise<void> => {
  const leads = await db.select().from(leadsTable).orderBy(desc(leadsTable.score), desc(leadsTable.createdAt));
  const headers = ["id","name","company","role","email","phone","industry","source","status","priority","score","conversion_probability","next_best_action","red_team_warning","budget","decision_timeline","company_size","signals","notes","next_action_date","created_at"];
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const rows = leads.map(l =>
    [l.id,l.name,l.company,l.role,l.email,l.phone,l.industry,l.source,l.status,l.priority,l.score,l.conversionProbability,l.nextBestAction,l.redTeamWarning,l.budget,l.decisionTimeline,l.companySize,l.signals,l.notes,l.nextActionDate,l.createdAt]
    .map(escape).join(",")
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="leads-tams.csv"');
  res.send([headers.join(","), ...rows].join("\n"));
});

export default router;
