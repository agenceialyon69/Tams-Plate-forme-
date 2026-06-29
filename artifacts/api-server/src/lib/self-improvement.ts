/**
 * Self-Improvement Engine
 *
 * Continuously monitors system health and proposes improvements:
 * - Detects unused agents/tools
 * - Flags stale data
 * - Identifies performance issues
 * - Tracks AI error rates
 * - Monitors decision outcomes
 */

import { db } from "@workspace/db";
import {
  tasksTable,
  projectsTable,
  contactsTable,
  decisionsTable,
  memoriesTable,
  activityTable,
  conversationsTable,
} from "@workspace/db";
import { sql, desc, gte, and, lt } from "drizzle-orm";
import { getAIMetricsSummary, getToolMetricsSummary, getSystemHealth } from "./observability";
import { logger } from "./logger";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ImprovementSuggestion {
  type: "stale_data" | "unused_feature" | "performance" | "high_error_rate" | "decision_outcome" | "workflow_optimization";
  severity: "low" | "medium" | "high";
  title: string;
  description: string;
  affectedEntity?: string;
  suggestedAction: string;
  data: Record<string, unknown>;
}

export interface SystemAnalysis {
  health: {
    status: "healthy" | "degraded" | "unhealthy";
    checks: Record<string, boolean>;
  };
  staleData: {
    staleTasks: number;
    staleContacts: number;
    staleDecisions: number;
  };
  unusedFeatures: {
    unusedAgents: string[];
    unusedTools: string[];
    emptyProjects: number;
  };
  performance: {
    avgLatencyMs: number;
    errorRate: number;
    slowOperations: string[];
  };
  decisions: {
    total: number;
    decided: number;
    pending: number;
    archived: number;
    averageConfidence: number;
  };
  suggestions: ImprovementSuggestion[];
}

// ─── Analysis Functions ────────────────────────────────────────────────────────

async function analyzeStaleData(): Promise<{
  staleTasks: number;
  staleContacts: number;
  staleDecisions: number;
}> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const staleTasks = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(tasksTable)
    .where(and(
      sql`${tasksTable.status} NOT IN ('done','cancelled')`,
      lt(tasksTable.updatedAt, thirtyDaysAgo)
    ));

  const staleContacts = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(contactsTable)
    .where(sql`${contactsTable.lastContactedAt} IS NULL OR ${contactsTable.lastContactedAt} < NOW() - INTERVAL '30 days'`);

  const staleDecisions = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(decisionsTable)
    .where(and(
      sql`${decisionsTable.status} = 'pending'`,
      lt(decisionsTable.updatedAt, thirtyDaysAgo)
    ));

  return {
    staleTasks: Number(staleTasks[0]?.count ?? 0),
    staleContacts: Number(staleContacts[0]?.count ?? 0),
    staleDecisions: Number(staleDecisions[0]?.count ?? 0),
  };
}

async function analyzeUnusedFeatures(): Promise<{
  unusedAgents: string[];
  unusedTools: string[];
  emptyProjects: number;
}> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Check which conversation modes have been used
  const usedModes = await db
    .selectDistinct({ mode: conversationsTable.mode })
    .from(conversationsTable)
    .where(gte(conversationsTable.updatedAt, sevenDaysAgo));

  const allModes = ["chat", "chief_of_staff", "decision", "red_team", "execution"];
  const usedModeSet = new Set(usedModes.map(m => m.mode));
  const unusedAgents = allModes.filter(m => !usedModeSet.has(m as any));

  // Check for empty projects (no tasks)
  const emptyProjects = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(projectsTable)
    .where(sql`NOT EXISTS (SELECT 1 FROM ${tasksTable} WHERE ${tasksTable.projectId} = ${projectsTable.id})`);

  // Get tool usage from metrics
  const toolMetrics = await getToolMetricsSummary(sevenDaysAgo);
  const allTools = [
    "create_task", "list_tasks", "update_task",
    "create_project", "list_projects",
    "create_contact", "list_contacts",
    "create_memory", "search_memories",
    "create_decision", "list_decisions",
    "create_asset", "create_memory_edge", "list_memory_edges", "get_briefing",
  ];
  const usedTools = new Set(Object.keys(toolMetrics.byTool));
  const unusedTools = allTools.filter(t => !usedTools.has(t));

  return {
    unusedAgents,
    unusedTools,
    emptyProjects: Number(emptyProjects[0]?.count ?? 0),
  };
}

