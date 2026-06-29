/**
 * Goal Engine
 *
 * The Chief doesn't just respond - it pursues objectives.
 *
 * Features:
 * - Goal creation and prioritization
 * - Progress tracking
 * - Dependency management
 * - Risk identification
 * - Action planning
 * - History tracking
 */

import { db } from "@workspace/db";
import { tasksTable, projectsTable, decisionsTable } from "@workspace/db";
import { sql, eq, desc, and, gt, lt, gte } from "drizzle-orm";
import { EventBus, emitAgentEvent, type EventAction } from "./event-bus";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GoalStatus = "proposed" | "active" | "in_progress" | "blocked" | "completed" | "abandoned";

export type GoalPriority = "low" | "medium" | "high" | "critical";

export interface GoalStep {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "blocked" | "skipped";
  dependsOn?: string[];
  assignedAgent?: string;
  estimatedEffort?: "low" | "medium" | "high";
  actualEffort?: "low" | "medium" | "high";
  notes?: string;
}

export interface GoalRisk {
  id: string;
  description: string;
  severity: "low" | "medium" | "high";
  mitigation?: string;
  detectedAt: Date;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  status: GoalStatus;
  priority: GoalPriority;
  progress: number; // 0-100
  createdAt: Date;
  updatedAt: Date;
  targetDate?: Date;
  completedAt?: Date;
  steps: GoalStep[];
  risks: GoalRisk[];
  relatedEntities: {
    tasks: number[];
    projects: number[];
    decisions: number[];
  };
  metrics: {
    estimatedEffort: number;
    actualEffort: number;
    blockersCount: number;
    decisionsCount: number;
  };
  owner: string;
  tags: string[];
}

// ─── Goal Store ────────────────────────────────────────────────────────────────

class GoalEngineClass {
  private goals: Map<string, Goal> = new Map();
  private goalCounter = 0;

  // ─── Goal Lifecycle ──────────────────────────────────────────────────────────

  createGoal(
    title: string,
    options: {
      description?: string;
      priority?: GoalPriority;
      targetDate?: Date;
      owner?: string;
      tags?: string[];
    } = {}
  ): string {
    const id = `goal_${++this.goalCounter}_${Date.now()}`;

    const goal: Goal = {
      id,
      title,
      description: options.description || "",
      status: "proposed",
      priority: options.priority || "medium",
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      targetDate: options.targetDate,
      steps: [],
      risks: [],
      relatedEntities: { tasks: [], projects: [], decisions: [] },
      metrics: { estimatedEffort: 0, actualEffort: 0, blockersCount: 0, decisionsCount: 0 },
      owner: options.owner || "chief_of_staff",
      tags: options.tags || [],
    };

    this.goals.set(id, goal);

    emitAgentEvent("goal_engine", "created", { goalId: id, title, priority: goal.priority });

    return id;
  }

  activateGoal(goalId: string): boolean {
    const goal = this.goals.get(goalId);
    if (!goal) return false;

    goal.status = "active";
    goal.updatedAt = new Date();

    emitAgentEvent("goal_engine", "started", { goalId, title: goal.title });

    return true;
  }

  completeGoal(goalId: string): boolean {
    const goal = this.goals.get(goalId);
    if (!goal) return false;

    goal.status = "completed";
    goal.progress = 100;
    goal.completedAt = new Date();
    goal.updatedAt = new Date();

    emitAgentEvent("goal_engine", "completed", { goalId, title: goal.title });

    return true;
  }

  abandonGoal(goalId: string, reason?: string): boolean {
    const goal = this.goals.get(goalId);
    if (!goal) return false;

    goal.status = "abandoned";
    goal.updatedAt = new Date();

    emitAgentEvent("goal_engine", "deleted" as EventAction, { goalId, title: goal.title, reason });

    return true;
  }

  // ─── Step Management ─────────────────────────────────────────────────────────

  addStep(
    goalId: string,
    description: string,
    options: {
      dependsOn?: string[];
      assignedAgent?: string;
      estimatedEffort?: "low" | "medium" | "high";
    } = {}
  ): string | null {
    const goal = this.goals.get(goalId);
    if (!goal) return null;

    const stepId = `step_${goal.steps.length + 1}_${Date.now()}`;

    goal.steps.push({
      id: stepId,
      description,
      status: "pending",
      dependsOn: options.dependsOn,
      assignedAgent: options.assignedAgent,
      estimatedEffort: options.estimatedEffort,
    });

    goal.updatedAt = new Date();
    this.recalculateProgress(goal);

    emitAgentEvent("goal_engine", "updated", { goalId, action: "step_added", stepId });

    return stepId;
  }

  completeStep(goalId: string, stepId: string, notes?: string): boolean {
    const goal = this.goals.get(goalId);
    if (!goal) return false;

    const step = goal.steps.find(s => s.id === stepId);
    if (!step) return false;

    step.status = "completed";
    step.notes = notes;

    goal.updatedAt = new Date();
    this.recalculateProgress(goal);
    this.checkBlockers(goal);

    emitAgentEvent("goal_engine", "updated", { goalId, action: "step_completed", stepId });

    return true;
  }

