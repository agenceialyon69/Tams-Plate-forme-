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
import { StudioOrchestrator } from "./studio/studio-orchestrator";
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
const HONEST_MEDIA_LIMIT = "La génération vidéo réelle n’est pas encore connectée. Je peux préparer le plan complet et le prompt utilisable dans un générateur vidéo externe.";

function localPlanningFallback(task: string): OrchestrationResult {
  const lower = task.toLowerCase();
  const isVideo = /vid[ée]o|tiktok|reel|runway|kling|veo/.test(lower);

  if (isVideo) {
    const platform = lower.includes("tiktok")
      ? "tiktok"
      : lower.includes("instagram") || lower.includes("reel")
        ? "instagram"
        : lower.includes("youtube")
          ? "youtube"
          : lower.includes("linkedin")
            ? "linkedin"
            : "generic";
    const studio = new StudioOrchestrator().orchestrate({
      objective: task,
      targetPlatform: platform,
      format: platform === "youtube" ? "long_video" : "short_video",
      tone: "energetic",
      product: lower.includes("activewear") ? "produit activewear" : "produit",
    });
    const externalPrompt = [
      "Créer une vidéo verticale publicitaire native et crédible.",
      studio.creativeBrief,
      studio.scriptPlan,
      studio.storyboardPlan,
      "Style: plans courts, mouvement naturel, lumière réaliste, texte lisible, aucun claim non vérifié.",
      "Respecter la plateforme cible et terminer par un CTA clair.",
    ].join("\n\n");
    const result = (agent: AgentId, output: string): AgentRunResult => ({
      agent,
      name: AGENTS[agent].name,
      output,
      toolsUsed: [],
    });
    const results: AgentRunResult[] = [
      result("executive", [
        "OBJECTIF REFORMULÉ",
        `Préparer un plan de vidéo ${platform} exploitable pour présenter le produit, sans prétendre produire un fichier média.`,
        "COORDINATION",
        "Product clarifie la valeur, Marketing construit l’accroche, Studio livre la production, Research pose les hypothèses, Red Team contrôle les promesses et DevOps précise les limites techniques.",
        HONEST_MEDIA_LIMIT,
      ].join("\n\n")),
      result("product", [
        "CIBLE",
        "Personne active cherchant une tenue confortable, valorisante et adaptée à un usage quotidien.",
        "PROPOSITION DE VALEUR",
        "Montrer le bénéfice concret en situation réelle plutôt qu’énumérer des caractéristiques.",
        "ANGLE PRODUIT",
        "Du mouvement réel, une coupe visible et une preuve d’usage. Toute performance produit doit être validée avant publication.",
      ].join("\n\n")),
      result("marketing", [
        "HOOK TIKTOK",
        "« Ta tenue suit-elle vraiment ton rythme ? »",
        "PROMESSE",
        "Découvrir une tenue activewear pensée pour accompagner les mouvements du quotidien.",
        "STRUCTURE COURTE",
        "0–3 s hook visuel · 3–10 s problème · 10–22 s produit en action · 22–27 s bénéfice · 27–30 s CTA.",
      ].join("\n\n")),
      result("studio", [
        "SCRIPT",
        studio.scriptPlan,
        "STORYBOARD",
        studio.storyboardPlan,
        "SHOT LIST",
        "1. Gros plan matière et texture.\n2. Enfilage ou préparation.\n3. Mouvement dynamique en plan large.\n4. Détail coupe/confort.\n5. Plan résultat puis CTA.",
        "PROMPT KLING / RUNWAY / VEO",
        externalPrompt,
        "CAPTIONS",
        "Bouge librement. Reste toi-même. Découvre la collection. #activewear #tiktokfashion #movement",
        "PLAN DE MONTAGE",
        studio.productionSteps.map(step => `${step.order}. ${step.name} — ${step.notes}`).join("\n"),
      ].join("\n\n")),
      result("research", [
        "HYPOTHÈSES À VÉRIFIER",
        "Audience exacte, bénéfice prioritaire, preuves produit disponibles, droits musique/image et vocabulaire de marque.",
        "CONTRAINTES PLATEFORME",
        "Vertical 9:16, hook immédiat, sous-titres lisibles, rythme court, safe zones UI et contenu publicitaire identifiable.",
        "Les tendances doivent être vérifiées au moment de publier ; aucune tendance temps réel n’est inventée.",
      ].join("\n\n")),
      result("redteam", [
        "RISQUES",
        "Faux claim de performance, résultat corporel implicite, témoignage non prouvé, musique sans licence, visuel trompeur ou promesse de fichier inexistant.",
        "GARDE-FOUS",
        "Valider chaque claim, utiliser des assets autorisés, relire les captions et ne jamais annoncer qu’un média est produit sans artefact vérifiable.",
      ].join("\n\n")),
      result("devops", [
        "ÉTAT TECHNIQUE",
        "Aucun fichier vidéo réel n’a été généré. Studio fournit ici un plan déterministe ; la génération externe reste manuelle.",
        "PROCHAINES ACTIONS",
        "1. Valider brief et claims.\n2. Copier le prompt dans Kling, Runway ou Veo.\n3. Importer le rendu réel.\n4. Monter/sous-titrer avec FFmpeg.\n5. Contrôler le fichier avant publication.",
        HONEST_MEDIA_LIMIT,
      ].join("\n\n")),
    ];
    return {
      plan: {
        rationale: "Plan multi-agent local spécialisé, utilisé même si le fournisseur IA est indisponible.",
        delegations: results.filter(item => item.agent !== "executive").map(item => ({
          agent: item.agent,
          subtask: `Contribuer au plan: ${item.name}`,
        })),
      },
      results,
      synthesis: [
        "PLAN GLOBAL",
        "Le plan couvre cible, angle produit, hook, script, storyboard, shot list, prompt externe, captions, risques et étapes techniques.",
        HONEST_MEDIA_LIMIT,
        "PROCHAINE ACTION",
        "Validez le brief, puis utilisez le prompt Studio dans un générateur externe. TAMS ne présentera un fichier comme généré qu’après réception d’un artefact réel.",
      ].join("\n\n"),
    };
  }

  if (/repo|repository|d[ée]p[ôo]t|codebase|audit.*code/.test(lower)) {
    const repoResults: AgentRunResult[] = [
      {
        agent: "executive",
        name: AGENTS.executive.name,
        output: "MODE READ-ONLY / PLAN UNIQUEMENT\nJe peux préparer l’audit et les corrections proposées. Je ne modifie pas le dépôt tant que Patch Engine, ownership et approbation d’écriture ne sont pas prouvés.",
        toolsUsed: [],
      },
      {
        agent: "engineering",
        name: AGENTS.engineering.name,
        output: "PLAN D’AUDIT\n1. Scan structure et dépendances.\n2. Identifier erreurs, dette et risques.\n3. Prioriser un plan de corrections.\n4. Produire un patch proposé.\n5. Exécuter typecheck, build et tests.\n6. Ouvrir une PR après validation humaine.",
        toolsUsed: [],
      },
      {
        agent: "redteam",
        name: AGENTS.redteam.name,
        output: "RISQUES\nSecrets, permissions excessives, injection de prompt, patch hors périmètre, tests insuffisants et push direct vers main doivent être refusés.",
        toolsUsed: [],
      },
      {
        agent: "devops",
        name: AGENTS.devops.name,
        output: "ÉTAT ACTUEL\nRepo Intelligence et validation existent partiellement. Patch Engine transactionnel, GitHub Operator et Railway Operator restent à connecter avec permissions minimales.",
        toolsUsed: [],
      },
    ];
    return {
      plan: {
        rationale: "Plan Dev Agent read-only, honnête et soumis à validation humaine.",
        delegations: repoResults.filter(item => item.agent !== "executive").map(item => ({ agent: item.agent, subtask: item.output.split("\n")[0] })),
      },
      results: repoResults,
      synthesis: "SCAN → RISQUES → PLAN → PATCH PROPOSÉ → TESTS → PR. Mode plan uniquement : aucune modification réelle du repo n’est annoncée.",
    };
  }

  const selected: AgentId[] = /d[ée]cision|choisir|option/.test(lower)
    ? ["product", "decision", "redteam"]
    : /code|d[ée]veloppement|bug|technique/.test(lower)
      ? ["engineering", "product", "devops", "redteam"]
      : /recherche|march[ée]|tendance/.test(lower)
        ? ["research", "product", "marketing", "redteam"]
        : ["product", "research", "marketing", "redteam"];
  const results = selected.map(agent => ({
    agent,
    name: AGENTS[agent].name,
    output: `Contribution en mode plan — ${AGENTS[agent].role}: analyser « ${task} », expliciter hypothèses, livrables, risques et prochaine action vérifiable.`,
    toolsUsed: [],
  }));
  return {
    plan: {
      rationale: "Plan local structuré utilisé car la planification IA est indisponible.",
      delegations: selected.map(agent => ({ agent, subtask: `Préparer la contribution ${AGENTS[agent].role}` })),
    },
    results,
    synthesis: "Mode plan uniquement — aucune exécution autonome. Validez les hypothèses, transformez les contributions en tâches, puis exécutez chaque action avec un outil explicitement connecté.",
  };
}

export async function orchestrate(task: string): Promise<OrchestrationResult> {
  const cos = AGENTS.executive;
  if (/vid[ée]o|tiktok|reel|runway|kling|veo/i.test(task)) {
    return localPlanningFallback(task);
  }
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
    return localPlanningFallback(task);
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
