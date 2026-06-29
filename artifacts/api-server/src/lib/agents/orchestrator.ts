/**
 * Agent Orchestrator
 * Routes requests to the appropriate agent, handles tool execution
 */

import type { Agent, AgentRole, AgentContext, AgentResponse } from "./types";
import { getAgent, getAllAgents } from "./definitions";
import { db } from "@workspace/db";
import {
  tasksTable,
  projectsTable,
  contactsTable,
  decisionsTable,
  memoriesTable,
} from "@workspace/db";
import { eq, sql, desc, or, and, like } from "drizzle-orm";
import { smartCompletion, type AICapability } from "../ai-router";
import { recordAIMetric } from "../observability";

// ─── Tool Executors (real database operations) ───────────────────────────────

async function executeCreateTask(args: Record<string, unknown>): Promise<string> {
  const [created] = await db.insert(tasksTable).values({
    title: String(args.title),
    description: args.description ? String(args.description) : null,
    priority: (args.priority as "low" | "medium" | "high" | "urgent") || "medium",
    projectId: args.projectId ? Number(args.projectId) : null,
  }).returning();
  return `Tâche créée: "${created.title}" (ID: ${created.id}, priorité: ${created.priority})`;
}

async function executeCreateProject(args: Record<string, unknown>): Promise<string> {
  const [created] = await db.insert(projectsTable).values({
    name: String(args.name),
    description: args.description ? String(args.description) : null,
  }).returning();
  return `Projet créé: "${created.name}" (ID: ${created.id})`;
}

async function executeCreateContact(args: Record<string, unknown>): Promise<string> {
  const status = args.status as "prospect" | "active" | "inactive" | "client" | undefined;
  const [created] = await db.insert(contactsTable).values({
    name: String(args.name),
    company: args.company ? String(args.company) : null,
    email: args.email ? String(args.email) : null,
    status: status || "prospect",
  }).returning();
  return `Contact créé: "${created.name}" (ID: ${created.id}, statut: ${created.status})`;
}

async function executeCreateDecision(args: Record<string, unknown>): Promise<string> {
  const [created] = await db.insert(decisionsTable).values({
    title: String(args.title),
    context: args.context ? String(args.context) : null,
  }).returning();
  return `Décision créée: "${created.title}" (ID: ${created.id})`;
}

async function executeCreateMemory(args: Record<string, unknown>): Promise<string> {
  const [created] = await db.insert(memoriesTable).values({
    title: String(args.title),
    content: args.content ? String(args.content) : null,
    type: (args.type as any) || "note",
  }).returning();
  return `Mémoire enregistrée: "${created.title}" (ID: ${created.id})`;
}

async function executeSearchMemories(args: Record<string, unknown>): Promise<string> {
  const query = String(args.query);
  const limit = Number(args.limit) || 5;

  const results = await db.select()
    .from(memoriesTable)
    .where(
      or(
        like(memoriesTable.title, `%${query}%`),
        like(memoriesTable.content, `%${query}%`)
      )
    )
    .limit(limit);

  if (results.length === 0) {
    return `Aucune mémoire trouvée pour: "${query}"`;
  }

  return `Mémoires trouvées (${results.length}):\n${results.map(m => `- ${m.title}: ${m.content?.slice(0, 100) || "pas de contenu"}`).join("\n")}`;
}

async function executeListTasks(args: Record<string, unknown>): Promise<string> {
  const limit = Math.min(Number(args.limit) || 10, 25);
  const rows = await db.select().from(tasksTable)
    .where(sql`${tasksTable.status} NOT IN ('done','cancelled')`)
    .orderBy(desc(tasksTable.createdAt))
    .limit(limit);
  if (rows.length === 0) return "Aucune tâche active.";
  return `Tâches actives (${rows.length}):\n${rows.map(t => `- #${t.id} "${t.title}" (${t.priority}, ${t.status})`).join("\n")}`;
}

