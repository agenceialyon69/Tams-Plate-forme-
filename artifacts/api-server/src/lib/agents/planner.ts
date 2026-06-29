/**
 * Tool Planner Engine
 *
 * Plans and executes chains of actions:
 * 1. Analyzes the user request
 * 2. Creates a step-by-step plan
 * 3. Executes each step with dependencies
 * 4. Verifies results
 * 5. Adapts on failure
 *
 * This is NOT single tool calls - this is orchestrated workflows.
 */

import { smartCompletion } from "../ai-router";
import { recordAIMetric, recordToolMetric } from "../observability";
import { executeTool } from "./orchestrator";
import type { ToolResult } from "../tools";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlanStep {
  id: string;
  tool: string;
  parameters: Record<string, unknown>;
  dependsOn: string[];
  expectedOutcome: string;
  rollbackAction?: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  result?: unknown;
  error?: string;
}

export interface ExecutionPlan {
  id: string;
  query: string;
  steps: PlanStep[];
  currentStep: number;
  status: "planning" | "executing" | "completed" | "failed" | "partial";
  totalDuration: number;
  results: Array<{ step: string; success: boolean; result: unknown }>;
}

// ─── Plan Generator ───────────────────────────────────────────────────────────

const AVAILABLE_TOOLS = [
  "create_task", "list_tasks", "update_task",
  "create_project", "list_projects",
  "create_contact", "list_contacts",
  "create_memory", "search_memories",
  "create_decision", "list_decisions",
  "create_asset", "create_memory_edge", "list_memory_edges",
  "get_briefing",
];

async function generatePlan(query: string, context: string): Promise<PlanStep[]> {
  const prompt = `Tu es un planificateur d'actions. Analyse la requête et génère un plan d'exécution.

Outils disponibles:
${AVAILABLE_TOOLS.map(t => `- ${t}`).join("\n")}

Contexte:
${context}

Requête: ${query}

Génère un plan en JSON avec ce format:
{
  "steps": [
    {
      "id": "step_1",
      "tool": "nom_outil",
      "parameters": { "param": "valeur" },
      "dependsOn": [],
      "expectedOutcome": "ce qui doit se passer",
      "rollbackAction": "action de rollback si échec (optionnel)"
    }
  ]
}

Règles:
1. Maximum 5 étapes
2. Chaque étape doit avoir un outil valide
3. Les dépendances doivent exister (step_X)
4. Prévois des rollbacks pour les actions critiques
5. Commence par rechercher/explorer avant créer`;

  try {
    const result = await smartCompletion("reasoning", [{ role: "system", content: prompt }], {
      maxTokens: 800,
      needsJSON: true,
    });

    const parsed = JSON.parse(result.content);
    return (parsed.steps || []).map((s: any) => ({
      ...s,
      status: "pending" as const,
    }));
  } catch {
    // Fallback: simple task creation
    return [{
      id: "step_1",
      tool: "create_task",
      parameters: { title: query.slice(0, 100) },
      dependsOn: [],
      expectedOutcome: "Tâche créée pour suivre cette action",
      status: "pending",
    }];
  }
}

// ─── Step Executor ────────────────────────────────────────────────────────────

async function executeStep(step: PlanStep, previousResults: Map<string, unknown>): Promise<ToolResult> {
  const startTime = Date.now();

  // Resolve dependencies in parameters
  let resolvedParams = { ...step.parameters };

  for (const depId of step.dependsOn) {
    const depResult = previousResults.get(depId);
    if (depResult && typeof depResult === "object") {
      resolvedParams = { ...resolvedParams, ...depResult };
    }
  }

  try {
    const result = await executeTool(step.tool, resolvedParams);

    recordToolMetric({
      timestamp: new Date(),
      tool: step.tool,
      success: true,
      latencyMs: Date.now() - startTime,
      retryCount: 0,
    });

    return {
      success: true,
      data: { message: result },
      metadata: {
        durationMs: Date.now() - startTime,
        retryCount: 0,
        permission: ["write"],
      },
    };
  } catch (err) {
    recordToolMetric({
      timestamp: new Date(),
      tool: step.tool,
      success: false,
      latencyMs: Date.now() - startTime,
      retryCount: 0,
      errorCode: err instanceof Error ? err.message : "Unknown error",
    });

    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
      metadata: {
        durationMs: Date.now() - startTime,
        retryCount: 0,
        permission: ["write"],
      },
    };
  }
}

