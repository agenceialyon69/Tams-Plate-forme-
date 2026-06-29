import { Router } from "express";
import { db } from "@workspace/db";
import {
  briefingsTable,
  tasksTable,
  projectsTable,
  contactsTable,
  decisionsTable,
  memoriesTable,
} from "@workspace/db";
import { eq, and, lte, sql, isNotNull, desc } from "drizzle-orm";
import { smartCompletion } from "../lib/ai-router";
import { recordAIMetric } from "../lib/observability";

const router = Router();

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bonjour Mohamed";
  if (hour < 18) return "Bon après-midi Mohamed";
  return "Bonsoir Mohamed";
}

interface BriefingItem {
  label: string;
  description: string;
  urgency: "high" | "medium" | "low";
}

interface BriefingData {
  priorities: BriefingItem[];
  risks: BriefingItem[];
  opportunities: BriefingItem[];
  recommendations: BriefingItem[];
}

interface BriefingContext {
  urgentTasks: { id: number; title: string; priority: string; dueDate: string | null; projectId: number | null }[];
  overdueTasks: { id: number; title: string; priority: string; dueDate: string | null }[];
  activeProjects: { id: number; name: string; description: string | null }[];
  staleContacts: { id: number; name: string; company: string | null; status: string; lastContactedAt: string | null }[];
  pendingDecisions: { id: number; title: string; status: string }[];
  recentMemories: { id: number; title: string; type: string }[];
  pendingTasksCount: number;
  activeProjectsCount: number;
}

async function gatherContext(): Promise<BriefingContext> {
  const today = new Date().toISOString().split("T")[0];

  const urgentTasks = await db
    .select()
    .from(tasksTable)
    .where(
      and(
        sql`${tasksTable.status} NOT IN ('done','cancelled')`,
        sql`${tasksTable.priority} IN ('urgent','high')`,
      ),
    )
    .limit(10);

  const overdueTasks = await db
    .select()
    .from(tasksTable)
    .where(
      and(
        sql`${tasksTable.status} NOT IN ('done','cancelled')`,
        isNotNull(tasksTable.dueDate),
        lte(tasksTable.dueDate, today),
      ),
    )
    .limit(10);

  const activeProjects = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.status, "active"))
    .limit(20);

  const staleContacts = await db
    .select()
    .from(contactsTable)
    .where(
      and(
        sql`${contactsTable.status} IN ('prospect','active')`,
        sql`${contactsTable.lastContactedAt} IS NULL OR ${contactsTable.lastContactedAt} < NOW() - INTERVAL '14 days'`,
      ),
    )
    .limit(10);

  const pendingDecisions = await db
    .select()
    .from(decisionsTable)
    .where(sql`${decisionsTable.status} IN ('pending','analyzing')`)
    .limit(10);

  const recentMemories = await db
    .select()
    .from(memoriesTable)
    .orderBy(desc(memoriesTable.createdAt))
    .limit(5);

  const pendingCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(tasksTable)
    .where(sql`${tasksTable.status} NOT IN ('done','cancelled')`);

  const activeCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(projectsTable)
    .where(eq(projectsTable.status, "active"));

  return {
    urgentTasks: urgentTasks.map(t => ({ id: t.id, title: t.title, priority: t.priority, dueDate: t.dueDate, projectId: t.projectId })),
    overdueTasks: overdueTasks.map(t => ({ id: t.id, title: t.title, priority: t.priority, dueDate: t.dueDate })),
    activeProjects: activeProjects.map(p => ({ id: p.id, name: p.name, description: p.description })),
    staleContacts: staleContacts.map(c => ({ id: c.id, name: c.name, company: c.company, status: c.status as string, lastContactedAt: c.lastContactedAt?.toISOString() ?? null })),
    pendingDecisions: pendingDecisions.map(d => ({ id: d.id, title: d.title, status: d.status })),
    recentMemories: recentMemories.map(m => ({ id: m.id, title: m.title, type: m.type })),
    pendingTasksCount: Number(pendingCount[0]?.count ?? 0),
    activeProjectsCount: Number(activeCount[0]?.count ?? 0),
  };
}