async function executeGenerateImage(args: Record<string, unknown>): Promise<string> {
  const prompt = String(args.prompt ?? args.description ?? "").trim();
  if (!prompt) return "Décris l'image à générer.";
  // Pollinations : génération GRATUITE, sans clé, déterministe par URL.
  const seed = Math.floor(Math.random() * 1_000_000);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&model=flux&seed=${seed}`;
  // Marqueur IMAGE: → le Chat affiche l'image (et non juste l'URL).
  return `IMAGE:${url}`;
}

async function executeCreateVideo(args: Record<string, unknown>): Promise<string> {
  const prompt = String(args.prompt ?? args.description ?? "").trim();
  if (!prompt) return "Décris la vidéo à générer.";
  const scenes = Math.min(Math.max(Number(args.scenes) || 3, 1), 6);
  const text = args.text ? String(args.text) : undefined;
  // Génère N images verticales variées (Pollinations) puis les assemble en
  // vidéo 9:16 (FFmpeg). 100% gratuit. Le chemin gratuit réel pour une "vidéo".
  const images = Array.from({ length: scenes }, (_, i) => {
    const seed = Math.floor(Math.random() * 1_000_000) + i;
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=720&height=1280&nologo=true&model=flux&seed=${seed}`;
  });
  try {
    const { generateSlideshowVideo } = await import("../video");
    const result = await generateSlideshowVideo({ images, text, secondsPerImage: 2.5 });
    return `VIDEO:${result.url}`;
  } catch (err) {
    return `Échec de la génération vidéo: ${err instanceof Error ? err.message : "erreur"}`;
  }
}

async function executeMissionTool(args: Record<string, unknown>): Promise<string> {
  const goal = String(args.goal ?? args.mission ?? args.prompt ?? "").trim();
  if (!goal) return "Décris la mission à réaliser (ex: crée une musique drill, crée un clip TikTok).";
  const { executeMission } = await import("./executive");
  return executeMission(goal);
}

async function executeGenerateMusic(args: Record<string, unknown>): Promise<string> {
  const prompt = String(args.prompt ?? args.description ?? "").trim();
  if (!prompt) return "Décris la musique à générer.";
  const { generateMusic } = await import("../audio");
  const r = await generateMusic(prompt);
  if (!r.ok) return `Musique indisponible: ${r.hint || r.error}`;
  return `AUDIO:${r.url}`;
}

async function executeUpdateTaskStatus(args: Record<string, unknown>): Promise<string> {
  const id = Number(args.task_id ?? args.id ?? args.taskId);
  const status = String(args.status) as "todo" | "in_progress" | "done" | "cancelled";
  if (!id || !["todo", "in_progress", "done", "cancelled"].includes(status)) {
    return "Paramètres invalides (id + status: todo|in_progress|done|cancelled).";
  }
  const [updated] = await db.update(tasksTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(tasksTable.id, id))
    .returning();
  return updated ? `Tâche #${id} → ${status}.` : `Tâche #${id} introuvable.`;
}

// ─── TOOL ORCHESTRATOR ───────────────────────────────────────────────────────
// Constitution : aucun outil n'est appelé directement. Tout passe par runTool →
// timeout + gestion d'erreur + observabilité (journalisation). NE PAS contourner.
const TOOL_TIMEOUT_MS: Record<string, number> = {
  execute_mission: 170_000,
  create_video: 130_000,
  generate_video: 130_000,
  generate_music: 110_000,
  generate_image: 20_000,
};

export async function runTool(name: string, args: Record<string, unknown>): Promise<string> {
  const timeout = TOOL_TIMEOUT_MS[name] ?? 30_000;
  const start = Date.now();
  let result: string;
  let ok = true;
  try {
    result = await Promise.race([
      executeTool(name, args),
      new Promise<string>((_, rej) => setTimeout(() => rej(new Error(`timeout ${timeout / 1000}s`)), timeout)),
    ]);
  } catch (err) {
    ok = false;
    result = `L'outil ${name} a échoué: ${err instanceof Error ? err.message : "erreur"}`;
  }
  // Observabilité : journalise chaque appel d'outil (jamais bloquant).
  import("../activity")
    .then(({ logActivity }) => logActivity("tool_call", name, `${ok ? "ok" : "échec"} (${Date.now() - start}ms)`, 0))
    .catch(() => {});
  return result;
}

// ─── Tool Dispatcher ────────────────────────────────────────────────────────

