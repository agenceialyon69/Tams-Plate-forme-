import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { tasksTable, decisionsTable, memoriesTable, activityTable } from "@workspace/db";
import { desc, sql } from "drizzle-orm";

const router = Router();

const PRIORITIES = [
  { id: "health", label: "Santé physique & mentale", rule: "La santé passe avant productivité et projets." },
  { id: "family", label: "Famille & relations", rule: "La famille passe avant ambition court terme." },
  { id: "admin_finance", label: "Obligations perso/admin/financières", rule: "Les obligations qui créent des risques doivent remonter tôt." },
  { id: "work_stability", label: "Stabilité professionnelle", rule: "Un revenu stable protège les autres piliers." },
  { id: "projects", label: "Projets & ambitions", rule: "Les projets avancent après les fondations de vie." },
  { id: "learning", label: "Apprentissage & productivité", rule: "La productivité ne doit pas créer de dette de santé." },
] as const;

const RedTeamBody = z.object({
  decision: z.string().min(3).max(2000),
  context: z.string().max(4000).optional(),
});

async function countRows() {
  const [tasks, decisions, memories, activities] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)` }).from(tasksTable).catch(() => [{ count: 0 }]),
    db.select({ count: sql<number>`COUNT(*)` }).from(decisionsTable).catch(() => [{ count: 0 }]),
    db.select({ count: sql<number>`COUNT(*)` }).from(memoriesTable).catch(() => [{ count: 0 }]),
    db.select({ count: sql<number>`COUNT(*)` }).from(activityTable).catch(() => [{ count: 0 }]),
  ]);
  return {
    tasks: Number(tasks[0]?.count ?? 0),
    decisions: Number(decisions[0]?.count ?? 0),
    memories: Number(memories[0]?.count ?? 0),
    activity: Number(activities[0]?.count ?? 0),
  };
}

router.get("/life-os/status", async (_req, res) => {
  const counts = await countRows();
  return res.json({
    ok: true,
    mode: "personal_life_os_v1",
    priorities: PRIORITIES,
    signals: counts,
    redTeam: {
      active: true,
      rule: "Toute recommandation doit protéger santé, famille, obligations et stabilité avant projets.",
    },
    nextActions: [
      "Créer les workflows métier prioritaires.",
      "Relier Chat OS aux priorités Life OS.",
      "Ajouter des tâches réelles santé/admin/famille si elles manquent.",
    ],
  });
});

router.get("/life-os/briefing", async (_req, res) => {
  const counts = await countRows();
  const recent = await db.select().from(activityTable).orderBy(desc(activityTable.createdAt)).limit(5).catch(() => []);
  return res.json({
    ok: true,
    title: "Briefing Life OS",
    generatedAt: new Date().toISOString(),
    priorityOrder: PRIORITIES.map(p => p.label),
    snapshot: counts,
    recentActivity: recent.map((item: any) => ({ type: item.type, title: item.title, createdAt: item.createdAt })),
    briefing: [
      "1. Santé : vérifier énergie, sommeil, douleur/stress avant d'ajouter des tâches.",
      "2. Famille : protéger le temps familial et éviter la surcharge invisible.",
      "3. Admin/finance : traiter ce qui peut générer pénalité, dette ou risque juridique.",
      "4. Travail : privilégier stabilité locale et énergie durable.",
      "5. Projets : avancer uniquement sur le prochain levier utile, pas tout en même temps.",
    ],
    warning: counts.tasks === 0 ? "Aucune tâche détectée : le Life OS a besoin de captures réelles pour devenir utile." : null,
  });
});

router.post("/life-os/red-team", async (req, res) => {
  const parsed = RedTeamBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Invalid input", details: parsed.error.issues });
  const { decision, context } = parsed.data;
  return res.json({
    ok: true,
    decision,
    context: context ?? null,
    verdict: "Ne pas décider uniquement sur l'ambition ou l'urgence. Vérifier d'abord les impacts santé/famille/admin/revenu.",
    redFlags: [
      "Est-ce que cette décision augmente la fatigue ou le risque de burn-out ?",
      "Est-ce qu'elle met la famille, les papiers, les finances ou le travail stable en danger ?",
      "Est-ce que tu décides sous stress, honte, excitation ou urgence artificielle ?",
      "Est-ce qu'une option plus petite donne 80% du résultat avec moins de risque ?",
    ],
    saferPath: [
      "Découper en prochaine action réversible.",
      "Fixer une preuve de réussite mesurable.",
      "Mettre une limite de temps/argent/énergie.",
      "Revoir la décision après 24h si elle n'est pas urgente.",
    ],
  });
});

router.get("/life-os/workflows", async (_req, res) => {
  return res.json({
    ok: true,
    templates: [
      { id: "daily_health_check", priority: "health", trigger: "scheduled", title: "Check santé quotidien", outcome: "Détecter fatigue/douleur/stress avant surcharge." },
      { id: "admin_risk_review", priority: "admin_finance", trigger: "scheduled", title: "Revue admin/finance", outcome: "Remonter amendes, factures, papiers, échéances." },
      { id: "family_time_guard", priority: "family", trigger: "scheduled", title: "Garde-fou famille", outcome: "Empêcher que projets/travail mangent tout le temps familial." },
      { id: "weekly_red_team_review", priority: "projects", trigger: "scheduled", title: "Red Team hebdo", outcome: "Stopper dispersion et décisions prises sous fatigue." },
    ],
  });
});

export default router;