  blockStep(goalId: string, stepId: string, reason: string): boolean {
    const goal = this.goals.get(goalId);
    if (!goal) return false;

    const step = goal.steps.find(s => s.id === stepId);
    if (!step) return false;

    step.status = "blocked";
    step.notes = reason;

    goal.status = "blocked";
    goal.metrics.blockersCount++;
    goal.updatedAt = new Date();

    emitAgentEvent("goal_engine", "updated", { goalId, action: "step_blocked", stepId, reason });

    return true;
  }

  // ─── Risk Management ─────────────────────────────────────────────────────────

  addRisk(
    goalId: string,
    description: string,
    severity: "low" | "medium" | "high",
    mitigation?: string
  ): string | null {
    const goal = this.goals.get(goalId);
    if (!goal) return null;

    const riskId = `risk_${goal.risks.length + 1}_${Date.now()}`;

    goal.risks.push({
      id: riskId,
      description,
      severity,
      mitigation,
      detectedAt: new Date(),
    });

    goal.updatedAt = new Date();

    emitAgentEvent("goal_engine", "updated", { goalId, action: "risk_added", riskId, severity });

    return riskId;
  }

  // ─── Entity Linking ──────────────────────────────────────────────────────────

  linkTask(goalId: string, taskId: number): boolean {
    const goal = this.goals.get(goalId);
    if (!goal) return false;

    if (!goal.relatedEntities.tasks.includes(taskId)) {
      goal.relatedEntities.tasks.push(taskId);
      goal.updatedAt = new Date();
    }

    return true;
  }

  linkProject(goalId: string, projectId: number): boolean {
    const goal = this.goals.get(goalId);
    if (!goal) return false;

    if (!goal.relatedEntities.projects.includes(projectId)) {
      goal.relatedEntities.projects.push(projectId);
      goal.updatedAt = new Date();
    }

    return true;
  }

  linkDecision(goalId: string, decisionId: number): boolean {
    const goal = this.goals.get(goalId);
    if (!goal) return false;

    if (!goal.relatedEntities.decisions.includes(decisionId)) {
      goal.relatedEntities.decisions.push(decisionId);
      goal.metrics.decisionsCount++;
      goal.updatedAt = new Date();
    }

    return true;
  }

  // ─── Analysis ────────────────────────────────────────────────────────────────

  private recalculateProgress(goal: Goal): void {
    if (goal.steps.length === 0) {
      goal.progress = 0;
      return;
    }

    const completed = goal.steps.filter(s => s.status === "completed").length;
    goal.progress = Math.round((completed / goal.steps.length) * 100);

    // Auto-complete if all steps done
    if (goal.progress === 100 && goal.status !== "completed") {
      goal.status = "completed";
      goal.completedAt = new Date();
    }
  }

  private checkBlockers(goal: Goal): void {
    const blockedSteps = goal.steps.filter(s => s.status === "blocked");
    goal.metrics.blockersCount = blockedSteps.length;

    if (blockedSteps.length > 0 && goal.status === "active") {
      goal.status = "blocked";
    } else if (blockedSteps.length === 0 && goal.status === "blocked") {
      goal.status = "in_progress";
    }
  }

  // ─── Query ───────────────────────────────────────────────────────────────────

  getGoal(goalId: string): Goal | null {
    return this.goals.get(goalId) || null;
  }

  getActiveGoals(): Goal[] {
    return Array.from(this.goals.values())
      .filter(g => g.status === "active" || g.status === "in_progress" || g.status === "blocked")
      .sort((a, b) => {
        const priorityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
        return priorityWeight[b.priority] - priorityWeight[a.priority];
      });
  }

  getBlockedGoals(): Goal[] {
    return Array.from(this.goals.values())
      .filter(g => g.status === "blocked");
  }

  getGoalsByPriority(priority: GoalPriority): Goal[] {
    return Array.from(this.goals.values())
      .filter(g => g.priority === priority);
  }

  getGoalSummary(): {
    total: number;
    active: number;
    blocked: number;
    completed: number;
    avgProgress: number;
  } {
    const all = Array.from(this.goals.values());
    const active = all.filter(g => g.status === "active" || g.status === "in_progress").length;
    const blocked = all.filter(g => g.status === "blocked").length;
    const completed = all.filter(g => g.status === "completed").length;

    return {
      total: all.length,
      active,
      blocked,
      completed,
      avgProgress: all.length > 0
        ? Math.round(all.reduce((sum, g) => sum + g.progress, 0) / all.length)
        : 0,
    };
  }

  // ─── Next Actions ────────────────────────────────────────────────────────────

  getNextActions(limit = 5): Array<{ goalId: string; goalTitle: string; step: GoalStep }> {
    const activeGoals = this.getActiveGoals();
    const actions: Array<{ goalId: string; goalTitle: string; step: GoalStep }> = [];

    for (const goal of activeGoals) {
      for (const step of goal.steps) {
        if (step.status === "pending") {
          // Check dependencies
          const depsComplete = !step.dependsOn || step.dependsOn.every(depId =>
            goal.steps.find(s => s.id === depId && s.status === "completed")
          );

          if (depsComplete) {
            actions.push({ goalId: goal.id, goalTitle: goal.title, step });
            if (actions.length >= limit) return actions;
          }
        }
      }
    }

    return actions;
  }
}

export const GoalEngine = new GoalEngineClass();