export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "create_task":
      return executeCreateTask(args);
    case "create_project":
      return executeCreateProject(args);
    case "create_contact":
      return executeCreateContact(args);
    case "create_decision":
      return executeCreateDecision(args);
    case "create_memory":
      return executeCreateMemory(args);
    case "search_memories":
      return executeSearchMemories(args);
    case "generate_image":
      return executeGenerateImage(args);
    case "create_video":
    case "generate_video":
      return executeCreateVideo(args);
    case "generate_music":
      return executeGenerateMusic(args);
    case "execute_mission":
      return executeMissionTool(args);
    case "list_tasks":
      return executeListTasks(args);
    case "update_task_status":
    case "complete_task":
      return executeUpdateTaskStatus(
        name === "complete_task" ? { ...args, status: "done" } : args,
      );
    case "delegate_to_agent":
      // Delegation is handled at the orchestrator level
      return `Délégation demandée à: ${args.agent}`;
    default:
      return `Outil inconnu: ${name}`;
  }
}

// ─── Context Gathering ───────────────────────────────────────────────────────

export async function gatherUserContext(): Promise<string> {
  try {
    const [tasks, projects, contacts, memories, decisions] = await Promise.all([
      db.select().from(tasksTable)
        .where(sql`${tasksTable.status} NOT IN ('done','cancelled')`)
        .orderBy(desc(tasksTable.createdAt))
        .limit(5),
      db.select().from(projectsTable)
        .where(eq(projectsTable.status, "active"))
        .limit(5),
      db.select().from(contactsTable)
        .orderBy(desc(contactsTable.createdAt))
        .limit(5),
      db.select().from(memoriesTable)
        .orderBy(desc(memoriesTable.createdAt))
        .limit(5),
      db.select().from(decisionsTable)
        .where(sql`${decisionsTable.status} IN ('pending','analyzing')`)
        .limit(3),
    ]);

    return [
      tasks.length > 0 ? `Tâches actives: ${tasks.map(t => `"${t.title}" (${t.priority})`).join(", ")}` : "",
      projects.length > 0 ? `Projets actifs: ${projects.map(p => `"${p.name}"`).join(", ")}` : "",
      contacts.length > 0 ? `Contacts récents: ${contacts.map(c => c.name).join(", ")}` : "",
      memories.length > 0 ? `Mémoires récentes: ${memories.map(m => `"${m.title}"`).join(", ")}` : "",
      decisions.length > 0 ? `Décisions en cours: ${decisions.map(d => `"${d.title}"`).join(", ")}` : "",
    ].filter(Boolean).join("\n");
  } catch {
    return "Contexte non disponible.";
  }
}

// ─── Agent Selection ────────────────────────────────────────────────────────

interface AgentSelection {
  agent: Agent;
  confidence: number;
  reason: string;
}

export function selectAgentForQuery(query: string, _context: AgentContext): AgentSelection {
  const q = query.toLowerCase();

  // Keywords for each agent
  const agentKeywords: Record<AgentRole, { keywords: string[]; weight: number }> = {
    chief_of_staff: { keywords: ["résumé", "briefing", "priorité", "global", "situation", "rapport", "journée"], weight: 1 },
    engineering: { keywords: ["code", "bug", "architecture", "technique", "erreur", "performance", "sécurité", "deploy", "api"], weight: 1.2 },
    product: { keywords: ["feature", "roadmap", "produit", "user", "ux", "prioriser", "mvp", "user story"], weight: 1.2 },
    business: { keywords: ["business", "client", "chiffre", "ca", "stratégie", "partenariat", "contrat", "négociation"], weight: 1.2 },
    marketing: { keywords: ["marketing", "content", "linkedin", "post", "article", "brand", "positionnement", "message"], weight: 1.2 },
    research: { keywords: ["recherche", "trouver", "analyser", "comparer", "source", "étude", "marché", "concurrent"], weight: 1.1 },
    memory: { keywords: ["souviens", "rappelle", "mémorise", "sauvegarde", "retenir", "oublié", "mémoire"], weight: 1.3 },
    decision: { keywords: ["décider", "décision", "choisir", "options", "avantages", "inconvénients", "pour ou contre"], weight: 1.3 },
    studio: { keywords: ["génère", "crée", "image", "audio", "vidéo", "design", "visuel", "poster", "logo"], weight: 1.2 },
    devops: { keywords: ["déploie", "railway", "supabase", "server", "base de données", "migration", "infrastructure"], weight: 1.2 },
    red_team: { keywords: ["critique", "problème", "risque", "faille", "attack", "challenge", "contre-argument"], weight: 1.1 },
    planning: { keywords: ["plan", "objectif", "tâches", "étapes", "décomposer", "organiser", "planning", "roadmap"], weight: 1.2 },
    architect: { keywords: ["architecture", "constitution", "contrainte", "doublon", "dette", "validation"], weight: 1.3 },
    qa: { keywords: ["test", "qualité", "régression", "bug", "vérifie", "checklist", "smoke"], weight: 1.2 },
    security: { keywords: ["sécurité", "permission", "audit", "vulnérabilité", "rls", "cors", "porte humaine"], weight: 1.3 },
    reflection: { keywords: ["réflexion", "apprentissage", "amélioration", "cause racine", "pattern", "post-mortem"], weight: 1.1 },
  };

  let bestMatch: AgentSelection = {
    agent: getAgent("chief_of_staff")!,
    confidence: 0.5,
    reason: "Agent par défaut pour requêtes générales",
  };

  for (const [role, config] of Object.entries(agentKeywords)) {
    const matches = config.keywords.filter((kw: string) => q.includes(kw));
    if (matches.length > 0) {
      const score = matches.length * config.weight;
      if (score > bestMatch.confidence) {
        bestMatch = {
          agent: getAgent(role as AgentRole)!,
          confidence: score,
          reason: `Mots-clés détectés: ${matches.join(", ")}`,
        };
      }
    }
  }

  return bestMatch;
}

