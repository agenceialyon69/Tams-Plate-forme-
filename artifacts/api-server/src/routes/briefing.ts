import { Router } from "express";
import { db } from "@workspace/db";
import { briefingsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bonjour Mohamed";
  if (hour < 18) return "Bon après-midi Mohamed";
  return "Bonsoir Mohamed";
}

async function buildBriefing(activeProjectsCount: number, pendingTasksCount: number) {
  const priorities = [
    { label: "Prospection", description: "Contacter au moins 3 nouveaux cabinets aujourd'hui", urgency: "high" },
    { label: "Suivi clients", description: "Relancer les dossiers en attente de validation", urgency: "medium" },
  ];
  const risks = [
    { label: "Pipeline vide", description: "Aucun nouveau contact qualifié depuis 5 jours", urgency: "high" },
    { label: "Charge élevée", description: `${pendingTasksCount} tâches en attente sur ${activeProjectsCount} projets actifs`, urgency: "medium" },
  ];
  const opportunities = [
    { label: "Expansion réseau", description: "2 nouvelles opportunités identifiées dans le secteur conseil", urgency: "low" },
  ];
  const recommendations = [
    { label: "Action immédiate", description: "Contacter 3 cabinets aujourd'hui — le pipeline prospection est vide", urgency: "high" },
    { label: "Revue hebdomadaire", description: "Planifier une revue de tous les projets actifs en fin de semaine", urgency: "low" },
  ];
  return { priorities, risks, opportunities, recommendations };
}

router.get("/briefing/today", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const existing = await db
      .select()
      .from(briefingsTable)
      .where(eq(briefingsTable.date, today))
      .limit(1);

    if (existing.length > 0) {
      return res.json(existing[0]);
    }

    // Auto-generate if none exists
    const taskRows = await db.execute("SELECT COUNT(*) as cnt FROM tasks WHERE status NOT IN ('done','cancelled')");
    const projectRows = await db.execute("SELECT COUNT(*) as cnt FROM projects WHERE status = 'active'");
    const pendingCount = Number((taskRows.rows[0] as any).cnt ?? 0);
    const activeCount = Number((projectRows.rows[0] as any).cnt ?? 0);

    const { priorities, risks, opportunities, recommendations } = await buildBriefing(activeCount, pendingCount);

    const [created] = await db.insert(briefingsTable).values({
      date: today,
      greeting: getGreeting(),
      priorities,
      risks,
      opportunities,
      recommendations,
      activeProjectsCount: activeCount,
      pendingTasksCount: pendingCount,
    }).returning();

    return res.json(created);
  } catch (err) {
    req.log.error({ err }, "Error getting today briefing");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/briefing/generate", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    const taskRows = await db.execute("SELECT COUNT(*) as cnt FROM tasks WHERE status NOT IN ('done','cancelled')");
    const projectRows = await db.execute("SELECT COUNT(*) as cnt FROM projects WHERE status = 'active'");
    const pendingCount = Number((taskRows.rows[0] as any).cnt ?? 0);
    const activeCount = Number((projectRows.rows[0] as any).cnt ?? 0);

    const { priorities, risks, opportunities, recommendations } = await buildBriefing(activeCount, pendingCount);

    // Delete existing and create fresh
    await db.delete(briefingsTable).where(eq(briefingsTable.date, today));

    const [created] = await db.insert(briefingsTable).values({
      date: today,
      greeting: getGreeting(),
      priorities,
      risks,
      opportunities,
      recommendations,
      activeProjectsCount: activeCount,
      pendingTasksCount: pendingCount,
    }).returning();

    return res.json(created);
  } catch (err) {
    req.log.error({ err }, "Error generating briefing");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