async function analyzeDecisions(): Promise<{
  total: number;
  decided: number;
  pending: number;
  archived: number;
  averageConfidence: number;
}> {
  const total = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(decisionsTable);

  const decided = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(decisionsTable)
    .where(sql`${decisionsTable.status} = 'decided'`);

  const pending = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(decisionsTable)
    .where(sql`${decisionsTable.status} IN ('pending','analyzing')`);

  const archived = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(decisionsTable)
    .where(sql`${decisionsTable.status} = 'archived'`);

  const avgConfidence = await db
    .select({ avg: sql<number>`AVG(${decisionsTable.confidenceScore})` })
    .from(decisionsTable)
    .where(sql`${decisionsTable.status} = 'decided'`);

  return {
    total: Number(total[0]?.count ?? 0),
    decided: Number(decided[0]?.count ?? 0),
    pending: Number(pending[0]?.count ?? 0),
    archived: Number(archived[0]?.count ?? 0),
    averageConfidence: Number(avgConfidence[0]?.avg ?? 50),
  };
}

// ─── Suggestion Generation ────────────────────────────────────────────────────

async function generateSuggestions(
  staleData: Awaited<ReturnType<typeof analyzeStaleData>>,
  unusedFeatures: Awaited<ReturnType<typeof analyzeUnusedFeatures>>,
  performance: Awaited<ReturnType<typeof getAIMetricsSummary>>,
  decisions: Awaited<ReturnType<typeof analyzeDecisions>>
): Promise<ImprovementSuggestion[]> {
  const suggestions: ImprovementSuggestion[] = [];

  // Stale data suggestions
  if (staleData.staleTasks > 5) {
    suggestions.push({
      type: "stale_data",
      severity: "medium",
      title: "Tâches obsolètes détectées",
      description: `${staleData.staleTasks} tâches n'ont pas été mises à jour depuis 30+ jours`,
      suggestedAction: "Archiver ou mettre à jour ces tâches",
      data: { count: staleData.staleTasks },
    });
  }

  if (staleData.staleContacts > 3) {
    suggestions.push({
      type: "stale_data",
      severity: "high",
      title: "Contacts froids",
      description: `${staleData.staleContacts} contacts sans interaction depuis 30+ jours`,
      suggestedAction: "Planifier des relances ou archiver",
      data: { count: staleData.staleContacts },
    });
  }

  if (staleData.staleDecisions > 0) {
    suggestions.push({
      type: "stale_data",
      severity: "high",
      title: "Décisions en suspens",
      description: `${staleData.staleDecisions} décisions en attente depuis 30+ jours`,
      suggestedAction: "Finaliser ces décisions ou les archiver",
      data: { count: staleData.staleDecisions },
    });
  }

  // Unused features suggestions
  if (unusedFeatures.unusedAgents.length > 0) {
    suggestions.push({
      type: "unused_feature",
      severity: "low",
      title: "Agents non utilisés",
      description: `Modes de conversation non utilisés cette semaine: ${unusedFeatures.unusedAgents.join(", ")}`,
      suggestedAction: "Considérer si ces agents sont nécessaires ou mieux les documenter",
      data: { agents: unusedFeatures.unusedAgents },
    });
  }

  if (unusedFeatures.emptyProjects > 0) {
    suggestions.push({
      type: "unused_feature",
      severity: "medium",
      title: "Projets vides",
      description: `${unusedFeatures.emptyProjects} projet(s) sans aucune tâche`,
      suggestedAction: "Archiver ou structurer ces projets avec des tâches",
      data: { count: unusedFeatures.emptyProjects },
    });
  }

  // Performance suggestions
  if (performance.avgLatencyMs > 2000) {
    suggestions.push({
      type: "performance",
      severity: "medium",
      title: "Latence IA élevée",
      description: `Latence moyenne de ${Math.round(performance.avgLatencyMs)}ms`,
      suggestedAction: "Considérer des modèles plus rapides ou optimiser les prompts",
      data: { avgLatencyMs: performance.avgLatencyMs },
    });
  }

  if (performance.successRate < 0.9) {
    suggestions.push({
      type: "high_error_rate",
      severity: "high",
      title: "Taux d'erreur IA élevé",
      description: `Taux de succès: ${Math.round(performance.successRate * 100)}%`,
      suggestedAction: "Vérifier les providers IA, les clés API et les fallbacks",
      data: { successRate: performance.successRate },
    });
  }

  // Decision outcome suggestions
  if (decisions.pending > 5) {
    suggestions.push({
      type: "decision_outcome",
      severity: "medium",
      title: "Trop de décisions en attente",
      description: `${decisions.pending} décisions non résolues`,
      suggestedAction: "Prioriser et finaliser les décisions importantes",
      data: { pending: decisions.pending },
    });
  }

  if (decisions.averageConfidence < 60 && decisions.decided > 0) {
    suggestions.push({
      type: "decision_outcome",
      severity: "low",
      title: "Confiance moyenne basse",
      description: `Score de confiance moyen: ${decisions.averageConfidence}/100`,
      suggestedAction: "Améliorer le contexte des décisions futures",
      data: { averageConfidence: decisions.averageConfidence },
    });
  }

  return suggestions;
}

