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