// ─── Plan Executor ────────────────────────────────────────────────────────────

export async function executePlan(query: string, context: string): Promise<ExecutionPlan> {
  const planId = `plan_${Date.now()}`;
  const startTime = Date.now();

  // Generate plan
  const steps = await generatePlan(query, context);

  const plan: ExecutionPlan = {
    id: planId,
    query,
    steps,
    currentStep: 0,
    status: "executing",
    totalDuration: 0,
    results: [],
  };

  const previousResults = new Map<string, unknown>();
  const completedSteps = new Set<string>();

  // Execute steps in order (respecting dependencies)
  while (true) {
    // Find next executable step
    const nextStep = plan.steps.find(
      s => s.status === "pending" && s.dependsOn.every(d => completedSteps.has(d))
    );

    if (!nextStep) break;

    nextStep.status = "running";
    plan.currentStep = plan.steps.indexOf(nextStep);

    const result = await executeStep(nextStep, previousResults);

    if (result.success) {
      nextStep.status = "success";
      nextStep.result = result.data;
      previousResults.set(nextStep.id, result.data);
      completedSteps.add(nextStep.id);
      plan.results.push({ step: nextStep.id, success: true, result: result.data });
    } else {
      nextStep.status = "failed";
      nextStep.error = result.error;
      plan.results.push({ step: nextStep.id, success: false, result: result.error });

      // Execute rollback if available
      if (nextStep.rollbackAction) {
        try {
          await executeTool(nextStep.rollbackAction, {});
        } catch {
          // Rollback failed - log but continue
        }
      }

      // Decide if we can continue with other steps
      const dependentSteps = plan.steps.filter(s => s.dependsOn.includes(nextStep.id));
      if (dependentSteps.length > 0) {
        // Mark dependent steps as skipped
        dependentSteps.forEach(s => { s.status = "skipped"; });
      }
    }
  }

  // Determine final status
  const failedSteps = plan.steps.filter(s => s.status === "failed");
  const successSteps = plan.steps.filter(s => s.status === "success");

  if (failedSteps.length === 0 && successSteps.length === plan.steps.length) {
    plan.status = "completed";
  } else if (successSteps.length > 0) {
    plan.status = "partial";
  } else {
    plan.status = "failed";
  }

  plan.totalDuration = Date.now() - startTime;

  return plan;
}

// ─── Verification ─────────────────────────────────────────────────────────────

export async function verifyPlanResult(plan: ExecutionPlan): Promise<{
  verified: boolean;
  summary: string;
  details: string[];
}> {
  const details: string[] = [];
  let verified = true;
  let summary = "";

  for (const step of plan.steps) {
    if (step.status === "success") {
      details.push(`✓ ${step.tool}: ${step.expectedOutcome}`);
    } else if (step.status === "failed") {
      details.push(`✗ ${step.tool}: ÉCHEC - ${step.error}`);
      verified = false;
    } else if (step.status === "skipped") {
      details.push(`→ ${step.tool}: Ignoré (dépendance échouée)`);
    }
  }

  const successCount = plan.steps.filter(s => s.status === "success").length;
  const totalCount = plan.steps.length;

  if (plan.status === "completed") {
    summary = `Plan exécuté avec succès (${successCount}/${totalCount} étapes)`;
  } else if (plan.status === "partial") {
    summary = `Exécution partielle (${successCount}/${totalCount} étapes réussies)`;
    verified = false;
  } else {
    summary = `Échec de l'exécution (${successCount}/${totalCount} étapes réussies)`;
    verified = false;
  }

  return { verified, summary, details };
}

// ─── High-level API ───────────────────────────────────────────────────────────

export async function planAndExecute(
  query: string,
  context: string = ""
): Promise<{
  success: boolean;
  plan: ExecutionPlan;
  verification: Awaited<ReturnType<typeof verifyPlanResult>>;
  message: string;
}> {
  const plan = await executePlan(query, context);
  const verification = await verifyPlanResult(plan);

  return {
    success: verification.verified,
    plan,
    verification,
    message: `${verification.summary}\n\n${verification.details.join("\n")}`,
  };
}
