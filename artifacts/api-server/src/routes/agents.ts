/**
 * Agents Route (Pilier 3 Agent System)
 *
 * Expose le système multi-agents UNIQUE (`lib/agents/`, partagé avec le Chat) :
 *   - GET  /agents               catalogue des agents
 *   - POST /agents/:role/run     exécute un agent spécialisé
 *   - POST /agents/orchestrate   le Chief of Staff planifie → délègue → synthétise
 *
 * 100 % gratuit : toute inférence passe par le routeur free-first (lib/ai).
 */
import { Router } from "express";
import { z } from "zod";
import { getAgent, getAllAgents, runAgent } from "../lib/agents/index";
import type { AgentRole } from "../lib/agents/types";
import { aiChat } from "../lib/ai";
import { logActivity } from "../lib/activity";

const router = Router();

/** Métadonnées publiques d'un agent (forme attendue par le frontend). */
function agentMeta(a: ReturnType<typeof getAllAgents>[number]) {
  return {
    id: a.role,
    name: a.name,
    role: a.description,
    responsibilities: a.capabilities,
    tools: a.tools.map(t => t.name),
    canDelegate: a.capabilities.includes("delegate"),
  };
}

// LIST — catalogue des agents
router.get("/agents", (_req, res) => {
  res.json({ data: getAllAgents().map(agentMeta) });
});

const RunBody = z.object({
  task: z.string().min(1, "task requis"),
});

// RUN — exécute un agent spécialisé
router.post("/agents/:role/run", async (req, res) => {
  try {
    const role = req.params.role as AgentRole;
    const agent = getAgent(role);
    if (!agent) return res.status(404).json({ error: "Agent inconnu" });

    const parsed = RunBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }

    const response = await runAgent(agent, parsed.data.task);
    await logActivity("agent", agent.name, `Agent ${agent.name} exécuté`, 0);
    return res.json({
      data: {
        agent: agent.role,
        name: agent.name,
        output: response.content,
        toolsUsed: response.toolCalls.map(t => t.name),
      },
    });
  } catch (err) {
    req.log.error({ err }, "Error running agent");
    return res.status(500).json({ error: "Internal server error" });
  }
});

const OrchestrateBody = z.object({
  task: z.string().min(1, "task requis"),
});

interface Delegation { agent: AgentRole; subtask: string; }

// ORCHESTRATE — le Chief of Staff planifie, délègue (en parallèle) et synthétise
router.post("/agents/orchestrate", async (req, res) => {
  try {
    const parsed = OrchestrateBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }
    const task = parsed.data.task;

    const cos = getAgent("chief_of_staff")!;
    const delegatable = getAllAgents().filter(a => a.role !== "chief_of_staff");

    // 1. PLAN — choisir 1 à 4 agents pertinents + sous-tâche (JSON structuré)
    let plan: { rationale: string; delegations: Delegation[] } = { rationale: "", delegations: [] };
    try {
      const planResp = await aiChat({
        messages: [
          {
            role: "system",
            content: `${cos.systemPrompt}\n\nAgents disponibles:\n${delegatable.map(a => `- ${a.role}: ${a.description}`).join("\n")}\n\nChoisis 1 à 4 agents RÉELLEMENT pertinents et assigne à chacun une sous-tâche précise. Réponds en JSON strict: { "rationale": "1 phrase", "delegations": [ { "agent": "<role>", "subtask": "..." } ] }`,
          },
          { role: "user", content: task },
        ],
        max_tokens: 500,
        response_format: { type: "json_object" },
      }, "reasoning");
      const data = JSON.parse(planResp.choices?.[0]?.message?.content || "{}");
      const valid: Delegation[] = (data.delegations || [])
        .filter((d: any) => d && getAgent(d.agent as AgentRole) && d.agent !== "chief_of_staff")
        .slice(0, 4)
        .map((d: any) => ({ agent: d.agent as AgentRole, subtask: String(d.subtask || task) }));
      plan = { rationale: String(data.rationale || ""), delegations: valid };
    } catch {
      plan = {
        rationale: "Plan par défaut (planification IA indisponible).",
        delegations: [
          { agent: "research", subtask: task },
          { agent: "decision", subtask: task },
        ],
      };
    }
    if (plan.delegations.length === 0) {
      plan.delegations = [{ agent: "research", subtask: task }];
    }

    // 2. DÉLÉGATION — exécuter les agents en parallèle
    const results = await Promise.all(
      plan.delegations.map(async d => {
        const agent = getAgent(d.agent)!;
        try {
          const r = await runAgent(agent, d.subtask);
          return { agent: agent.role, name: agent.name, output: r.content, toolsUsed: r.toolCalls.map(t => t.name) };
        } catch {
          return { agent: agent.role, name: agent.name, output: "(échec de l'agent)", toolsUsed: [] as string[] };
        }
      }),
    );

    // 3. SYNTHÈSE — consolidation exécutive par le Chief of Staff
    let synthesis = "";
    try {
      const synthResp = await aiChat({
        messages: [
          { role: "system", content: `${cos.systemPrompt}\n\nVoici les contributions de tes agents. Produis UNE synthèse exécutive claire, sans répéter, en priorisant les actions concrètes.` },
          { role: "user", content: `Demande initiale: ${task}\n\nContributions:\n${results.map(r => `### ${r.name}\n${r.output}`).join("\n\n")}` },
        ],
        max_tokens: 900,
      }, "reasoning");
      synthesis = synthResp.choices?.[0]?.message?.content ?? "";
    } catch {
      synthesis = results.map(r => `**${r.name}** : ${r.output}`).join("\n\n");
    }

    await logActivity("agent", "Chief of Staff", `Orchestration : ${plan.delegations.map(d => d.agent).join(", ")}`, 0);
    return res.json({ data: { plan, results, synthesis: synthesis || "(synthèse indisponible)" } });
  } catch (err) {
    req.log.error({ err }, "Error orchestrating agents");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
