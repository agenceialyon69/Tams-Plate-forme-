import { db } from "@workspace/db";
import {
  tasksTable,
  projectsTable,
  contactsTable,
  decisionsTable,
  memoriesTable,
  briefingsTable,
  activityTable,
} from "@workspace/db";
import { eq, sql, and, lte } from "drizzle-orm";
import { suggestRelationships, autoLink } from "./relationships";
import { logActivity } from "./activity";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkflowTrigger =
  | "task_created"
  | "task_completed"
  | "project_created"
  | "contact_added"
  | "decision_created"
  | "memory_created"
  | "deadline_approaching"
  | "scheduled";

export interface WorkflowEvent {
  trigger: WorkflowTrigger;
  payload?: Record<string, unknown>;
  entityId?: number;
  entityType?: string;
}

export interface WorkflowRule {
  id: string;
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  condition: (event: WorkflowEvent) => boolean | Promise<boolean>;
  action: (event: WorkflowEvent) => void | Promise<void>;
  enabled: boolean;
  isTemporal?: boolean; // true for scheduled/time-based rules
}

export interface WorkflowExecutionLog {
  id: string;
  ruleId: string;
  ruleName: string;
  trigger: WorkflowTrigger;
  executedAt: string;
  success: boolean;
  result?: string;
  error?: string;
}

// ─── State ────────────────────────────────────────────────────────────────────

const rulesRegistry = new Map<string, WorkflowRule>();
const executionHistory: WorkflowExecutionLog[] = [];
const MAX_HISTORY = 500;

let engineRunning = false;
let engineInterval: NodeJS.Timeout | null = null;
let temporalInterval: NodeJS.Timeout | null = null;

// ─── Core Functions ───────────────────────────────────────────────────────────

export function registerWorkflowRule(rule: WorkflowRule): void {
  rulesRegistry.set(rule.id, rule);
  logger.info({ ruleId: rule.id, name: rule.name }, "Workflow rule registered");
}

export function unregisterWorkflowRule(id: string): boolean {
  return rulesRegistry.delete(id);
}

export function getWorkflowRules(): WorkflowRule[] {
  return Array.from(rulesRegistry.values());
}

export function getWorkflowRule(id: string): WorkflowRule | undefined {
  return rulesRegistry.get(id);
}

export function toggleWorkflowRule(id: string, enabled: boolean): boolean {
  const rule = rulesRegistry.get(id);
  if (!rule) return false;
  rule.enabled = enabled;
  return true;
}

export function getExecutionHistory(limit = 100): WorkflowExecutionLog[] {
  return executionHistory.slice(-limit).reverse();
}

export async function evaluateRules(event: WorkflowEvent): Promise<void> {
  const applicableRules = Array.from(rulesRegistry.values()).filter(
    (r) => r.enabled && r.trigger === event.trigger
  );

  for (const rule of applicableRules) {
    try {
      const shouldRun = await Promise.resolve(rule.condition(event));
      if (shouldRun) {
        logger.info({ ruleId: rule.id, trigger: event.trigger }, "Workflow condition met, executing action");
        await Promise.resolve(rule.action(event));
        logExecution(rule, event, true);
      }
    } catch (err) {
      logger.error({ err, ruleId: rule.id }, "Workflow action failed");
      logExecution(rule, event, false, String(err));
    }
  }
}

