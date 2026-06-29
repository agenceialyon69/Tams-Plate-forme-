/**
 * Reflection Engine
 *
 * After each significant execution:
 * - Analyze what worked
 * - Analyze what failed
 * - Identify why
 * - Generate improvement suggestions
 * - Update memory automatically
 *
 * This is how the system LEARNS from experience.
 */

import { smartCompletion } from "./ai-router";
import { recordAIMetric } from "./observability";
import { db } from "@workspace/db";
import { memoriesTable, decisionsTable, activityTable } from "@workspace/db";
import { eq, desc, gte, sql } from "drizzle-orm";
import { EventBus, emitMemoryEvent } from "./event-bus";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReflectionContext {
  taskId?: string;
  goalId?: string;
  agentRole?: string;
  query: string;
  result: string;
  success: boolean;
  error?: string;
  durationMs: number;
  modelUsed?: string;
  toolsUsed?: string[];
  timestamp: Date;
}

export interface ReflectionResult {
  whatWorked: string[];
  whatFailed: string[];
  whyAnalysis: string;
  improvementSuggestions: string[];
  shouldMemorize: boolean;
  memoryTitle?: string;
  memoryContent?: string;
  confidenceScore: number;
}

export interface Pattern {
  id: string;
  pattern: string;
  frequency: number;
  lastSeen: Date;
  category: "success" | "failure" | "warning" | "optimization";
  action?: string;
}

// ─── Reflection Engine ─────────────────────────────────────────────────────────

class ReflectionEngineClass {
  private reflections: ReflectionResult[] = [];
  private patterns: Map<string, Pattern> = new Map();
  private maxReflections = 500;

  // ─── Main Reflection ────────────────────────────────────────────────────────

  async reflect(context: ReflectionContext): Promise<ReflectionResult> {
    const prompt = `Tu es un moteur de réflexion qui analyse les exécutions passées pour apprendre.

Exécution à analyser:
- Requête: ${context.query}
- Résultat: ${context.result.slice(0, 500)}
- Succès: ${context.success}
- Durée: ${context.durationMs}ms
- Erreur: ${context.error || "aucune"}
- Outils utilisés: ${context.toolsUsed?.join(", ") || "aucun"}

Analyse cette exécution et réponds en JSON:
{
  "whatWorked": ["ce qui a bien fonctionné"],
  "whatFailed": ["ce qui n'a pas fonctionné"],
  "whyAnalysis": "explication de 2-3 phrases sur le pourquoi",
  "improvementSuggestions": ["suggestions d'amélioration concrètes"],
  "shouldMemorize": true/false,
  "memoryTitle": "titre si mémorisation pertinente",
  "memoryContent": "contenu à mémoriser",
  "confidenceScore": 0.0-1.0
}`;

    try {
      const result = await smartCompletion("analysis", [{ role: "system", content: prompt }], {
        maxTokens: 600,
        needsJSON: true,
      });

      recordAIMetric({
        timestamp: new Date(),
        model: result.model,
        provider: "replit",
        taskType: "reflection",
        latencyMs: result.latencyMs,
        success: true,
      });

      let parsed: Partial<ReflectionResult>;
      try {
        parsed = JSON.parse(result.content);
      } catch {
        parsed = {};
      }

      const reflection: ReflectionResult = {
        whatWorked: Array.isArray(parsed.whatWorked) ? parsed.whatWorked : [],
        whatFailed: Array.isArray(parsed.whatFailed) ? parsed.whatFailed : [],
        whyAnalysis: parsed.whyAnalysis || "",
        improvementSuggestions: Array.isArray(parsed.improvementSuggestions) ? parsed.improvementSuggestions : [],
        shouldMemorize: parsed.shouldMemorize || false,
        memoryTitle: parsed.memoryTitle,
        memoryContent: parsed.memoryContent,
        confidenceScore: typeof parsed.confidenceScore === "number" ? parsed.confidenceScore : 0.5,
      };

      this.reflections.push(reflection);
      if (this.reflections.length > this.maxReflections) {
        this.reflections.shift();
      }

      // Auto-memorize if significant
      if (reflection.shouldMemorize && reflection.memoryTitle && reflection.memoryContent) {
        await this.autoMemorize(reflection.memoryTitle, reflection.memoryContent, context);
      }

      // Detect patterns
      this.detectPatterns(context, reflection);

      return reflection;
    } catch (err) {
      recordAIMetric({
        timestamp: new Date(),
        model: "unknown",
        provider: "replit",
        taskType: "reflection",
        latencyMs: 0,
        success: false,
        errorCode: err instanceof Error ? err.message : "Unknown error",
      });

      return this.fallbackReflection(context);
    }
  }

  private fallbackReflection(context: ReflectionContext): ReflectionResult {
    const whatFailed: string[] = [];
    const whatWorked: string[] = [];

    if (context.success) {
      whatWorked.push("Exécution terminée avec succès");
    } else {
      whatFailed.push(`Erreur: ${context.error || "inconnue"}`);
    }

    if (context.durationMs > 5000) {
      whatFailed.push("Temps d'exécution élevé");
    }

    return {
      whatWorked,
      whatFailed,
      whyAnalysis: context.error || "Analyse non disponible",
      improvementSuggestions: context.error
        ? ["Corriger l'erreur identifiée"]
        : [],
      shouldMemorize: false,
      confidenceScore: 0.3,
    };
  }

  // ─── Auto-Memorization ───────────────────────────────────────────────────────

