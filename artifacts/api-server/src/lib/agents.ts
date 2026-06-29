/**
 * Système multi-agents (Pilier 3 Agent System).
 *
 * Architecture modulaire : un registre d'agents spécialisés, chacun avec
 * responsabilités, outils (limites), mémoire (contexte) et capacité de
 * délégation. Le Chief of Staff (executive) orchestre les autres agents.
 *
 * 100 % gratuit : toute inférence passe par le routeur IA free-first (lib/ai).
 */
import { aiChat, aiConfigured, type AiTask } from "./ai";
import {
  SYSTEM_PROMPT,
  gatherUserContext,
  toolsFor,
  executeTool,
} from "./agent-tools";

export type AgentId =
  | "executive" | "engineering" | "product" | "business" | "marketing"
  | "research" | "memory" | "decision" | "studio" | "devops" | "redteam";

export interface AgentDef {
  id: AgentId;
  name: string;
  role: string;
  responsibilities: string[];
  /** Noms d'outils autorisés (limites). */
  tools: string[];
  /** Seul le Chief of Staff peut déléguer. */
  canDelegate: boolean;
  /** Palier de modèle gratuit préféré. */
  task: AiTask;
  systemPrompt: string;
}

const F = "Réponds en français, de façon directe, structurée et actionnable, sans langue de bois.";

