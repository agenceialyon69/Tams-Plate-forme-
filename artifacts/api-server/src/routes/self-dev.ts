import { Router } from "express";
import { db, decisionsTable } from "@workspace/db";
import { runAgentCouncil } from "../lib/agents/council";
import { planAndExecute } from "../lib/agents/planner";
import { ReflectionEngine } from "../lib/reflection";
import { logActivity } from "../lib/activity";

const router = Router();

const DEFAULT_OBJECTIVE =
  "Analyse l'état actuel de TAMS et propose la prochaine étape de développement la " +
  "plus utile pour se rapprocher de la vision (AI OS autonome, free-first), en " +
  "respectant la Constitution : intégration > volume, fiabilité, zéro dépendance payante.";

/**
 * CERVEAU AUTONOME — « Continue TAMS ».
 * Compose l'organisation d'agents existante en un cycle de développement autonome :
 *   Chief of Staff + Council (perspectives multi-agents) → Red Team (critique) →
 *   Planner (plan d'action) → Reflection (apprentissage) → Mémoire (décision persistée).
 *
 * Produit une ANALYSE + un PLAN exploitables (par l'utilisateur ou un futur agent
 * disposant d'un accès au dépôt). N'exécute pas de code lui-même (sécurité) : il
 * raisonne, planifie, critique et mémorise — le socle du développement autonome.
 *
 * Body: { goal?: string }
 */
router.post("/agents/continue", async (req, res) => {
  const { goal } = req.body as { goal?: string };
  const objective = goal && String(goal).trim() ? String(goal).trim() : DEFAULT_OBJECTIVE;
  const startedAt = Date.now();

  try {
    // 1) Conseil multi-agents : perspectives spécialisées + critique Red Team +
    //    synthèse du Chief of Staff (collaboration réelle, pas un seul agent).
    const council = await runAgentCouncil(objective);

    // 2) Planner : décompose en plan d'action vérifié.
    let plan: Awaited<ReturnType<typeof planAndExecute>> | null = null;
    try {
      plan = await planAndExecute(objective, council.synthesis);
    } catch {
      plan = null; // le plan est best-effort ; la synthèse reste exploitable
    }

    // 3) Mémoire : persiste comme décision de développement (traçabilité + apprentissage).
    let decisionId: number | null = null;
    try {
      const [d] = await db.insert(decisionsTable).values({
        title: `Continue TAMS — ${objective.slice(0, 110)}`,
        context: objective,
        aiAdvice: council.synthesis,
        redTeamAdvice: council.redTeamCritique,
        status: "analyzing",
      }).returning();
      decisionId = d?.id ?? null;
      await logActivity("decision", "Continue TAMS", `Cycle autonome: ${council.classification}`, decisionId ?? 0);
    } catch {
      /* persistance best-effort */
    }

    // 4) Reflection : apprend de ce cycle (auto-mémorisation).
    ReflectionEngine.reflect({
      agentRole: "chief_of_staff",
      query: objective,
      result: council.synthesis,
      success: true,
      durationMs: Date.now() - startedAt,
      timestamp: new Date(),
    }).catch(() => {});

    return res.json({
      ok: true,
      objective,
      classification: council.classification,
      agentsConsulted: council.totalAgentsConsulted,
      perspectives: council.perspectives.map((p) => ({ agent: p.agent, recommendations: p.recommendations })),
      redTeam: council.redTeamCritique,
      synthesis: council.synthesis,
      plan: plan?.plan ?? null,
      planMessage: plan?.message ?? null,
      decisionId,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    req.log?.error?.({ err }, "Self-development cycle failed");
    return res.status(500).json({ error: "Cycle autonome échoué", detail: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