  private async autoMemorize(
    title: string,
    content: string,
    context: ReflectionContext
  ): Promise<void> {
    try {
      const [memory] = await db.insert(memoriesTable).values({
        title,
        content,
        type: "note",
      }).returning();

      emitMemoryEvent("reflection_engine", "created", {
        memoryId: memory.id,
        title,
        context: { taskId: context.taskId, agentRole: context.agentRole },
      });

      recordAIMetric({
        timestamp: new Date(),
        model: "reflection",
        provider: "local",
        taskType: "auto_memorize",
        latencyMs: 0,
        success: true,
      });
    } catch (err) {
      console.error("Failed to auto-memorize:", err);
    }
  }

  // ─── Pattern Detection ───────────────────────────────────────────────────────

  private detectPatterns(context: ReflectionContext, reflection: ReflectionResult): void {
    // Track error patterns
    if (!context.success && context.error) {
      const patternKey = `error_${context.error.slice(0, 50)}`;
      const existing = this.patterns.get(patternKey);
      if (existing) {
        existing.frequency++;
        existing.lastSeen = new Date();
      } else {
        this.patterns.set(patternKey, {
          id: patternKey,
          pattern: context.error.slice(0, 100),
          frequency: 1,
          lastSeen: new Date(),
          category: "failure",
        });
      }
    }

    // Track slow operations
    if (context.durationMs > 5000) {
      const patternKey = `slow_${context.agentRole || "unknown"}`;
      const existing = this.patterns.get(patternKey);
      if (existing) {
        existing.frequency++;
        existing.lastSeen = new Date();
      } else {
        this.patterns.set(patternKey, {
          id: patternKey,
          pattern: `Agent ${context.agentRole || "unknown"} lent`,
          frequency: 1,
          lastSeen: new Date(),
          category: "warning",
          action: "Considérer optimisation ou cache",
        });
      }
    }

    // Track improvement suggestions
    for (const suggestion of reflection.improvementSuggestions) {
      const patternKey = `suggestion_${suggestion.slice(0, 30)}`;
      const existing = this.patterns.get(patternKey);
      if (existing) {
        existing.frequency++;
        existing.lastSeen = new Date();
      } else {
        this.patterns.set(patternKey, {
          id: patternKey,
          pattern: suggestion,
          frequency: 1,
          lastSeen: new Date(),
          category: "optimization",
        });
      }
    }
  }

  // ─── Pattern Queries ──────────────────────────────────────────────────────────

  getFrequentFailures(minFrequency = 3): Pattern[] {
    return Array.from(this.patterns.values())
      .filter(p => p.category === "failure" && p.frequency >= minFrequency)
      .sort((a, b) => b.frequency - a.frequency);
  }

  getOptimizationOpportunities(minFrequency = 2): Pattern[] {
    return Array.from(this.patterns.values())
      .filter(p => p.category === "optimization" && p.frequency >= minFrequency)
      .sort((a, b) => b.frequency - a.frequency);
  }

  getRecentReflections(limit = 20): ReflectionResult[] {
    return this.reflections.slice(-limit);
  }

  // ─── Decision Learning ────────────────────────────────────────────────────────

  async learnFromDecision(decisionId: number): Promise<{
    outcome: "positive" | "neutral" | "negative";
    learnings: string[];
    relatedDecisions: number[];
  }> {
    try {
      const [decision] = await db.select()
        .from(decisionsTable)
        .where(eq(decisionsTable.id, decisionId));

      if (!decision) {
        return { outcome: "neutral", learnings: [], relatedDecisions: [] };
      }

      // Find similar decisions
      const similar = await db.select()
        .from(decisionsTable)
        .where(sql`${decisionsTable.title} % ${decision.title}`)
        .orderBy(desc(decisionsTable.createdAt))
        .limit(5);

      const relatedDecisions = similar
        .filter(d => d.id !== decisionId)
        .map(d => d.id);

      // Analyze outcome patterns
      const positiveCount = similar.filter(d =>
        d.status === "decided" && d.confidenceScore >= 70
      ).length;

      const outcome: "positive" | "neutral" | "negative" =
        positiveCount > similar.length / 2 ? "positive" :
        positiveCount < similar.length / 3 ? "negative" : "neutral";

      const learnings = this.extractDecisionLearnings(decision, similar);

      return { outcome, learnings, relatedDecisions };
    } catch {
      return { outcome: "neutral", learnings: [], relatedDecisions: [] };
    }
  }

  private extractDecisionLearnings(
    decision: typeof decisionsTable.$inferSelect,
    similar: typeof decisionsTable.$inferSelect[]
  ): string[] {
    const learnings: string[] = [];

    if (decision.result && decision.status === "decided") {
      learnings.push(`Résultat: ${decision.result}`);
    }

    if (decision.learnings) {
      learnings.push(decision.learnings);
    }

    if (similar.length > 1) {
      const avgConfidence = similar.reduce((sum, d) => sum + (d.confidenceScore || 50), 0) / similar.length;
      if (avgConfidence > 70) {
        learnings.push(`Pattern: décisions similaires ont une confiance moyenne de ${Math.round(avgConfidence)}%`);
      }
    }

    return learnings;
  }
}

export const ReflectionEngine = new ReflectionEngineClass();

// ─── Middleware for Auto-Reflection ─────────────────────────────────────────────

export function withReflection<T>(
  agentRole: string,
  query: string,
  executor: () => Promise<{ success: boolean; result: string; error?: string; durationMs: number; model?: string }>
): Promise<{ result: T; reflection: ReflectionResult }> {
  return executor().then(async (execution) => {
    const reflection = await ReflectionEngine.reflect({
      agentRole,
      query,
      result: execution.result,
      success: execution.success,
      error: execution.error,
      durationMs: execution.durationMs,
      modelUsed: execution.model,
      timestamp: new Date(),
    });

    return {
      result: execution as T,
      reflection,
    };
  });
}
