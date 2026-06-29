/**
 * Agent Council Engine
 *
 * Real multi-agent collaboration:
 * 1. Chief identifies the request type
 * 2. Chief selectively consults relevant agents
 * 3. Agents provide their perspective
 * 4. Red Team challenges all perspectives
 * 5. Chief synthesizes a final recommendation
 *
 * This is NOT simulation - agents actually debate.
 */

import { getAgent, getAllAgents } from "./definitions";
import { smartCompletion } from "../ai-router";
import { recordAIMetric } from "../observability";
import { gatherUserContext } from "./orchestrator";
import type { Agent, AgentRole, AgentResponse } from "./types";
import { db } from "@workspace/db";
import { memoriesTable, decisionsTable } from "@workspace/db";
import { like, or, desc, sql } from "drizzle-orm";

// ─── Council Configuration ────────────────────────────────────────────────────

interface CouncilConfig {
  agents: AgentRole[];
  redTeamRequired: boolean;
  maxDebateRounds: number;
  synthesisDepth: "quick" | "standard" | "deep";
}

const COUNCIL_PRESETS: Record<string, CouncilConfig> = {
  strategic_decision: {
    agents: ["decision", "business", "red_team"],
    redTeamRequired: true,
    maxDebateRounds: 2,
    synthesisDepth: "deep",
  },
  project_continuation: {
    agents: ["planning", "engineering", "product", "red_team"],
    redTeamRequired: true,
    maxDebateRounds: 1,
    synthesisDepth: "standard",
  },
  technical_issue: {
    agents: ["engineering", "devops", "red_team"],
    redTeamRequired: false,
    maxDebateRounds: 1,
    synthesisDepth: "quick",
  },
  research_request: {
    agents: ["research", "memory"],
    redTeamRequired: false,
    maxDebateRounds: 0,
    synthesisDepth: "standard",
  },
  creative_task: {
    agents: ["studio", "marketing"],
    redTeamRequired: false,
    maxDebateRounds: 0,
    synthesisDepth: "quick",
  },
  memory_query: {
    agents: ["memory"],
    redTeamRequired: false,
    maxDebateRounds: 0,
    synthesisDepth: "quick",
  },
  general: {
    agents: ["chief_of_staff"],
    redTeamRequired: false,
    maxDebateRounds: 0,
    synthesisDepth: "quick",
  },
};

// ─── Request Classification ───────────────────────────────────────────────────

function classifyRequest(query: string): string {
  const q = query.toLowerCase();

  if (/(?:décid|chois|option|pour ou contre|avantage|inconvénient|faut-il)/.test(q)) return "strategic_decision";
  if (/(?:continu|projet|avancer|avancement|prochain|étape|mon projet)/.test(q)) return "project_continuation";
  if (/(?:bug|erreur|marche pas|cassé|code|api|server|déploie|build)/.test(q)) return "technical_issue";
  if (/(?:cherche|trouve|recherche|analyse|compare|marché|concurrent)/.test(q)) return "research_request";
  if (/(?:génère|crée|image|vidéo|audio|design|visuel)/.test(q)) return "creative_task";
  if (/(?:souviens|rappelle|mémorise|retiens|oublié|qu'est-ce que j'ai)/.test(q)) return "memory_query";

  return "general";
}

// ─── Agent Perspective Generation ─────────────────────────────────────────────

interface AgentPerspective {
  agent: AgentRole;
  perspective: string;
  confidence: number;
  concerns: string[];
  recommendations: string[];
}

