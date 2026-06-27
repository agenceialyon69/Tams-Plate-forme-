import { Router } from "express";
import { z } from "zod";
import {
  AGENT_LIST, AGENTS, agentMeta, runAgent, orchestrate, type AgentId,
} from "../lib/agents";
import { logActivity } from "../lib/activity";

const router = Router();

// LIST — catalogue des agents (métadonnées publiques)
router.get("/agents", (_req, res) => {
  res.json({ data: AGENT_LIST.map(agentMeta) });
});

const RunBody = z.object({
  task: z.string().min(1, "task requis"),
  context: z.string().optional(),
});

// RUN — exécute un agent spécialisé sur une tâche
router.post("/agents/:id/run", async (req, res) => {
  try {
    const id = req.params.id as AgentId;
    if (!AGENTS[id]) return res.status(404).json({ error: "Agent inconnu" });

    const parsed = RunBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }

    const result = await runAgent(id, parsed.data.task, parsed.data.context);
    await logActivity("agent", AGENTS[id].name, `Agent ${AGENTS[id].name} exécuté`, 0);
    return res.json({ data: result });
  } catch (err) {
    req.log.error({ err }, "Error running agent");
    return res.status(500).json({ error: "Internal server error" });
  }
});

const OrchestrateBody = z.object({
  task: z.string().min(1, "task requis"),
});

// ORCHESTRATE — le Chief of Staff planifie, délègue et synthétise
router.post("/agents/orchestrate", async (req, res) => {
  try {
    const parsed = OrchestrateBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }

    const result = await orchestrate(parsed.data.task);
    await logActivity(
      "agent",
      "Chief of Staff",
      `Orchestration : ${result.plan.delegations.map(d => d.agent).join(", ")}`,
      0,
    );
    return res.json({ data: result });
  } catch (err) {
    req.log.error({ err }, "Error orchestrating agents");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
