import { Router } from "express";
import { schedulerStatus, startDevAgentScheduler } from "../lib/dev-agent-scheduler";

const router = Router();
startDevAgentScheduler();

router.get("/dev-agent/scheduler/status", (_req, res) => {
  res.json({ ok: true, scheduler: schedulerStatus() });
});

router.post("/capabilities/execute", (req, res, next) => {
  const capabilityId = typeof req.body?.capabilityId === "string" ? req.body.capabilityId : "";
  if (capabilityId !== "dev.agent.scheduler") return next();
  const scheduler = schedulerStatus();
  return res.json({
    capabilityId,
    status: "success",
    mode: scheduler.enabled ? "real" : "read_only",
    title: "Dev Agent Scheduler",
    result: JSON.stringify(scheduler, null, 2),
    artifact: { type: "json", data: scheduler },
    limitations: ["Actif seulement quand TAMS_DEV_AGENT_SCHEDULER=true et que le serveur tourne."],
    nextActions: ["Activer TAMS_DEV_AGENT_SCHEDULER=true", "Configurer GITHUB_TOKEN et TAMS_DEV_AGENT_CI_WRITE=true"],
    providerUsed: "dev-agent-scheduler",
    debug: { safe: true, noSecrets: true },
  });
});

export default router;
