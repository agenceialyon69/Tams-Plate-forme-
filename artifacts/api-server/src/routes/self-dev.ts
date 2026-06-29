import { Router } from "express";
import { db, decisionsTable } from "@workspace/db";
import { runMission } from "../lib/agents/mission";
import { ReflectionEngine } from "../lib/reflection";
import { logActivity } from "../lib/activity";

const router = Router();

const DEFAULT_OBJECTIVE =
  "Analyse l'état actuel de TAMS et propose la prochaine étape de développement la " +
  "plus utile pour se rapprocher de la vision (AI OS autonome, free-first), en " +
  "respectant la Constitution : intégration > volume, fiabilité, zéro dépendance payante.";

/**
 * CERVEAU AUTONOME — « Continue TAMS ».
 * Lance une itération du pipeline de l'organisation d'ingénierie (mission.ts) :
 *   Analyse → Plan → Architecture → Red Team → Validation → Synthèse,
 *   puis Reflection (apprentissage) + persistance en Décision (mémoire).
 *
 * Produit un « dossier de mission » exploitable derrière des portes de validation
 * humaine. N'exécute pas de code lui-même (sécurité). Voir AUTONOMOUS_ORG.md.
 *
 * Body: { goal?: string }
 */
router.post("/agents/continue", async (req, res) => {
  const { goal } = req.body as { goal?: string };
  const objective = goal && String(goal).trim() ? String(goal).trim() : DEFAULT_OBJECTIVE;

  try {
    const report = await runMission(objective);

    // Mémoire : persiste le dossier comme décision de développement.
    let decisionId: number | null = null;
    try {
      const redTeamText = report.redTeam
        ? `Verdict: ${report.redTeam.verdict ?? "?"}\nAttaques: ${(report.redTeam.attacks ?? []).join(" · ")}\nÀ prouver: ${(report.redTeam.unproven ?? []).join(" · ")}`
        : null;
      const [d] = await db.insert(decisionsTable).values({
        title: `Continue TAMS — ${objective.slice(0, 110)}`,
        context: objective,
        aiAdvice: report.synthesis,
        redTeamAdvice: redTeamText,
        status: "analyzing",
      }).returning();
      decisionId = d?.id ?? null;
      await logActivity("decision", "Continue TAMS", `Mission autonome (${report.redTeam?.verdict ?? "analyse"})`, decisionId ?? 0);
    } catch {
      /* persistance best-effort */
    }

    // Reflection : apprend de ce cycle.
    ReflectionEngine.reflect({
      agentRole: "chief_of_staff",
      query: objective,
      result: report.synthesis,
      success: true,
      durationMs: report.durationMs,
      timestamp: new Date(),
    }).catch(() => {});

    return res.json({ ok: true, decisionId, ...report });
  } catch (err) {
    req.log?.error?.({ err }, "Self-development mission failed");
    return res.status(500).json({ error: "Mission autonome échouée", detail: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