function buildContextPrompt(ctx: BriefingContext): string {
  return `Tu es le Chief of Staff IA de Mohamed, consultant indépendant. Analyse les données réelles ci-dessous et génère un briefing quotidien structuré.

RÈGLES :
- Sois direct, précis, sans langue de bois.
- Réponds en français.
- Chaque item doit avoir : label (court), description (1-2 phrases), urgency (high/medium/low).
- 2-4 priorités, 2-3 risques, 1-3 opportunités, 2-4 recommandations.
- Les recommandations doivent être actionnables et spécifiques (pas génériques).
- Base-toi sur les données réelles, pas sur des suppositions.
- Utilise les mémoires récentes pour contextualiser les recommandations.

DONNÉES DU JOUR :
- Tâches urgentes/en cours : ${JSON.stringify(ctx.urgentTasks)}
- Tâches en retard : ${JSON.stringify(ctx.overdueTasks)}
- Projets actifs : ${JSON.stringify(ctx.activeProjects)}
- Contacts stale (pas contactés depuis 14+ jours) : ${JSON.stringify(ctx.staleContacts)}
- Décisions en attente : ${JSON.stringify(ctx.pendingDecisions)}
- Mémoires récentes : ${JSON.stringify(ctx.recentMemories)}
- Total : ${ctx.pendingTasksCount} tâches en attente, ${ctx.activeProjectsCount} projets actifs

Réponds en JSON strict avec ce format :
{
  "priorities": [{ "label": "...", "description": "...", "urgency": "high|medium|low" }],
  "risks": [{ "label": "...", "description": "...", "urgency": "high|medium|low" }],
  "opportunities": [{ "label": "...", "description": "...", "urgency": "high|medium|low" }],
  "recommendations": [{ "label": "...", "description": "...", "urgency": "high|medium|low" }]
}`;
}

function fallbackBriefing(ctx: BriefingContext): BriefingData {
  const priorities: BriefingItem[] = [];
  const risks: BriefingItem[] = [];
  const opportunities: BriefingItem[] = [];
  const recommendations: BriefingItem[] = [];

  if (ctx.overdueTasks.length > 0) {
    priorities.push({
      label: "Tâches en retard",
      description: `${ctx.overdueTasks.length} tâche(s) en retard — ${ctx.overdueTasks.map(t => t.title).join(", ").slice(0, 120)}`,
      urgency: "high",
    });
  }

  if (ctx.urgentTasks.length > 0) {
    priorities.push({
      label: "Tâches urgentes",
      description: `${ctx.urgentTasks.length} tâche(s) urgente(s) — ${ctx.urgentTasks.map(t => t.title).join(", ").slice(0, 120)}`,
      urgency: "high",
    });
  }

  if (ctx.staleContacts.length > 0) {
    priorities.push({
      label: "Contacts à relancer",
      description: `${ctx.staleContacts.length} contact(s) pas relancé(s) depuis 14+ jours — ${ctx.staleContacts.map(c => c.name).join(", ").slice(0, 120)}`,
      urgency: "medium",
    });
  }

  if (ctx.pendingDecisions.length > 0) {
    priorities.push({
      label: "Décisions en attente",
      description: `${ctx.pendingDecisions.length} décision(s) à traiter — ${ctx.pendingDecisions.map(d => d.title).join(", ").slice(0, 120)}`,
      urgency: "medium",
    });
  }

  if (ctx.pendingTasksCount > 10) {
    risks.push({
      label: "Charge élevée",
      description: `${ctx.pendingTasksCount} tâches en attente sur ${ctx.activeProjectsCount} projets actifs — risque de dispersion`,
      urgency: "medium",
    });
  }

  if (ctx.staleContacts.length > 3) {
    risks.push({
      label: "Pipeline froid",
      description: `${ctx.staleContacts.length} contacts sans interaction récente — le pipeline se refroidit`,
      urgency: "high",
    });
  }

  if (ctx.overdueTasks.length > 0) {
    recommendations.push({
      label: "Action immédiate",
      description: `Traiter les ${ctx.overdueTasks.length} tâche(s) en retard en priorité`,
      urgency: "high",
    });
  }

  if (ctx.staleContacts.length > 0) {
    recommendations.push({
      label: "Relance prospection",
      description: `Contacter ${ctx.staleContacts.length} relation(s) stale aujourd'hui`,
      urgency: "medium",
    });
  }

  recommendations.push({
    label: "Revue quotidienne",
    description: "5 minutes en fin de journée pour valider l'avancement et ajuster les priorités de demain",
    urgency: "low",
  });

  if (ctx.activeProjects.length > 0) {
    opportunities.push({
      label: "Élan projet",
      description: `${ctx.activeProjectsCount} projet(s) actif(s) — maintenir le momentum`,
      urgency: "low",
    });
  }

  if (priorities.length === 0) {
    priorities.push({
      label: "Journée calme",
      description: "Aucune urgence détectée — bon moment pour avancer les projets de fond",
      urgency: "low",
    });
  }

  return { priorities, risks, opportunities, recommendations };
}

