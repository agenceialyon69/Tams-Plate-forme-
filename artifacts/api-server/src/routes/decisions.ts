import { Router, type IRouter } from "express";
import { db, decisionsTable } from "@workspace/db";
import {
  CreateDecisionBody,
  GetDecisionParams,
  DeleteDecisionParams,
} from "@workspace/api-zod";
import { eq, desc } from "drizzle-orm";
import { analyzeDecision } from "../lib/ai";
import { rateLimit } from "../middlewares/rate-limit";

const router: IRouter = Router();

// Dedicated limiter for the LLM-backed decision analysis endpoint.
const decisionLimiter = rateLimit({ windowMs: 60_000, max: 20 });

router.get("/decisions", async (_req, res): Promise<void> => {
  const decisions = await db.select().from(decisionsTable).orderBy(desc(decisionsTable.createdAt));
  res.json(decisions);
});

router.get("/decisions/:id", async (req, res): Promise<void> => {
  const params = GetDecisionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const [decision] = await db.select().from(decisionsTable).where(eq(decisionsTable.id, params.data.id));
  if (!decision) { res.status(404).json({ error: "Decision not found" }); return; }
  res.json(decision);
});

router.post("/decisions", decisionLimiter, async (req, res): Promise<void> => {
  const parsed = CreateDecisionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const analysis = await analyzeDecision(parsed.data.question, parsed.data.context ?? null);

  const [decision] = await db.insert(decisionsTable).values({
    question: parsed.data.question,
    context: parsed.data.context ?? null,
    analysis: analysis.analysis,
    priorityConflicts: analysis.priorityConflicts,
    alternatives: analysis.alternatives,
    blindSpots: analysis.blindSpots,
  }).returning();

  res.status(201).json(decision);
});

router.delete("/decisions/:id", async (req, res): Promise<void> => {
  const params = DeleteDecisionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid request" }); return; }

  await db.delete(decisionsTable).where(eq(decisionsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
