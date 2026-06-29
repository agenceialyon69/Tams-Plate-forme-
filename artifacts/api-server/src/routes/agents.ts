import { Router } from "express";
import { z } from "zod";
import {
  AGENT_LIST, AGENTS, agentMeta, runAgent, orchestrate,
  delegateToAgent, runAgentCouncil, runAgentPipeline, type AgentId,
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

// ─── COLLABORATION INTER-AGENTS ─────────────────────────────────────────────

const CouncilBody = z.object({
  query: z.string().min(1, "query requis"),
  agents: z.array(z.string()).optional(),
  context: z.string().optional(),
});

// COUNCIL — conseil multi-agents
router.post("/agents/council", async (req, res) => {
  try {
    const parsed = CouncilBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }

    const result = await runAgentCouncil(
      parsed.data.query,
      parsed.data.agents as AgentId[] | undefined,
      parsed.data.context,
    );
    await logActivity(
      "agent",
      "Conseil Multi-Agents",
      `Conseil sur : ${parsed.data.query.slice(0, 80)}`,
      0,
    );
    return res.json({ data: result });
  } catch (err) {
    req.log.error({ err }, "Error running agent council");
    return res.status(500).json({ error: "Internal server error" });
  }
});

const PipelineBody = z.object({
  tasks: z.array(
    z.object({
      agent: z.string().min(1, "agent requis"),
      query: z.string().min(1, "query requis"),
    }),
  ).min(1, "au moins une tâche requise"),
  context: z.string().optional(),
});

// PIPELINE — chaîne d'agents séquentielle
router.post("/agents/pipeline", async (req, res) => {
  try {
    const parsed = PipelineBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }

    const result = await runAgentPipeline(
      parsed.data.tasks.map(t => ({ agent: t.agent as AgentId, query: t.query })),
      parsed.data.context,
    );
    await logActivity(
      "agent",
      "Pipeline",
      `Pipeline : ${parsed.data.tasks.map(t => t.agent).join(" → ")}`,
      0,
    );
    return res.json({ data: result });
  } catch (err) {
    req.log.error({ err }, "Error running agent pipeline");
    return res.status(500).json({ error: "Internal server error" });
  }
});

const DelegateBody = z.object({
  source: z.string().min(1, "source requis"),
  target: z.string().min(1, "target requis"),
  query: z.string().min(1, "query requis"),
  context: z.string().optional(),
});

// DELEGATE — délégation inter-agents
router.post("/agents/delegate", async (req, res) => {
  try {
    const parsed = DelegateBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }

    const result = await delegateToAgent(
      parsed.data.source as AgentId,
      parsed.data.target as AgentId,
      parsed.data.query,
      parsed.data.context,
    );
    await logActivity(
      "agent",
      "Délégation",
      `${AGENTS[result.source]?.name ?? result.source} → ${AGENTS[result.target]?.name ?? result.target}`,
      0,
    );
    return res.json({ data: result });
  } catch (err) {
    req.log.error({ err }, "Error delegating to agent");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