export const AGENTS: Record<AgentId, AgentDef> = {
  executive: {
    id: "executive",
    name: "Chief of Staff",
    role: "Orchestrateur exécutif",
    responsibilities: [
      "Comprendre l'intention globale",
      "Décomposer en sous-tâches",
      "Déléguer aux agents spécialisés",
      "Synthétiser une réponse unique et claire",
    ],
    tools: ["create_task", "create_decision", "create_memory"],
    canDelegate: true,
    task: "reasoning",
    systemPrompt: `Tu es le Chief of Staff de Mohamed, chef d'orchestre d'une équipe d'agents IA spécialisés. Tu transformes une demande en plan, tu coordonnes les bons agents, puis tu livres une synthèse exécutive. Tu penses priorités, risques et impact. ${F}`,
  },
  engineering: {
    id: "engineering",
    name: "Engineering Agent",
    role: "Architecture & code",
    responsibilities: ["Architecture logicielle", "Qualité du code", "Choix techniques", "Dette technique"],
    tools: ["create_task"],
    canDelegate: false,
    task: "reasoning",
    systemPrompt: `Tu es un ingénieur logiciel senior. Tu raisonnes architecture, simplicité, robustesse et coût de maintenance. Tu proposes des solutions concrètes et des étapes d'implémentation. ${F}`,
  },
  product: {
    id: "product",
    name: "Product Agent",
    role: "Produit & UX",
    responsibilities: ["Vision produit", "Priorisation", "Specs", "Expérience utilisateur"],
    tools: ["create_task"],
    canDelegate: false,
    task: "chat",
    systemPrompt: `Tu es un Head of Product. Tu clarifies le problème utilisateur, tu priorises par impact/effort, et tu rédiges des specs simples et testables. ${F}`,
  },
  business: {
    id: "business",
    name: "Business Agent",
    role: "Business & finances",
    responsibilities: ["Modèle économique", "Coûts/revenus", "Stratégie", "Opportunités"],
    tools: ["create_task", "create_decision"],
    canDelegate: false,
    task: "reasoning",
    systemPrompt: `Tu es un conseiller business. Tu évalues viabilité, coûts, revenus et risques. Tu privilégies toujours les solutions gratuites/open source quand elles suffisent. ${F}`,
  },
  marketing: {
    id: "marketing",
    name: "Marketing Agent",
    role: "Croissance & contenu",
    responsibilities: ["Positionnement", "Acquisition", "Contenu", "Narratif"],
    tools: ["create_task"],
    canDelegate: false,
    task: "chat",
    systemPrompt: `Tu es un growth marketer. Tu proposes positionnement, angles, canaux et contenus à fort levier, low-cost. ${F}`,
  },
  research: {
    id: "research",
    name: "Research Agent",
    role: "Recherche & analyse",
    responsibilities: ["Recherche d'information", "Synthèse", "Veille", "Comparatifs"],
    tools: ["create_memory"],
    canDelegate: false,
    task: "reasoning",
    systemPrompt: `Tu es un analyste de recherche. Tu structures l'information, tu compares les options et tu cites tes hypothèses. Si une donnée manque, tu le dis clairement plutôt que d'inventer. ${F}`,
  },
  memory: {
    id: "memory",
    name: "Memory Agent",
    role: "Mémoire & contexte",
    responsibilities: ["Mémoriser l'important", "Relier les informations", "Rappeler le contexte"],
    tools: ["create_memory"],
    canDelegate: false,
    task: "fast",
    systemPrompt: `Tu es le gardien de la mémoire de Mohamed. Tu identifies ce qui mérite d'être mémorisé et tu le relies au contexte existant (personnes, projets, décisions). ${F}`,
  },
  decision: {
    id: "decision",
    name: "Decision Agent",
    role: "Décisions",
    responsibilities: ["Options", "Avantages/risques", "Niveau de confiance", "Recommandation"],
    tools: ["create_decision", "create_task"],
    canDelegate: false,
    task: "reasoning",
    systemPrompt: `Tu es un expert en aide à la décision. Tu structures options, avantages, risques, et tu donnes une recommandation avec un niveau de confiance (0-100). ${F}`,
  },
  studio: {
    id: "studio",
    name: "Studio Agent",
    role: "Création (Studio)",
    responsibilities: ["Brief créatif", "Prompts image/vidéo/audio", "Production de contenu"],
    tools: ["create_memory"],
    canDelegate: false,
    task: "chat",
    systemPrompt: `Tu es directeur créatif du Studio TAMS. Tu transformes une idée en brief et en prompts précis (image/vidéo/audio/doc) exploitables par les moteurs gratuits (Pollinations/Flux, FFmpeg, Whisper). ${F}`,
  },
  devops: {
    id: "devops",
    name: "DevOps Agent",
    role: "Déploiement & infra",
    responsibilities: ["Build", "Railway/Docker/nixpacks", "Variables d'env", "Santé & CI"],
    tools: ["create_task"],
    canDelegate: false,
    task: "reasoning",
    systemPrompt: `Tu es un ingénieur DevOps. Tu veilles à ce que le projet build et déploie sur Railway (autodeploy depuis main), healthcheck OK, variables correctes. Tu proposes des correctifs concrets et minimaux. ${F}`,
  },
  redteam: {
    id: "redteam",
    name: "Red Team Agent",
    role: "Critique adversariale",
    responsibilities: ["Failles", "Biais", "Risques cachés", "Régressions", "Sécurité"],
    tools: [],
    canDelegate: false,
    task: "reasoning",
    systemPrompt: `Tu es une Red Team sans complaisance. Tu cherches activement les failles, biais, risques cachés, problèmes de sécurité et régressions. Tu es sceptique mais constructif : chaque critique vient avec une parade. ${F}`,
  },
};

export const AGENT_LIST: AgentDef[] = Object.values(AGENTS);

/** Métadonnées publiques d'un agent (sans le prompt système interne). */
export function agentMeta(a: AgentDef) {
  return {
    id: a.id,
    name: a.name,
    role: a.role,
    responsibilities: a.responsibilities,
    tools: a.tools,
    canDelegate: a.canDelegate,
  };
}

export interface AgentRunResult {
  agent: AgentId;
  name: string;
  output: string;
  toolsUsed: string[];
}

/**
 * Exécute un agent sur une tâche. L'agent peut appeler ses outils autorisés
 * (limites), puis produit une réponse finale. Inférence via routeur gratuit.
 */
