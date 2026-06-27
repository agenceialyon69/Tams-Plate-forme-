import type { AgentId } from "./types";
import { AGENT_DEFINITIONS } from "./definitions";

interface RoutingRule {
  keywords: string[];
  agent: AgentId;
  confidence: number;
}

const ROUTING_RULES: RoutingRule[] = [
  // Engineering
  { keywords: ["code", "bug", "erreur", "typescript", "react", "composant", "fonction", "api", "database", "sql", "architecture", "refactor", "pr", "pull request", "git", "debug", "test", "testing"], agent: "engineering", confidence: 0.9 },
  // DevOps
  { keywords: ["deploy", "déploie", "railway", "docker", "ci/cd", "pipeline", "monitoring", "nginx", "ssl", "infra", "kubernetes", "heroku", "vercel", "supabase admin", "build"], agent: "devops", confidence: 0.9 },
  // Product
  { keywords: ["user story", "roadmap", "backlog", "fonctionnalité", "feature", "sprint", "priorité", "backlog", "product", "ux", "parcours", "flux", "wireframe", "persona"], agent: "product", confidence: 0.85 },
  // Business
  { keywords: ["business plan", "business model", "monetisation", "monétisation", "chiffre", "revenue", "profit", "marché", "market", "competitor", "concurrence", "financement", "levée", "investisseur", "pivot"], agent: "business", confidence: 0.85 },
  // Marketing
  { keywords: ["marketing", "contenu", "content", "seo", "acquisition", "growth", "funnel", "copywriting", "copy", "landing", "campagne", "email", "newsletter", "social", "linkedin", "twitter", "audience", "branding"], agent: "marketing", confidence: 0.85 },
  // Research
  { keywords: ["recherche", "analyse", "analyser", "tendance", "rapport", "étude", "données", "data", "statistique", "veille", "benchmark", "comparaison", "synthèse"], agent: "research", confidence: 0.8 },
  // Memory
  { keywords: ["mémorise", "souviens", "rappelle", "contexte", "historique", "précédent", "note", "retiens", "sauvegarde", "qu'est-ce qu'on", "on avait dit"], agent: "memory", confidence: 0.95 },
  // Decision
  { keywords: ["décision", "choisir", "choix", "dilemme", "arbitrage", "option", "trade-off", "pros cons", "pour contre", "dois-je", "devrais-je", "meilleur choix", "recommande"], agent: "decision", confidence: 0.85 },
  // Studio
  { keywords: ["image", "génère", "crée une image", "photo", "visuel", "logo", "design", "illustration", "bannière", "thumbnail", "document", "pdf", "présentation", "slide"], agent: "studio", confidence: 0.9 },
  // Red Team
  { keywords: ["red team", "faille", "risque", "challenge", "faiblesse", "adversaire", "contre-argument", "critique", "que pourrait-il aller mal", "worst case", "problème potentiel"], agent: "redteam", confidence: 0.95 },
];

export function selectBestAgent(message: string): AgentId {
  const lower = message.toLowerCase();
  let bestAgent: AgentId = "executive";
  let bestScore = 0;

  for (const rule of ROUTING_RULES) {
    const matches = rule.keywords.filter(kw => lower.includes(kw)).length;
    if (matches > 0) {
      const score = matches * rule.confidence;
      if (score > bestScore) {
        bestScore = score;
        bestAgent = rule.agent;
      }
    }
  }

  return bestAgent;
}

export function getAgentCapabilities(agentId: AgentId): string {
  const def = AGENT_DEFINITIONS[agentId];
  return `**${def.emoji} ${def.name}** — ${def.role}\n${def.responsibilities.slice(0, 3).join(", ")}`;
}

export function buildSystemPromptWithContext(
  agentId: AgentId,
  context: {
    memories?: Array<{ title: string; content: string }>;
    recentTasks?: string[];
    recentDecisions?: string[];
  },
): string {
  const def = AGENT_DEFINITIONS[agentId];
  let prompt = def.systemPrompt;

  if (context.memories && context.memories.length > 0) {
    const memCtx = context.memories
      .slice(0, 5)
      .map(m => `- [${m.title}]: ${m.content.slice(0, 200)}`)
      .join("\n");
    prompt += `\n\n## Contexte mémoire récent:\n${memCtx}`;
  }

  if (context.recentTasks && context.recentTasks.length > 0) {
    prompt += `\n\n## Tâches récentes: ${context.recentTasks.slice(0, 3).join(", ")}`;
  }

  if (context.recentDecisions && context.recentDecisions.length > 0) {
    prompt += `\n\n## Décisions récentes: ${context.recentDecisions.slice(0, 3).join(", ")}`;
  }

  return prompt;
}

export function getOrchestrationPlan(
  message: string,
): { primary: AgentId; supporting: AgentId[] } {
  const lower = message.toLowerCase();
  const primary = selectBestAgent(message);

  const supporting: AgentId[] = [];
  const def = AGENT_DEFINITIONS[primary];

  // Add supporting agents from delegation list if message is complex
  if (lower.length > 100 || lower.includes("complet") || lower.includes("analyse") || lower.includes("plan")) {
    const potentialSupport = def.delegatesTo.slice(0, 2);
    supporting.push(...potentialSupport);
  }

  return { primary, supporting };
}
