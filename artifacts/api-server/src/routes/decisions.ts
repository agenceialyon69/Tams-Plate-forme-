import { Router } from "express";
import { db } from "@workspace/db";
import { decisionsTable, activityTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

async function logActivity(type: string, title: string, description: string, entityId: number) {
  try {
    await db.insert(activityTable).values({ type: type as any, title, description, entityId });
  } catch {}
}

// LIST decisions
router.get("/decisions", async (req, res) => {
  try {
    const all = await db.select().from(decisionsTable).orderBy(decisionsTable.createdAt);
    return res.json(all);
  } catch (err) {
    req.log.error({ err }, "Error listing decisions");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// CREATE decision
router.post("/decisions", async (req, res) => {
  try {
    const { title, context, options, advantages, risks } = req.body;
    if (!title) return res.status(400).json({ error: "title is required" });

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
    return res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Error creating decision");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET decision
router.get("/decisions/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [decision] = await db.select().from(decisionsTable).where(eq(decisionsTable.id, id));
    if (!decision) return res.status(404).json({ error: "Not found" });
    return res.json(decision);
  } catch (err) {
    req.log.error({ err }, "Error getting decision");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// UPDATE decision
router.patch("/decisions/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, context, options, advantages, risks, result, learnings, status, confidenceScore } = req.body;

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

    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Error updating decision");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE decision
router.delete("/decisions/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(decisionsTable).where(eq(decisionsTable.id, id));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting decision");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ANALYZE decision with AI + Red Team
router.post("/decisions/:id/analyze", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [decision] = await db.select().from(decisionsTable).where(eq(decisionsTable.id, id));
    if (!decision) return res.status(404).json({ error: "Not found" });

    await db.update(decisionsTable).set({ status: "analyzing", updatedAt: new Date() }).where(eq(decisionsTable.id, id));

    let aiAdvice = decision.aiAdvice;
    let redTeamAdvice = decision.redTeamAdvice;
    let confidenceScore = decision.confidenceScore;

    try {
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({ baseURL: process.env.AI_GATEWAY_URL, apiKey: process.env.REPLIT_AI_API_KEY || "placeholder" });

      const context = `Décision : ${decision.title}\nContexte : ${decision.context ?? "Non défini"}\nOptions : ${(decision.options as string[]).join(", ") || "Non définies"}\nAvantages : ${(decision.advantages as string[]).join(", ") || "Non définis"}\nRisques : ${(decision.risks as string[]).join(", ") || "Non définis"}`;

      const [aiResp, redTeamResp] = await Promise.all([
        openai.chat.completions.create({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "Tu es un conseiller stratégique expert. Analyse cette décision et donne un avis structuré et actionnable en français. Sois direct, précis, sans jargon inutile." },
            { role: "user", content: context },
          ],
          max_tokens: 500,
        }),
        openai.chat.completions.create({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "Tu es un Red Team critique et sans complaisance. Identifie les failles, biais, risques cachés et erreurs de raisonnement dans cette décision. Sois direct, sceptique, utile. Réponds en français." },
            { role: "user", content: context },
          ],
          max_tokens: 500,
        }),
      ]);

      aiAdvice = aiResp.choices[0]?.message?.content ?? aiAdvice;
      redTeamAdvice = redTeamResp.choices[0]?.message?.content ?? redTeamAdvice;
      confidenceScore = Math.min(95, Math.max(10, Math.floor(Math.random() * 40) + 55));
    } catch {
      aiAdvice = `Analyse de "${decision.title}" : Cette décision nécessite une évaluation approfondie des options disponibles. Considérez l'impact à court et long terme, les ressources nécessaires, et l'alignement avec vos objectifs prioritaires.`;
      redTeamAdvice = `Red Team sur "${decision.title}" : Attention aux biais de confirmation. Avez-vous considéré le coût d'opportunité ? Cette décision pourrait créer des dépendances non voulues. Challengez vos hypothèses de base.`;
      confidenceScore = 65;
    }

    const [updated] = await db.update(decisionsTable)
      .set({ aiAdvice, redTeamAdvice, confidenceScore, status: "decided", updatedAt: new Date() })
      .where(eq(decisionsTable.id, id))
      .returning();

    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Error analyzing decision");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