export async function runAgent(
  id: AgentId,
  task: string,
  extraContext?: string,
): Promise<AgentRunResult> {
  const agent = AGENTS[id];
  if (!agent) throw new Error(`Agent inconnu: ${id}`);

  const userContext = await gatherUserContext();
  const toolsUsed: string[] = [];

  const messages: any[] = [
    {
      role: "system",
      content: `${SYSTEM_PROMPT}\n\n[Rôle: ${agent.name} — ${agent.role}]\n${agent.systemPrompt}\n\nContexte actuel:\n${userContext}${extraContext ? `\n\nContexte additionnel:\n${extraContext}` : ""}`,
    },
    { role: "user", content: task },
  ];

  const agentTools = toolsFor(agent.tools);
  const body: Record<string, unknown> = { messages, max_tokens: 900 };
  if (agentTools.length > 0) body.tools = agentTools;

  let completion: any;
  try {
    completion = await aiChat(body, agent.task);
  } catch {
    // Message honnête : si des fournisseurs SONT configurés, c'est un échec
    // transitoire (quota gratuit saturé en parallèle), pas une absence de config.
    const output = aiConfigured()
      ? `[${agent.name}] Réponse temporairement indisponible (quota gratuit saturé par les appels simultanés). Réessaie dans un instant.`
      : `[${agent.name}] Aucun fournisseur IA configuré (Groq/Gemini/Ollama/OpenRouter) — voir GET /api/system/ai.`;
    return { agent: id, name: agent.name, output, toolsUsed };
  }

  const choice = completion.choices?.[0]?.message;
  let output = choice?.content ?? "";

  // Exécuter les éventuels appels d'outils, puis demander une synthèse.
  const toolCalls = choice?.tool_calls ?? [];
  if (Array.isArray(toolCalls) && toolCalls.length > 0) {
    const results: string[] = [];
    for (const tc of toolCalls) {
      if (tc.type && tc.type !== "function") continue;
      const fnName = tc.function?.name;
      if (!fnName || !agent.tools.includes(fnName)) continue; // respecte les limites
      let args: any = {};
      try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { /* args vides */ }
      const r = await executeTool(fnName, args);
      results.push(r);
      toolsUsed.push(fnName);
    }
    if (results.length > 0) {
      try {
        const followUp = await aiChat({
          messages: [
            ...messages,
            { role: "assistant", content: output || "" },
            { role: "system", content: `Actions effectuées:\n${results.join("\n")}\nRésume le résultat pour Mohamed.` },
          ],
          max_tokens: 500,
        }, agent.task);
        output = followUp.choices?.[0]?.message?.content ?? output;
      } catch {
        output = `${output}\n\n${results.join("\n")}`.trim();
      }
    }
  }

  return { agent: id, name: agent.name, output: output || "(pas de réponse)", toolsUsed };
}

export interface OrchestrationResult {
  plan: { rationale: string; delegations: { agent: AgentId; subtask: string }[] };
  results: AgentRunResult[];
  synthesis: string;
}

export interface CouncilResult {
  query: string;
  opinions: AgentRunResult[];
  synthesis: string;
  recommendation: string;
}

export interface PipelineResult {
  query: string;
  steps: Array<{
    agent: AgentId;
    name: string;
    input: string;
    output: string;
    toolsUsed: string[];
  }>;
  finalOutput: string;
}

export interface DelegationResult {
  source: AgentId;
  target: AgentId;
  query: string;
  response: AgentRunResult;
}

/**
 * Délègue une sous-tâche d'un agent source vers un agent cible.
 * Le source agent reste inchangé, on exécute simplement le target agent.
 */
export async function delegateToAgent(
  source: AgentId,
  target: AgentId,
  query: string,
  extraContext?: string,
): Promise<DelegationResult> {
  const targetAgent = AGENTS[target];
  if (!targetAgent) throw new Error(`Agent cible inconnu: ${target}`);

  const context = extraContext
    ? `[Délégation depuis ${AGENTS[source]?.name ?? source}]\n${extraContext}`
    : `[Délégation depuis ${AGENTS[source]?.name ?? source}]`;

  const response = await runAgent(target, query, context);

  return {
    source,
    target,
    query,
    response,
  };
}