// ─── Tool Definitions for OpenAI Function Calling ───────────────────────────

export function getToolsForAgent(agent: Agent): any[] {
  return agent.tools.map(tool => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export function getAllTools(): any[] {
  const allTools = new Map<string, any>();
  for (const agent of getAllAgents()) {
    for (const tool of agent.tools) {
      if (!allTools.has(tool.name)) {
        allTools.set(tool.name, {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        });
      }
    }
  }
  return Array.from(allTools.values());
}

// ─── Agent Execution ────────────────────────────────────────────────────────

function getTaskTypeForAgent(role: AgentRole): AICapability {
  const mapping: Record<AgentRole, AICapability> = {
    chief_of_staff: "analysis",
    engineering: "code",
    product: "reasoning",
    business: "reasoning",
    marketing: "creative",
    research: "analysis",
    memory: "analysis",
    decision: "reasoning",
    studio: "creative",
    devops: "code",
    red_team: "analysis",
    planning: "reasoning",
    architect: "reasoning",
    qa: "analysis",
    security: "analysis",
    reflection: "analysis",
  };
  return mapping[role] || "fast_chat";
}

export async function runAgent(
  agent: Agent,
  userMessage: string,
  history: Array<{ role: string; content: string }> = [],
  _context: AgentContext = {}
): Promise<AgentResponse> {
  const userContext = await gatherUserContext();
  const taskType = getTaskTypeForAgent(agent.role);

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: `${agent.systemPrompt}\n\nContexte actuel:\n${userContext}` },
    ...history as Array<{ role: "system" | "user" | "assistant"; content: string }>,
    { role: "user", content: userMessage },
  ];

  const startTime = Date.now();

  try {
    const result = await smartCompletion(taskType, messages, {
      maxTokens: 1200,
      needsTools: true,
      tools: getToolsForAgent(agent),
    });

    // For now, return the content - tool calling integration would be done via streaming
    recordAIMetric({
      timestamp: new Date(),
      model: result.model,
      provider: "replit",
      taskType: agent.role,
      latencyMs: result.latencyMs,
      success: true,
    });

    return {
      content: result.content || agent.fallbackResponse,
      toolCalls: [],
    };
  } catch (err) {
    console.error("Agent execution failed:", err);
    recordAIMetric({
      timestamp: new Date(),
      model: "unknown",
      provider: "replit",
      taskType: agent.role,
      latencyMs: Date.now() - startTime,
      success: false,
      errorCode: err instanceof Error ? err.message : "Unknown error",
    });
    return {
      content: agent.fallbackResponse,
      toolCalls: [],
    };
  }
}

export { getAgent, getAllAgents };