async function getAgentPerspective(
  agent: Agent,
  query: string,
  context: string,
  otherPerspectives: AgentPerspective[]
): Promise<AgentPerspective> {
  const startTime = Date.now();

  let prompt = `${agent.systemPrompt}

Contexte global:
${context}

Requête utilisateur: ${query}
`;

  if (otherPerspectives.length > 0) {
    prompt += `

Autres perspectives à considérer:
${otherPerspectives.map(p => `[${p.agent}]: ${p.perspective}\n  Préoccupations: ${p.concerns.join(", ")}`).join("\n\n")}

Tu dois apporter une perspective UNIQUE et COMPLÉMENTAIRE. Ne répète pas ce qui a été dit.
`;
  }

  prompt += `

Réponds en JSON strict:
{
  "perspective": "ton analyse (2-4 phrases)",
  "confidence": 0.0-1.0,
  "concerns": ["préoccupation 1", "préoccupation 2"],
  "recommendations": ["recommandation 1", "recommandation 2"]
}`;

  try {
    const result = await smartCompletion("reasoning", [{ role: "system", content: prompt }], {
      maxTokens: 600,
      needsJSON: true,
    });

    recordAIMetric({
      timestamp: new Date(),
      model: result.model,
      provider: "replit",
      taskType: `council_${agent.role}`,
      latencyMs: result.latencyMs,
      success: true,
    });

    try {
      const parsed = JSON.parse(result.content);
      return {
        agent: agent.role,
        perspective: parsed.perspective || "",
        confidence: Number(parsed.confidence) || 0.5,
        concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      };
    } catch {
      return {
        agent: agent.role,
        perspective: result.content.slice(0, 300),
        confidence: 0.5,
        concerns: [],
        recommendations: [],
      };
    }
  } catch (err) {
    recordAIMetric({
      timestamp: new Date(),
      model: "unknown",
      provider: "replit",
      taskType: `council_${agent.role}`,
      latencyMs: Date.now() - startTime,
      success: false,
      errorCode: err instanceof Error ? err.message : "Unknown error",
    });

    return {
      agent: agent.role,
      perspective: agent.fallbackResponse,
      confidence: 0.3,
      concerns: [],
      recommendations: [],
    };
  }
}

// ─── Red Team Challenge ───────────────────────────────────────────────────────

async function redTeamChallenge(
  perspectives: AgentPerspective[],
  context: string
): Promise<string> {
  const redAgent = getAgent("red_team");
  if (!redAgent) return "";

  const prompt = `${redAgent.systemPrompt}

Contexte: ${context}

Perspectives soumises:
${perspectives.map(p => `[${p.agent}]: ${p.perspective}\n  Recommandations: ${p.recommendations.join(", ")}`).join("\n\n")}

Ton rôle: IDENTIFIER LES FAILLES. Contredis, questionne, challenge.
Trouve au moins 2 problèmes majeurs dans ce qui est proposé.

Réponds avec tes critiques directes (pas de JSON, juste du texte).`;

  try {
    const result = await smartCompletion("analysis", [{ role: "system", content: prompt }], {
      maxTokens: 400,
    });

    recordAIMetric({
      timestamp: new Date(),
      model: result.model,
      provider: "replit",
      taskType: "red_team_challenge",
      latencyMs: result.latencyMs,
      success: true,
    });

    return result.content;
  } catch {
    return "";
  }
}

// ─── Chief Synthesis ──────────────────────────────────────────────────────────

async function chiefSynthesis(
  query: string,
  perspectives: AgentPerspective[],
  redTeamCritique: string,
  context: string
): Promise<string> {
  const chiefAgent = getAgent("chief_of_staff");
  if (!chiefAgent) return "Analyse non disponible.";

  const prompt = `${chiefAgent.systemPrompt}

Contexte global:
${context}

Requête: ${query}

Perspectives des agents:
${perspectives.map(p => `[${p.agent}] (confiance: ${Math.round(p.confidence * 100)}%):
${p.perspective}
  Préoccupations: ${p.concerns.join(", ")}
  Recommandations: ${p.recommendations.join(", ")}`).join("\n\n")}

${redTeamCritique ? `Critique Red Team:
${redTeamCritique}` : "Pas de critique Red Team."}

Ton rôle: SYNTHÉTISER une recommandation finale argumentée.
Prends en compte toutes les perspectives et la critique.
Donne une direction claire avec:
1. Analyse synthétisée (3-4 phrases max)
2. Recommandations prioritaires (2-3 actions)
3. Points d'attention / risques

Sois direct et actionnable. Pas de formulation vague.`;

  try {
    const result = await smartCompletion("reasoning", [{ role: "system", content: prompt }], {
      maxTokens: 800,
    });

    recordAIMetric({
      timestamp: new Date(),
      model: result.model,
      provider: "replit",
      taskType: "chief_synthesis",
      latencyMs: result.latencyMs,
      success: true,
    });

    return result.content;
  } catch {
    return chiefAgent.fallbackResponse;
  }
}