/**
 * Conseil multi-agents : rassemble 3-5 agents pertinents pour donner leur avis
 * indépendant, puis un synthétiseur (Chief of Staff) fusionne les avis.
 */
export async function runAgentCouncil(
  query: string,
  requestedAgents?: AgentId[],
  _extraContext?: string,
): Promise<CouncilResult> {
  const cos = AGENTS.executive;

  // Déterminer les agents à consulter
  let agentsToConsult: AgentId[];
  if (requestedAgents && requestedAgents.length > 0) {
    agentsToConsult = requestedAgents.filter(id => id !== "executive" && AGENTS[id]);
  } else {
    // Sélection automatique basée sur la query
    const q = query.toLowerCase();
    const scored = AGENT_LIST
      .filter(a => a.id !== "executive")
      .map(a => {
        const text = `${a.name} ${a.role} ${a.responsibilities.join(" ")}`.toLowerCase();
        const score = text.split(" ").filter(w => w.length > 3 && q.includes(w)).length;
        return { id: a.id, score };
      })
      .sort((a, b) => b.score - a.score);
    agentsToConsult = scored.slice(0, 4).map(s => s.id);
  }

  if (agentsToConsult.length === 0) {
    agentsToConsult = ["research", "decision", "business"];
  }

  // 1. AVIS INDIVIDUELS (parallèle)
  const councilContext = `Tu participes à un conseil multi-agents. Donne ton avis EXPERT et INDÉPENDANT sur la question suivante. Sois concis mais percutant. Ne te base pas sur les avis des autres agents (tu es le premier à répondre).`;

  const opinions = await Promise.all(
    agentsToConsult.map(id =>
      runAgent(id, query, councilContext).catch(() => ({
        agent: id,
        name: AGENTS[id]?.name ?? id,
        output: "(échec de l'agent)",
        toolsUsed: [] as string[],
      })),
    ),
  );

  // 2. SYNTHÈSE PAR LE CHIEF OF STAFF
  let synthesis = "";
  let recommendation = "";
  try {
    const synthResp = await aiChat({
      messages: [
        {
          role: "system",
          content: `${cos.systemPrompt}\n\nTu es le synthétiseur d'un conseil multi-agents. Tu as reçu les avis de plusieurs experts. Produis:\n1. Une synthèse concise des points clés (consensus et divergences)\n2. Une recommandation finale claire avec justification\n\nFormat attendu:\nSYNTHÈSE: ...\nRECOMMANDATION: ...`,
        },
        {
          role: "user",
          content: `Question: ${query}\n\nAvis des experts:\n${opinions.map(o => `### ${o.name}\n${o.output}`).join("\n\n")}`,
        },
      ],
      max_tokens: 1200,
    }, "reasoning");

    const content = synthResp.choices?.[0]?.message?.content ?? "";
    const synthMatch = content.match(/SYNTH[ÈE]SE:\s*([\s\S]*?)(?=RECOMMANDATION:|$)/i);
    const recMatch = content.match(/RECOMMANDATION:\s*([\s\S]*)/i);
    synthesis = synthMatch ? synthMatch[1].trim() : content;
    recommendation = recMatch ? recMatch[1].trim() : "";
  } catch {
    synthesis = opinions.map(o => `**${o.name}** : ${o.output}`).join("\n\n");
    recommendation = "Aucune recommandation formelle — voir les avis individuels.";
  }

  return {
    query,
    opinions,
    synthesis: synthesis || "(synthèse indisponible)",
    recommendation: recommendation || "(aucune recommandation)",
  };
}

/**
 * Pipeline d'agents : exécute une séquence d'agents en chaîne.
 * La sortie de l'agent N devient l'entrée de l'agent N+1.
 */