function logExecution(
  rule: WorkflowRule,
  event: WorkflowEvent,
  success: boolean,
  error?: string
): void {
  const log: WorkflowExecutionLog = {
    id: `${rule.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ruleId: rule.id,
    ruleName: rule.name,
    trigger: event.trigger,
    executedAt: new Date().toISOString(),
    success,
    error,
  };
  executionHistory.push(log);
  if (executionHistory.length > MAX_HISTORY) {
    executionHistory.splice(0, executionHistory.length - MAX_HISTORY);
  }
}

// ─── Temporal / Scheduled Rules Engine ────────────────────────────────────────

async function runTemporalChecks(): Promise<void> {
  const temporalRules = Array.from(rulesRegistry.values()).filter(
    (r) => r.enabled && r.isTemporal
  );

  for (const rule of temporalRules) {
    try {
      const event: WorkflowEvent = { trigger: rule.trigger };
      const shouldRun = await Promise.resolve(rule.condition(event));
      if (shouldRun) {
        logger.info({ ruleId: rule.id }, "Temporal workflow condition met, executing action");
        await Promise.resolve(rule.action(event));
        logExecution(rule, event, true);
      }
    } catch (err) {
      logger.error({ err, ruleId: rule.id }, "Temporal workflow action failed");
      logExecution(rule, { trigger: rule.trigger }, false, String(err));
    }
  }
}

// ─── Engine Lifecycle ─────────────────────────────────────────────────────────

export function runWorkflowEngine(): void {
  if (engineRunning) return;
  engineRunning = true;

  // Register default rules if not already present
  registerDefaultRules();

  // Temporal polling every 60 seconds
  temporalInterval = setInterval(() => {
    runTemporalChecks().catch((err) => logger.error({ err }, "Temporal check error"));
  }, 60_000);

  logger.info("Workflow engine started");
}

export function stopWorkflowEngine(): void {
  engineRunning = false;
  if (temporalInterval) {
    clearInterval(temporalInterval);
    temporalInterval = null;
  }
  logger.info("Workflow engine stopped");
}

export function isWorkflowEngineRunning(): boolean {
  return engineRunning;
}

// ─── Manual Rule Execution ────────────────────────────────────────────────────

export async function executeRuleManually(ruleId: string): Promise<{ success: boolean; message: string }> {
  const rule = rulesRegistry.get(ruleId);
  if (!rule) return { success: false, message: "Rule not found" };

  try {
    const event: WorkflowEvent = { trigger: rule.trigger };
    await Promise.resolve(rule.action(event));
    logExecution(rule, event, true);
    return { success: true, message: `Rule "${rule.name}" executed successfully` };
  } catch (err) {
    logExecution(rule, { trigger: rule.trigger }, false, String(err));
    return { success: false, message: String(err) };
  }
}

// ─── Default Rules ────────────────────────────────────────────────────────────

function registerDefaultRules(): void {
  if (rulesRegistry.has("auto_archive_tasks")) return; // Already registered

  // 1. Auto-archive tasks: done > 30 days → archive
  registerWorkflowRule({
    id: "auto_archive_tasks",
    name: "Auto-archive tasks",
    description: "Archive les tâches terminées depuis plus de 30 jours",
    trigger: "scheduled",
    isTemporal: true,
    enabled: true,
    condition: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const [count] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(tasksTable)
        .where(
          and(
            eq(tasksTable.status, "done"),
            lte(tasksTable.updatedAt, thirtyDaysAgo)
          )
        );
      return (count?.count ?? 0) > 0;
    },
    action: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const staleTasks = await db
        .select()
        .from(tasksTable)
        .where(
          and(
            eq(tasksTable.status, "done"),
            lte(tasksTable.updatedAt, thirtyDaysAgo)
          )
        );
      for (const task of staleTasks) {
        await db
          .update(tasksTable)
          .set({ status: "cancelled" as any, updatedAt: new Date() })
          .where(eq(tasksTable.id, task.id));
        await logActivity("task", "Auto-archivage", `Tâche "${task.title}" archivée automatiquement`, task.id);
      }
      logger.info({ count: staleTasks.length }, "Auto-archived old completed tasks");
    },
  });

  // 2. Project progress alert: < 20% done and > 50% time elapsed
  registerWorkflowRule({
    id: "project_progress_alert",
    name: "Project progress alert",
    description: "Alerte quand un projet a < 20% de tâches done et > 50% du temps écoulé",
    trigger: "deadline_approaching",
    isTemporal: true,
    enabled: true,
    condition: async () => {
      const projects = await db.select().from(projectsTable).where(eq(projectsTable.status, "active"));
      for (const project of projects) {
        const taskCounts = await db
          .select({
            total: sql<number>`COUNT(*)`,
            done: sql<number>`COUNT(CASE WHEN ${tasksTable.status} = 'done' THEN 1 END)`,
          })
          .from(tasksTable)
          .where(eq(tasksTable.projectId, project.id));
        const total = taskCounts[0]?.total ?? 0;
        if (total === 0) continue;
        const done = taskCounts[0]?.done ?? 0;
        const progress = done / total;
        const createdAt = new Date(project.createdAt).getTime();
        const now = Date.now();
        const elapsed = now - createdAt;
        // Assume 90 days project duration for estimation
        const assumedDuration = 90 * 24 * 60 * 60 * 1000;
        if (progress < 0.2 && elapsed > assumedDuration * 0.5) {
          return true;
        }
      }
      return false;
    },
    action: async () => {
      const projects = await db.select().from(projectsTable).where(eq(projectsTable.status, "active"));
      for (const project of projects) {
        const taskCounts = await db
          .select({
            total: sql<number>`COUNT(*)`,
            done: sql<number>`COUNT(CASE WHEN ${tasksTable.status} = 'done' THEN 1 END)`,
          })
          .from(tasksTable)
          .where(eq(tasksTable.projectId, project.id));
        const total = taskCounts[0]?.total ?? 0;
        if (total === 0) continue;
        const done = taskCounts[0]?.done ?? 0;
        const progress = done / total;
        const createdAt = new Date(project.createdAt).getTime();
        const now = Date.now();
        const elapsed = now - createdAt;
        const assumedDuration = 90 * 24 * 60 * 60 * 1000;
        if (progress < 0.2 && elapsed > assumedDuration * 0.5) {
          await logActivity(
            "project",
            "Alerte progression",
            `Projet "${project.name}" : ${Math.round(progress * 100)}% done, ${Math.round(elapsed / assumedDuration * 100)}% temps écoulé`,
            project.id
          );
        }
      }
    },
  });

  // 3. Contact follow-up: not contacted > 90 days
  registerWorkflowRule({
    id: "contact_followup",
    name: "Contact follow-up",
    description: "Rappel quand un contact n'a pas été contacté depuis plus de 90 jours",
    trigger: "deadline_approaching",
    isTemporal: true,
    enabled: true,
    condition: async () => {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const [count] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(contactsTable)
        .where(
          and(
            sql`${contactsTable.status} IN ('prospect', 'active', 'client')`,
            sql`${contactsTable.lastContactedAt} IS NULL OR ${contactsTable.lastContactedAt} < ${ninetyDaysAgo.toISOString()}`
          )
        );
      return (count?.count ?? 0) > 0;
    },
    action: async () => {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const staleContacts = await db
        .select()
        .from(contactsTable)
        .where(
          and(
            sql`${contactsTable.status} IN ('prospect', 'active', 'client')`,
            sql`${contactsTable.lastContactedAt} IS NULL OR ${contactsTable.lastContactedAt} < ${ninetyDaysAgo.toISOString()}`
          )
        );
      for (const contact of staleContacts) {
        await logActivity(
          "contact",
          "Relance contact",
          `Contact "${contact.name}" non contacté depuis 90+ jours`,
          contact.id
        );
      }
    },
  });

  // 4. Decision reminder: decided > 7 days without review
  registerWorkflowRule({
    id: "decision_reminder",
    name: "Decision reminder",
    description: "Rappel quand une décision est 'decided' depuis plus de 7 jours sans review",
    trigger: "deadline_approaching",
    isTemporal: true,
    enabled: true,
    condition: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const [count] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(decisionsTable)
        .where(
          and(
            eq(decisionsTable.status, "decided"),
            lte(decisionsTable.updatedAt, sevenDaysAgo),
            sql`${decisionsTable.result} IS NULL`
          )
        );
      return (count?.count ?? 0) > 0;
    },
    action: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const staleDecisions = await db
        .select()
        .from(decisionsTable)
        .where(
          and(
            eq(decisionsTable.status, "decided"),
            lte(decisionsTable.updatedAt, sevenDaysAgo),
            sql`${decisionsTable.result} IS NULL`
          )
        );
      for (const decision of staleDecisions) {
        await logActivity(
          "decision",
          "Revue décision",
          `Décision "${decision.title}" nécessite une review`,
          decision.id
        );
      }
    },
  });

  // 5. Memory link suggestion: when memory created → suggest links
  registerWorkflowRule({
    id: "memory_link_suggestion",
    name: "Memory link suggestion",
    description: "Suggère des liens automatiques quand une mémoire est créée",
    trigger: "memory_created",
    enabled: true,
    condition: async (event) => {
      return !!event.payload?.memoryId;
    },
    action: async (event) => {
      const memoryId = event.payload?.memoryId as number;
      if (!memoryId) return;
      const suggestions = await suggestRelationships("memory", memoryId);
      if (suggestions.length > 0) {
        await logActivity(
          "memory",
          "Liens suggérés",
          `${suggestions.length} lien(s) suggéré(s) pour la mémoire`,
          memoryId
        );
      }
    },
  });

  // 6. Briefing refresh: every morning at 8h
  registerWorkflowRule({
    id: "briefing_refresh",
    name: "Briefing refresh",
    description: "Régénère le briefing tous les matins à 8h",
    trigger: "scheduled",
    isTemporal: true,
    enabled: true,
    condition: async () => {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      // Run once around 8:00 AM (allow a few minutes window)
      if (hour === 8 && minute <= 2) {
        const today = now.toISOString().split("T")[0];
        const existing = await db
          .select()
          .from(briefingsTable)
          .where(eq(briefingsTable.date, today))
          .limit(1);
        // Only regenerate if not already created in the last hour
        if (existing.length > 0) {
          const age = Date.now() - new Date(existing[0].createdAt).getTime();
          if (age < 60 * 60 * 1000) return false;
        }
        return true;
      }
      return false;
    },
    action: async () => {
      const today = new Date().toISOString().split("T")[0];
      await db.delete(briefingsTable).where(eq(briefingsTable.date, today));
      // The briefing will be regenerated on next /briefing/today call
      await logActivity("task", "Briefing rafraîchi", `Briefing du ${today} marqué pour régénération`, 0);
    },
  });

  // 7. Weekly summary: every Sunday
  registerWorkflowRule({
    id: "weekly_summary",
    name: "Weekly summary",
    description: "Envoie un résumé de la semaine tous les dimanches",
    trigger: "scheduled",
    isTemporal: true,
    enabled: true,
    condition: async () => {
      const now = new Date();
      const day = now.getDay(); // 0 = Sunday
      const hour = now.getHours();
      const minute = now.getMinutes();
      // Run once on Sunday around 9:00 AM
      if (day === 0 && hour === 9 && minute <= 2) {
        return true;
      }
      return false;
    },
    action: async () => {
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - 7);
      const weekStartStr = weekStart.toISOString().split("T")[0];
      const weekEndStr = now.toISOString().split("T")[0];

      const [taskCount, projectCount, contactCount, decisionCount] = await Promise.all([
        db.select({ count: sql<number>`COUNT(*)` }).from(tasksTable).where(sql`${tasksTable.createdAt} >= ${weekStartStr}`),
        db.select({ count: sql<number>`COUNT(*)` }).from(projectsTable).where(sql`${projectsTable.createdAt} >= ${weekStartStr}`),
        db.select({ count: sql<number>`COUNT(*)` }).from(contactsTable).where(sql`${contactsTable.createdAt} >= ${weekStartStr}`),
        db.select({ count: sql<number>`COUNT(*)` }).from(decisionsTable).where(sql`${decisionsTable.createdAt} >= ${weekStartStr}`),
      ]);

      const summary = `Semaine du ${weekStartStr} au ${weekEndStr} : ${taskCount[0]?.count ?? 0} tâches, ${projectCount[0]?.count ?? 0} projets, ${contactCount[0]?.count ?? 0} contacts, ${decisionCount[0]?.count ?? 0} décisions.`;
      await logActivity("task", "Résumé hebdomadaire", summary, 0);
    },
  });
}

// ─── Event Emitters (called from routes) ──────────────────────────────────────

export async function emitTaskCreated(taskId: number): Promise<void> {
  await evaluateRules({ trigger: "task_created", entityId: taskId, entityType: "task" });
}

export async function emitTaskCompleted(taskId: number): Promise<void> {
  await evaluateRules({ trigger: "task_completed", entityId: taskId, entityType: "task" });
}

export async function emitProjectCreated(projectId: number): Promise<void> {
  await evaluateRules({ trigger: "project_created", entityId: projectId, entityType: "project" });
}

export async function emitContactAdded(contactId: number): Promise<void> {
  await evaluateRules({ trigger: "contact_added", entityId: contactId, entityType: "contact" });
}

export async function emitDecisionCreated(decisionId: number): Promise<void> {
  await evaluateRules({ trigger: "decision_created", entityId: decisionId, entityType: "decision" });
}

export async function emitMemoryCreated(memoryId: number): Promise<void> {
  await evaluateRules({ trigger: "memory_created", entityId: memoryId, entityType: "memory", payload: { memoryId } });
}