// ─── Memory Context Enhancement ──────────────────────────────────────────────

async function getMemoryContext(query: string): Promise<string> {
  try {
    const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (keywords.length === 0) return "";

    const conditions = keywords.slice(0, 5).map(kw =>
      or(
        like(memoriesTable.title, `%${kw}%`),
        like(memoriesTable.content, `%${kw}%`)
      )
    );

    const results = await db.select()
      .from(memoriesTable)
      .where(or(...conditions))
      .orderBy(desc(memoriesTable.createdAt))
      .limit(5);

    if (results.length === 0) return "";

    return `Mémoires pertinentes:\n${results.map(m => `- ${m.title}: ${(m.content || "").slice(0, 150)}`).join("\n")}`;
  } catch {
    return "";
  }
}

async function getDecisionContext(query: string): Promise<string> {
  try {
    const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (keywords.length === 0) return "";

    const conditions = keywords.slice(0, 3).map(kw =>
      or(
        like(decisionsTable.title, `%${kw}%`),
        like(decisionsTable.context || sql`'`, `%${kw}%`)
      )
    );

    const results = await db.select()
      .from(decisionsTable)
      .where(or(...conditions))
      .orderBy(desc(decisionsTable.createdAt))
      .limit(3);

    if (results.length === 0) return "";

    return `Décisions passées similaires:\n${results.map(d => `- ${d.title}: ${d.status}, résultat: ${(d.result || "non décidé")?.slice(0, 100)}`).join("\n")}`;
  } catch {
    return "";
  }
}

// ─── Main Council Pipeline ────────────────────────────────────────────────────

export interface CouncilResult {
  classification: string;
  perspectives: AgentPerspective[];
  redTeamCritique: string;
  synthesis: string;
  totalAgentsConsulted: number;
}

export async function runAgentCouncil(
  query: string,
  conversationHistory: Array<{ role: string; content: string }> = []
): Promise<CouncilResult> {
  const classification = classifyRequest(query);
  const config = COUNCIL_PRESETS[classification];

  // Gather context
  const [userContext, memoryContext, decisionContext] = await Promise.all([
    gatherUserContext(),
    getMemoryContext(query),
    getDecisionContext(query),
  ]);

  const fullContext = [userContext, memoryContext, decisionContext].filter(Boolean).join("\n\n");

  // Collect perspectives from relevant agents
  const perspectives: AgentPerspective[] = [];

  for (const role of config.agents) {
    if (role === "red_team") continue; // Red Team runs separately

    const agent = getAgent(role);
    if (!agent || role === "chief_of_staff") continue;

    const perspective = await getAgentPerspective(agent, query, fullContext, perspectives);
    perspectives.push(perspective);
  }

  // Red Team challenge if required
  let redTeamCritique = "";
  if (config.redTeamRequired && perspectives.length > 0) {
    redTeamCritique = await redTeamChallenge(perspectives, fullContext);
  }

  // Chief synthesis
  const synthesis = await chiefSynthesis(query, perspectives, redTeamCritique, fullContext);

  return {
    classification,
    perspectives,
    redTeamCritique,
    synthesis,
    totalAgentsConsulted: perspectives.length + (redTeamCritique ? 1 : 0),
  };
}

// ─── Legacy compatibility ─────────────────────────────────────────────────────

export async function runChiefWithCouncil(
  userMessage: string,
  history: Array<{ role: string; content: string }> = []
): Promise<AgentResponse> {
  const council = await runAgentCouncil(userMessage, history);

  // Format response
  let content = council.synthesis;

  if (council.perspectives.length > 1) {
    content = `${council.synthesis}\n\n---\n**Consultés:** ${council.perspectives.map(p => p.agent).join(", ")}`;
  }

  return {
    content,
    toolCalls: [],
  };
}