export async function runAgentPipeline(
  tasks: Array<{ agent: AgentId; query: string }>,
  _extraContext?: string,
): Promise<PipelineResult> {
  if (!tasks || tasks.length === 0) {
    return { query: "", steps: [], finalOutput: "(aucune tâche dans le pipeline)" };
  }

  const steps: PipelineResult["steps"] = [];
  let currentInput = tasks[0].query;

  for (const task of tasks) {
    const agent = AGENTS[task.agent];
    if (!agent) {
      steps.push({
        agent: task.agent,
        name: "Agent inconnu",
        input: currentInput,
        output: `(Agent inconnu: ${task.agent})`,
        toolsUsed: [],
      });
      continue;
    }

    const pipelineContext = `Tu fais partie d'un pipeline de traitement. Voici le résultat de l'étape précédente (si applicable). Traite cette information selon ton expertise et produis une sortie structurée.`;

    const result = await runAgent(task.agent, currentInput, pipelineContext).catch(() => ({
      agent: task.agent,
      name: agent.name,
      output: "(échec de l'agent dans le pipeline)",
      toolsUsed: [] as string[],
    }));

    steps.push({
      agent: task.agent,
      name: agent.name,
      input: currentInput,
      output: result.output,
      toolsUsed: result.toolsUsed,
    });

    // La sortie devient l'entrée de la prochaine étape
    currentInput = result.output;
  }

  return {
    query: tasks[0].query,
    steps,
    finalOutput: steps[steps.length - 1]?.output ?? "(pas de résultat final)",
  };
}

/**
 * Orchestration par le Chief of Staff :
 *  1. plan — choisir les agents pertinents et leur sous-tâche
 *  2. délégation — exécuter ces agents (en parallèle)
 *  3. synthèse — consolider une réponse exécutive unique
 */
export async function orchestrate(task: string): Promise<OrchestrationResult> {
  const cos = AGENTS.executive;
  const userContext = await gatherUserContext();
  const delegatable = AGENT_LIST.filter(a => a.id !== "executive");

  // 1. PLAN (JSON structuré)
  let plan: OrchestrationResult["plan"] = { rationale: "", delegations: [] };
  try {
    const planResp = await aiChat({
      messages: [
        {
          role: "system",
          content: `${cos.systemPrompt}\n\nAgents disponibles:\n${delegatable.map(a => `- ${a.id}: ${a.role} (${a.responsibilities.join(", ")})`).join("\n")}\n\nContexte actuel:\n${userContext}\n\nChoisis 1 à 4 agents RÉELLEMENT pertinents pour la demande et assigne à chacun une sous-tâche précise. Réponds en JSON strict: { "rationale": "1 phrase", "delegations": [ { "agent": "<id>", "subtask": "..." } ] }`,
        },
        { role: "user", content: task },
      ],
      max_tokens: 500,
      response_format: { type: "json_object" },
    }, "reasoning");
    const parsed = JSON.parse(planResp.choices?.[0]?.message?.content || "{}");
    const valid = (parsed.delegations || [])
      .filter((d: any) => d && AGENTS[d.agent as AgentId] && d.agent !== "executive")
      .slice(0, 4)
      .map((d: any) => ({ agent: d.agent as AgentId, subtask: String(d.subtask || task) }));
    plan = { rationale: String(parsed.rationale || ""), delegations: valid };
  } catch {
    // Repli déterministe : recherche + décision si l'IA/planif échoue.
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

  // 2. DÉLÉGATION (parallèle)
  const results = await Promise.all(
    plan.delegations.map(d => runAgent(d.agent, d.subtask).catch(() => ({
      agent: d.agent,
      name: AGENTS[d.agent]?.name ?? d.agent,
      output: "(échec de l'agent)",
      toolsUsed: [] as string[],
    }))),
  );

  // 3. SYNTHÈSE
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

  return { plan, results, synthesis: synthesis || "(synthèse indisponible)" };
}
