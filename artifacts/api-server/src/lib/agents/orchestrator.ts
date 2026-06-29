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
  briefingsTable,
  projectContactsTable,
} from "@workspace/db";
import { eq, sql, desc, or, and, ilike, count } from "drizzle-orm";
import { aiChat } from "../ai";
import { logActivity } from "../activity";

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

async function executeSearchMemories(query: string, limit = 5): Promise<{ title: string; content: string | null; type: string }[]> {
  const results = await db.select()
    .from(memoriesTable)
    .where(
      or(
        ilike(memoriesTable.title, `%${query}%`),
        ilike(memoriesTable.content, `%${query}%`)
      )
    )
    .limit(limit);

  return results.map(m => ({ title: m.title, content: m.content, type: m.type }));
}

async function executeSearchMemoriesTool(args: Record<string, unknown>): Promise<string> {
  const query = String(args.query);
  const limit = Number(args.limit) || 5;
  const results = await executeSearchMemories(query, limit);

  if (results.length === 0) {
    return `Aucune mémoire trouvée pour: "${query}"`;
  }

  return `Mémoires trouvées (${results.length}):\n${results.map(m => `- ${m.title}: ${m.content?.slice(0, 100) || "pas de contenu"}`).join("\n")}`;
}

// ─── New Tools ───────────────────────────────────────────────────────────────

async function executeGetBriefing(): Promise<string> {
  const today = new Date().toISOString().split("T")[0];
  const existing = await db
    .select()
    .from(briefingsTable)
    .where(eq(briefingsTable.date, today))
    .limit(1);

  if (existing.length > 0) {
    const b = existing[0] as any;
    return `Briefing du jour (${b.date}):\n- Priorités: ${(b.priorities as any[]).map((p: any) => p.label).join(", ")}\n- Risques: ${(b.risks as any[]).map((r: any) => r.label).join(", ")}\n- Opportunités: ${(b.opportunities as any[]).map((o: any) => o.label).join(", ")}\n- Recommandations: ${(b.recommendations as any[]).map((r: any) => r.label).join(", ")}`;
  }

  // Call internal briefing generation via fetch to own endpoint (simulate)
  return "Briefing du jour non généré encore. Demande à l'utilisateur de visiter /api/briefing/today.";
}

async function executeUpdateTaskStatus(args: Record<string, unknown>): Promise<string> {
  const taskId = Number(args.task_id);
  const newStatus = String(args.status) as "todo" | "in_progress" | "done" | "cancelled";

  const existing = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId)).limit(1);
  if (existing.length === 0) {
    return `Tâche introuvable (ID: ${taskId})`;
  }

  await db.update(tasksTable)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(tasksTable.id, taskId));

  return `Tâche "${existing[0].title}" mise à jour: ${existing[0].status} → ${newStatus}`;
}

async function executeCreateProjectContact(args: Record<string, unknown>): Promise<string> {
  const projectId = Number(args.project_id);
  const contactId = Number(args.contact_id);
  const role = args.role ? String(args.role) : null;

  const [created] = await db.insert(projectContactsTable).values({
    projectId,
    contactId,
    role,
  }).returning();

  return `Contact lié au projet (ID liaison: ${created.id})`;
}

// In-memory reminders (no DB table yet; stored locally)
const localReminders: Array<{ id: number; title: string; scheduledAt: string; createdAt: Date }> = [];
let reminderIdCounter = 1;

async function executeScheduleReminder(args: Record<string, unknown>): Promise<string> {
  const title = String(args.title);
  const scheduledAt = String(args.scheduled_at); // ISO string expected
  const id = reminderIdCounter++;
  localReminders.push({ id, title, scheduledAt, createdAt: new Date() });
  return `Rappel programmé: "${title}" pour ${scheduledAt}`;
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
      return executeSearchMemoriesTool(args);
    case "get_briefing":
      return executeGetBriefing();
    case "update_task_status":
      return executeUpdateTaskStatus(args);
    case "create_project_contact":
      return executeCreateProjectContact(args);
    case "schedule_reminder":
      return executeScheduleReminder(args);
    case "delegate_to_agent":
      // Delegation is handled at the orchestrator level
      return `Délégation demandée à: ${args.agent}`;
    default:
      return `Outil inconnu: ${name}`;
  }
}