async function generateBriefing(
  ctx: BriefingContext,
  log: { warn: (obj: any, msg: string) => void },
): Promise<BriefingData> {
  const startTime = Date.now();

  try {
    const result = await smartCompletion("analysis", [
      { role: "system", content: buildContextPrompt(ctx) },
    ], {
      maxTokens: 1500,
      needsJSON: true,
    });

    recordAIMetric({
      timestamp: new Date(),
      model: result.model,
      provider: "replit",
      taskType: "briefing",
      latencyMs: result.latencyMs,
      success: true,
    });

    const raw = result.content;
    if (!raw) throw new Error("No AI response");

    const parsed = JSON.parse(raw);
    return {
      priorities: parsed.priorities ?? [],
      risks: parsed.risks ?? [],
      opportunities: parsed.opportunities ?? [],
      recommendations: parsed.recommendations ?? [],
    };
  } catch (err) {
    log.warn({ err }, "AI briefing generation failed, using rule-based fallback");
    recordAIMetric({
      timestamp: new Date(),
      model: "unknown",
      provider: "replit",
      taskType: "briefing",
      latencyMs: Date.now() - startTime,
      success: false,
      errorCode: err instanceof Error ? err.message : "Unknown error",
    });
    return fallbackBriefing(ctx);
  }
}

router.get("/briefing/today", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const existing = await db
      .select()
      .from(briefingsTable)
      .where(eq(briefingsTable.date, today))
      .limit(1);

    if (existing.length > 0) {
      return res.json(existing[0]);
    }

    const ctx = await gatherContext();
    const { priorities, risks, opportunities, recommendations } = await generateBriefing(ctx, req.log);

    const [created] = await db.insert(briefingsTable).values({
      date: today,
      greeting: getGreeting(),
      priorities,
      risks,
      opportunities,
      recommendations,
      activeProjectsCount: ctx.activeProjectsCount,
      pendingTasksCount: ctx.pendingTasksCount,
    }).returning();

    return res.json(created);
  } catch (err) {
    req.log.error({ err }, "Error getting today briefing");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/briefing/generate", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const ctx = await gatherContext();
    const { priorities, risks, opportunities, recommendations } = await generateBriefing(ctx, req.log);

    await db.delete(briefingsTable).where(eq(briefingsTable.date, today));

    const [created] = await db.insert(briefingsTable).values({
      date: today,
      greeting: getGreeting(),
      priorities,
      risks,
      opportunities,
      recommendations,
      activeProjectsCount: ctx.activeProjectsCount,
      pendingTasksCount: ctx.pendingTasksCount,
    }).returning();

    return res.json(created);
  } catch (err) {
    req.log.error({ err }, "Error generating briefing");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
