import { Router } from "express";
import { ciOperatorPlan, ciOperatorStatus } from "../lib/dev-agent-ci-operator";

const router = Router();

router.get("/dev-agent/ci/status", (_req, res) => {
  res.json({ ok: true, ...ciOperatorStatus(), plan: ciOperatorPlan() });
});

router.post("/capabilities/execute", (req, res, next) => {
  const capabilityId = typeof req.body?.capabilityId === "string" ? req.body.capabilityId : "";
  if (capabilityId !== "dev.agent.ci") return next();
  const status = ciOperatorStatus();
  const plan = ciOperatorPlan();
  return res.json({
    capabilityId,
    status: "success",
    mode: "read_only",
    title: "Dev Agent CI Operator",
    result: [
      "CI Operator v1 branché.",
      `GitHub configuré: ${status.githubConfigured}`,
      `CI write: ${status.ciWriteEnabled}`,
      `PR write: ${status.prWriteEnabled}`,
      `Scheduler: ${status.schedulerEnabled}`,
      "Le sandbox Playwright réel est dans dev-agent-sandbox.yml.",
    ].join("\n"),
    artifact: { type: "json", data: { status, plan } },
    limitations: ["Les actions d’écriture GitHub restent derrière variables d’environnement et revue humaine."],
    nextActions: ["Activer les variables de garde-fou", "Lancer le workflow sandbox", "Lire les logs CI", "Corriger puis relancer"],
    providerUsed: "dev-agent-ci-operator",
    debug: { safe: true, noSecrets: true },
  });
});

export default router;