// ─── Main Analysis Function ──────────────────────────────────────────────────

export async function analyzeSystem(): Promise<SystemAnalysis> {
  logger.info("Running self-improvement analysis...");

  const [health, staleData, unusedFeatures, aiMetrics, decisions] = await Promise.all([
    getSystemHealth(),
    analyzeStaleData(),
    analyzeUnusedFeatures(),
    getAIMetricsSummary(),
    analyzeDecisions(),
  ]);

  const suggestions = await generateSuggestions(staleData, unusedFeatures, aiMetrics, decisions);

  const analysis: SystemAnalysis = {
    health: {
      status: health.status,
      checks: {
        database: health.checks.database,
        ai_gateway: health.checks.ai_gateway,
        memory: health.checks.memory,
      },
    },
    staleData,
    unusedFeatures,
    performance: {
      avgLatencyMs: health.metrics.avgLatencyLastHour,
      errorRate: health.metrics.errorRateLastHour,
      slowOperations: aiMetrics.avgLatencyMs > 2000 ? ["ai_completion"] : [],
    },
    decisions,
    suggestions,
  };

  logger.info({ suggestionCount: suggestions.length }, "Self-improvement analysis complete");

  return analysis;
}

// ─── Activity Helpers ────────────────────────────────────────────────────────

export async function getSystemActivitySummary(days: number = 7): Promise<{
  totalActivity: number;
  byType: Record<string, number>;
  recentAlerts: string[];
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const activity = await db
    .select({
      type: activityTable.type,
      count: sql<number>`COUNT(*)`,
    })
    .from(activityTable)
    .where(gte(activityTable.createdAt, since))
    .groupBy(activityTable.type);

  const totalActivity = activity.reduce((sum, a) => sum + Number(a.count), 0);
  const byType = Object.fromEntries(activity.map(a => [a.type, Number(a.count)]));

  // Get recent critical activities
  const recentCritical = await db
    .select()
    .from(activityTable)
    .where(gte(activityTable.createdAt, since))
    .orderBy(desc(activityTable.createdAt))
    .limit(10);

  const recentAlerts = recentCritical
    .filter(a => a.type === "decision" || a.description?.toLowerCase().includes("error"))
    .map(a => `[${a.type}] ${a.title}`);

  return {
    totalActivity,
    byType,
    recentAlerts,
  };
}