// ─── Context Gathering ───────────────────────────────────────────────────────

export async function gatherUserContext(userQuery?: string): Promise<string> {
  try {
    // --- Semantic memory search (if query provided) ---
    let relevantMemories: { title: string; content: string | null; type: string }[] = [];
    if (userQuery && userQuery.trim().length > 0) {
      relevantMemories = await executeSearchMemories(userQuery.trim(), 3);
    }

    // --- Fetch all context data in parallel ---
    const [
      urgentTasks,
      activeTasks,
      projects,
      contacts,
      recentMemories,
      pendingDecisions,
      recentDecisions,
    ] = await Promise.all([
      // Urgent tasks (high/urgent, not done)
      db.select().from(tasksTable)
        .where(and(
          sql`${tasksTable.status} NOT IN ('done','cancelled')`,
          sql`${tasksTable.priority} IN ('urgent','high')`
        ))
        .orderBy(desc(tasksTable.createdAt))
        .limit(10),
      // Active tasks (not done)
      db.select().from(tasksTable)
        .where(sql`${tasksTable.status} NOT IN ('done','cancelled')`)
        .orderBy(desc(tasksTable.createdAt))
        .limit(10),
      // Active projects
      db.select().from(projectsTable)
        .where(eq(projectsTable.status, "active"))
        .orderBy(desc(projectsTable.createdAt))
        .limit(10),
      // Recently interacted contacts
      db.select().from(contactsTable)
        .orderBy(desc(contactsTable.lastContactedAt))
        .limit(10),
      // Recent memories (fallback if no semantic search)
      db.select().from(memoriesTable)
        .orderBy(desc(memoriesTable.createdAt))
        .limit(5),
      // Pending decisions
      db.select().from(decisionsTable)
        .where(sql`${decisionsTable.status} IN ('pending','analyzing')`)
        .orderBy(desc(decisionsTable.createdAt))
        .limit(10),
      // Recent decided decisions
      db.select().from(decisionsTable)
        .where(sql`${decisionsTable.status} IN ('decided','archived')`)
        .orderBy(desc(decisionsTable.createdAt))
        .limit(5),
    ]);

    // --- Calculate project progress ---
    const projectProgress: { id: number; name: string; progress: number }[] = [];
    for (const p of projects) {
      const total = await db.select({ count: count() }).from(tasksTable).where(eq(tasksTable.projectId, p.id));
      const done = await db.select({ count: count() }).from(tasksTable).where(
        and(eq(tasksTable.projectId, p.id), eq(tasksTable.status, "done"))
      );
      const totalCount = Number(total[0]?.count ?? 0);
      const progress = totalCount > 0 ? Math.round((Number(done[0]?.count ?? 0) / totalCount) * 100) : 0;
      projectProgress.push({ id: p.id, name: p.name, progress });
    }

    // --- Build structured markdown context ---
    const lines: string[] = [];

    lines.push("# Contexte utilisateur");
    lines.push("");

    // Relevant memories (semantic search)
    if (relevantMemories.length > 0) {
      lines.push("## Mémoires pertinentes");
      relevantMemories.forEach(m => {
        lines.push(`- **${m.title}** (${m.type})${m.content ? `: ${m.content.slice(0, 120)}...` : ""}`);
      });
      lines.push("");
    }

    // Tasks
    if (urgentTasks.length > 0) {
      lines.push(`## Tâches urgentes (${urgentTasks.length})`);
      urgentTasks.forEach(t => lines.push(`- ${t.title} — priorité **${t.priority}**`));
      lines.push("");
    }
    if (activeTasks.length > 0) {
      const nonUrgent = activeTasks.filter(t => !urgentTasks.some(u => u.id === t.id));
      if (nonUrgent.length > 0) {
        lines.push(`## Tâches actives (${nonUrgent.length})`);
        nonUrgent.forEach(t => lines.push(`- ${t.title} (${t.status})`));
        lines.push("");
      }
    }

    // Projects with progress
    if (projectProgress.length > 0) {
      lines.push(`## Projets actifs (${projectProgress.length})`);
      projectProgress.forEach(p => {
        lines.push(`- **${p.name}** — progression ${p.progress}%`);
      });
      lines.push("");
    }

    // Contacts
    if (contacts.length > 0) {
      lines.push(`## Contacts récemment interactés (${contacts.length})`);
      contacts.forEach(c => {
        const last = c.lastContactedAt ? new Date(c.lastContactedAt).toLocaleDateString("fr-FR") : "jamais";
        lines.push(`- **${c.name}** (${c.company || "n/a"}) — dernier contact: ${last}`);
      });
      lines.push("");
    }

    // Decisions
    if (pendingDecisions.length > 0) {
      lines.push(`## Décisions en attente (${pendingDecisions.length})`);
      pendingDecisions.forEach(d => lines.push(`- **${d.title}** — statut: ${d.status}`));
      lines.push("");
    }
    if (recentDecisions.length > 0) {
      lines.push(`## Décisions récentes (${recentDecisions.length})`);
      recentDecisions.forEach(d => lines.push(`- **${d.title}** — statut: ${d.status}`));
      lines.push("");
    }

    // Fallback memories if no semantic results
    if (relevantMemories.length === 0 && recentMemories.length > 0) {
      lines.push(`## Mémoires récentes (${recentMemories.length})`);
      recentMemories.forEach(m => lines.push(`- **${m.title}**: ${m.content?.slice(0, 100) ?? ""}...`));
      lines.push("");
    }

    return lines.join("\n");
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

export async function runAgent(
  agent: Agent,
  userMessage: string,
  history: Array<{ role: string; content: string }> = [],
  _context: AgentContext = {}
): Promise<AgentResponse> {
  const userContext = await gatherUserContext(userMessage);

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: `${agent.systemPrompt}\n\nContexte actuel:\n${userContext}` },
    ...history as Array<{ role: "system" | "user" | "assistant"; content: string }>,
    { role: "user", content: userMessage },
  ];

  try {
    const completion = await aiChat({
      model: "google/gemini-2.5-flash",
      messages,
      max_tokens: 1200,
      tools: getToolsForAgent(agent),
    });

    const choice = completion.choices?.[0];
    const toolCalls: AgentResponse["toolCalls"] = [];

    // Execute tool calls
    if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
      for (const tc of choice.message.tool_calls) {
        if (tc.type !== "function") continue;
        const fnName = tc.function.name;
        let fnArgs: Record<string, unknown>;
        try {
          fnArgs = JSON.parse(tc.function.arguments);
        } catch {
          fnArgs = {};
        }
        const result = await executeTool(fnName, fnArgs);
        toolCalls.push({ name: fnName, args: fnArgs, result });
      }

      // Get follow-up response after tools
      const followUpMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        ...messages,
        { role: "assistant", content: choice.message.content || "" },
        { role: "system", content: `Actions effectuées:\n${toolCalls.map(t => `- ${t.name}: ${t.result}`).join("\n")}\n\nRésume ce qui a été fait de manière naturelle.` },
      ];

      const followUp = await aiChat({
        model: "google/gemini-2.5-flash",
        messages: followUpMessages,
        max_tokens: 800,
      });

      return {
        content: followUp.choices?.[0]?.message?.content || agent.fallbackResponse,
        toolCalls,
      };
    }

    return {
      content: choice?.message?.content || agent.fallbackResponse,
      toolCalls: [],
    };
  } catch (err) {
    console.error("Agent execution failed:", err);
    return {
      content: agent.fallbackResponse,
      toolCalls: [],
    };
  }
}
