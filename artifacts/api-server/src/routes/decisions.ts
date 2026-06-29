import { Router } from "express";
import { db } from "@workspace/db";
import { decisionsTable, tasksTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logActivity } from "../lib/activity";
import { emitDecisionCreated } from "../lib/workflows";
import {
  CreateDecisionBody,
  UpdateDecisionBody,
} from "@workspace/api-zod";
import { z } from "zod";

const router = Router();

// Schema for decision tasks creation
const CreateDecisionTasksBody = z.object({
  tasks: z.array(z.object({
    title: z.string().min(1),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  })).min(1),
});

// LIST decisions with pagination
router.get("/decisions", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    const decisions = await db.select()
      .from(decisionsTable)
      .orderBy(decisionsTable.createdAt)
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`COUNT(*)` })
      .from(decisionsTable);

    return res.json(decisions);
  } catch (err) {
    req.log.error({ err }, "Error listing decisions");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// CREATE decision with Zod validation
router.post("/decisions", async (req, res) => {
  try {
    const parsed = CreateDecisionBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { title, context, options, advantages, risks } = parsed.data;

    const [created] = await db.insert(decisionsTable).values({
      title,
      context: context ?? null,
      options: options ?? [],
      advantages: advantages ?? [],
      risks: risks ?? [],
      status: "pending",
      confidenceScore: 50,
    }).returning();

    await logActivity("decision", title, `Décision créée : ${title}`, created.id);
    await emitDecisionCreated(created.id);
    return res.status(201).json({ data: created });
  } catch (err) {
    req.log.error({ err }, "Error creating decision");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET decision
router.get("/decisions/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const [decision] = await db.select().from(decisionsTable).where(eq(decisionsTable.id, id));
    if (!decision) return res.status(404).json({ error: "Not found" });
    return res.json({ data: decision });
  } catch (err) {
    req.log.error({ err }, "Error getting decision");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// UPDATE decision with Zod validation
router.patch("/decisions/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const parsed = UpdateDecisionBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { title, context, options, advantages, risks, result, learnings, status, confidenceScore } = parsed.data;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title;
    if (context !== undefined) updates.context = context;
    if (options !== undefined) updates.options = options;
    if (advantages !== undefined) updates.advantages = advantages;
    if (risks !== undefined) updates.risks = risks;
    if (result !== undefined) updates.result = result;
    if (learnings !== undefined) updates.learnings = learnings;
    if (status !== undefined) updates.status = status;
    if (confidenceScore !== undefined) updates.confidenceScore = confidenceScore;

    const [updated] = await db.update(decisionsTable).set(updates).where(eq(decisionsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

    return res.json({ data: updated });
  } catch (err) {
    req.log.error({ err }, "Error updating decision");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE decision
router.delete("/decisions/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }
    await db.delete(decisionsTable).where(eq(decisionsTable.id, id));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting decision");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ANALYZE decision with AI + Red Team + analytical confidence score
router.post("/decisions/:id/analyze", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const [decision] = await db.select().from(decisionsTable).where(eq(decisionsTable.id, id));
    if (!decision) return res.status(404).json({ error: "Not found" });

    await db.update(decisionsTable).set({ status: "analyzing", updatedAt: new Date() }).where(eq(decisionsTable.id, id));

    let aiAdvice = decision.aiAdvice;
    let redTeamAdvice = decision.redTeamAdvice;
    let confidenceScore = decision.confidenceScore;

    try {
      const { aiChat } = await import("../lib/ai");

      const context = `Décision : ${decision.title}\nContexte : ${decision.context ?? "Non défini"}\nOptions : ${(decision.options as string[]).join(", ") || "Non définies"}\nAvantages : ${(decision.advantages as string[]).join(", ") || "Non définis"}\nRisques : ${(decision.risks as string[]).join(", ") || "Non définis"}`;

      const [aiResp, redTeamResp, scoreResp] = await Promise.all([
        aiChat({
          messages: [
            { role: "system", content: "Tu es un conseiller stratégique expert. Analyse cette décision et donne un avis structuré et actionnable en français. Sois direct, précis, sans jargon inutile." },
            { role: "user", content: context },
          ],
          max_tokens: 500,
        }, "reasoning"),
        aiChat({
          messages: [
            { role: "system", content: "Tu es un Red Team critique et sans complaisance. Identifie les failles, biais, risques cachés et erreurs de raisonnement dans cette décision. Sois direct, sceptique, utile. Réponds en français." },
            { role: "user", content: context },
          ],
          max_tokens: 500,
        }, "reasoning"),
        aiChat({
          messages: [
            {
              role: "system",
              content: `Tu évalues la qualité de cette décision sur 100 points. Évalue :
1. Qualité du contexte (0-25) : le contexte est-il clair et complet ?
2. Qualité des options (0-25) : les options sont-elles bien définies et distinctes ?
3. Analyse des risques (0-25) : les risques sont-ils bien identifiés ?
4. Faisabilité et alignement (0-25) : la décision est-elle réaliste et alignée avec les objectifs ?

Réponds en JSON strict : { "score": number, "breakdown": { "context": number, "options": number, "risks": number, "feasibility": number }, "reasoning": "1 phrase" }`,
            },
            { role: "user", content: context },
          ],
          max_tokens: 300,
          response_format: { type: "json_object" },
        }),
      ]);

      aiAdvice = aiResp.choices[0]?.message?.content ?? aiAdvice;
      redTeamAdvice = redTeamResp.choices[0]?.message?.content ?? redTeamAdvice;

      try {
        const scoreData = JSON.parse(scoreResp.choices[0]?.message?.content || "{}");
        confidenceScore = Math.min(100, Math.max(0, Math.round(scoreData.score ?? 50)));
      } catch {
        confidenceScore = 50;
      }
    } catch {
      aiAdvice = `Analyse de "${decision.title}" : Cette décision nécessite une évaluation approfondie des options disponibles. Considérez l'impact à court et long terme, les ressources nécessaires, et l'alignement avec vos objectifs prioritaires.`;
      redTeamAdvice = `Red Team sur "${decision.title}" : Attention aux biais de confirmation. Avez-vous considéré le coût d'opportunité ? Cette décision pourrait créer des dépendances non voulues. Challengez vos hypothèses de base.`;
      confidenceScore = 50;
    }

    const [updated] = await db.update(decisionsTable)
      .set({ aiAdvice, redTeamAdvice, confidenceScore, status: "decided", updatedAt: new Date() })
      .where(eq(decisionsTable.id, id))
      .returning();

    return res.json({ data: updated });
  } catch (err) {
    req.log.error({ err }, "Error analyzing decision");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// CREATE tasks from a decision — turn decision into action items
router.post("/decisions/:id/tasks", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const parsed = CreateDecisionTasksBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { tasks } = parsed.data;

    const [decision] = await db.select().from(decisionsTable).where(eq(decisionsTable.id, id));
    if (!decision) return res.status(404).json({ error: "Decision not found" });

    const created = await db.insert(tasksTable).values(
      tasks.map(t => ({
        title: t.title,
        priority: t.priority || "medium",
      }))
    ).returning();

    await logActivity("decision", decision.title, `${created.length} tâche(s) créée(s) depuis la décision "${decision.title}"`, id);

    return res.status(201).json({ data: created });
  } catch (err) {
    req.log.error({ err }, "Error creating tasks from decision");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
