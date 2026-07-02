import { Router } from "express";
import { devAgentValidationPlan } from "../lib/dev-agent-validation-plan";

const router = Router();

router.get("/dev-agent/validation/status", (_req, res) => {
  res.json({ ok: true, ...devAgentValidationPlan(), sandboxWorkflow: "dev-agent-sandbox.yml" });
});

router.post("/capabilities/execute", (req, res, next) => {
  const capabilityId = typeof req.body?.capabilityId === "string" ? req.body.capabilityId : "";
  if (capabilityId !== "dev.agent.validation") return next();
  const plan = devAgentValidationPlan();
  return res.json({
    capabilityId,
    status: "success",
    mode: "read_only",
    title: "Dev Agent Validation Runner",
    result: "Validation Runner v1 prêt: worker sandbox, commandes de validation, CI, e2e readiness, scheduler status.",
    artifact: { type: "json", data: plan },
    limitations: ["Version v1 prudente."],
    nextActions: ["Brancher les logs CI", "Ajouter specs Playwright"],
    providerUsed: "dev-agent-validation",
    debug: { safe: true, noSecrets: true },
  });
});

export default router;
