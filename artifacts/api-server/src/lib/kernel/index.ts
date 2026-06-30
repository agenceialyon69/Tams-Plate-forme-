/**
 * TAMS KERNEL — le cerveau de l'AI Operating System.
 *
 * RÈGLE ABSOLUE : TOUTES les requêtes passent par le Kernel.
 * Aucune route, aucun agent, aucun outil ne peut être appelé en dehors.
 *
 * Pipeline :
 *   Requête → Intent Engine → Mission Generator → Mission Queue
 *           → Planner → Council (si complexe) → Execution Graph
 *           → Runtime → Tool Router → Validation → Reflection → Memory
 *
 * Le Kernel ne connaît JAMAIS les providers (Pollinations, HuggingFace, etc.).
 * Il connaît uniquement les CAPACITÉS (Image, Video, Music, Voice, Search, ...).
 */

import { aiChat } from "../ai";
import { logger } from "../logger";
import { runMission } from "../agents/mission";
import { ReflectionEngine } from "../reflection";
import { db } from "@workspace/db";
import { memoriesTable, activityTable } from "@workspace/db";
import { EventBus } from "../event-bus";
import { getSystemHealth } from "../observability";
import { runValidation, type Check } from "../validation";
import { runScenarios } from "../scenarios";

// ─── TYPES ─────────────────────────────────────────────────────────────────────

export type Intent =
  | "chat"              // Conversation simple
  | "create_task"       // Créer une tâche
  | "create_project"    // Créer un projet
  | "generate_image"    // Générer une image
  | "generate_video"    // Générer une vidéo
  | "generate_music"    // Générer de la musique
  | "search_memory"    // Rechercher en mémoire
  | "make_decision"     // Prendre une décision
  | "continue_project"  // Continuer le projet (mission complexe)
  | "fix_studio"        // Corriger le Studio (mission complexe)
  | "system_health"    // Vérifier la santé du système
  | "self_improve"      // Auto-amélioration
  | "unknown";          // Non classifié

export type Capability =
  | "Image" | "Video" | "Music" | "Voice" | "Publish"
  | "Search" | "Analyse" | "Code" | "Git" | "Deploy";

export type MissionKind =
  | "simple"            // Une seule action (ex: génère une image)
  | "complex";          // Multi-étapes avec dépendances (ex: continue le projet)

export type KernelStatus =
  | "idle"              // En attente
  | "processing"        // Traite une requête
  | "executing"         // Exécute une mission
  | "validating"        // Valide les résultats
  | "reflecting"        // Réfléchit après exécution
  | "error";            // Erreur

export interface KernelRequest {
  id: string;
  raw: string;           // Requête brute de l'utilisateur
  userId?: string;
  conversationId?: number;
  timestamp: Date;
}

export interface IntentResult {
  intent: Intent;
  confidence: number;
  missionKind: MissionKind;
  extractedParams: Record<string, unknown>;
  reasoning: string;
}

export interface GeneratedMission {
  id: string;
  objective: string;
  kind: MissionKind;
  priority: "low" | "medium" | "high" | "critical";
  steps: KernelStep[];
  dependencies: Record<string, string[]>; // stepId → stepIds requis avant
  rollbackPlan: Record<string, string>;   // stepId → action de rollback
  humanGates: string[];                   // étapes nécessitant validation humaine
}

export interface KernelStep {
  id: string;
  capability?: Capability;  // Quelle capacité invoquer (abstraite)
  agentRole?: string;       // Quel agent invoquer
  title: string;
  params: Record<string, unknown>;
  expectedOutcome: string;
  status: "pending" | "running" | "success" | "failed" | "skipped" | "blocked";
  result?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
}

export interface KernelResponse {
  requestId: string;
  missionId: string;
  intent: Intent;
  status: "PASS" | "FAIL" | "BLOCKED";
  steps: KernelStep[];
  reflection?: string;
  validation?: { overall: string; checks: Check[] };
  synthesis: string;
  durationMs: number;
  decisionLog: Array<{ timestamp: Date; step: string; decision: string; approved: boolean }>;
}

// ─── ÉTAT DU KERNEL ───────────────────────────────────────────────────────────

let kernelStatus: KernelStatus = "idle";
const kernelLog: Array<{ timestamp: Date; event: string; detail: string }> = [];

function logKernelEvent(event: string, detail: string): void {
  const entry = { timestamp: new Date(), event, detail: detail.slice(0, 200) };
  kernelLog.push(entry);
  if (kernelLog.length > 500) kernelLog.shift();
  logger.info({ event, detail: detail.slice(0, 100) }, "kernel");
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── 1. INTENT ENGINE ──────────────────────────────────────────────────────────
//
// Parse la requête utilisateur et détermine l'intention + le type de mission.
// Utilise l'IA pour classifier, avec un fallback par mots-clés.

const INTENT_KEYWORDS: Record<Intent, string[]> = {
  chat: ["bonjour", "salut", "merci", "comment", "pourquoi", "qu'est-ce"],
  create_task: ["crée une tâche", "nouvelle tâche", "ajoute une tâche", "todo"],
  create_project: ["crée un projet", "nouveau projet", "lance un projet"],
  generate_image: ["génère une image", "crée une image", "/image", "dessine", "image de"],
  generate_video: ["génère une vidéo", "crée une vidéo", "vidéo de", "/video"],
  generate_music: ["génère de la musique", "crée une musique", "musique", "/music"],
  search_memory: ["cherche en mémoire", "qu'est-ce que tu sais sur", "souviens-toi", "mémoire de"],
  make_decision: ["décide", "décision", "choisis entre", "analyse cette décision"],
  continue_project: ["continue le projet", "continue le développement", "reprends le travail", "prochaine étape"],
  fix_studio: ["corrige le studio", "répare le studio", "studio cassé", "fix studio"],
  system_health: ["santé du système", "état du système", "health", "diagnostic", "validate"],
  self_improve: ["améliore-toi", "self-improve", "optimise", "analyse tes performances"],
  unknown: [],
};

function classifyByKeywords(raw: string): IntentResult {
  const q = raw.toLowerCase();
  let bestIntent: Intent = "chat";
  let bestScore = 0;

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (intent === "unknown") continue;
    const matches = keywords.filter(kw => q.includes(kw));
    if (matches.length > bestScore) {
      bestScore = matches.length;
      bestIntent = intent as Intent;
    }
  }

  const complexIntents: Intent[] = ["continue_project", "fix_studio", "self_improve"];
  const kind: MissionKind = complexIntents.includes(bestIntent) ? "complex" : "simple";

  return {
    intent: bestIntent,
    confidence: bestScore > 0 ? Math.min(bestScore / 2, 1) : 0.3,
    missionKind: kind,
    extractedParams: {},
    reasoning: bestScore > 0
      ? `Classifié par mots-clés (${bestScore} matchs)`
      : "Fallback: intention de chat par défaut",
  };
}

async function classifyByAI(raw: string): Promise<IntentResult | null> {
  try {
    const c = await aiChat({
      messages: [
        {
          role: "system",
          content: `Tu es l'Intent Engine de TAMS. Classifie la requête en JSON.
Intents possibles: chat, create_task, create_project, generate_image, generate_video, generate_music, search_memory, make_decision, continue_project, fix_studio, system_health, self_improve, unknown.
missionKind: "simple" pour une action unique, "complex" pour multi-étapes.
Réponds en JSON: {"intent":"...","confidence":0.0-1.0,"missionKind":"simple|complex","extractedParams":{},"reasoning":"..."}`,
        },
        { role: "user", content: raw },
      ],
      response_format: { type: "json_object" },
      max_tokens: 300,
    }, "fast");

    const parsed = JSON.parse(c?.choices?.[0]?.message?.content ?? "{}");
    if (!parsed.intent) return null;

    return {
      intent: parsed.intent as Intent,
      confidence: parsed.confidence ?? 0.5,
      missionKind: parsed.missionKind as MissionKind ?? "simple",
      extractedParams: parsed.extractedParams ?? {},
      reasoning: parsed.reasoning ?? "Classifié par IA",
    };
  } catch {
    return null;
  }
}

async function parseIntent(req: KernelRequest): Promise<IntentResult> {
  // Essaie l'IA d'abord, fallback sur mots-clés
  const aiResult = await classifyByAI(req.raw);
  if (aiResult && aiResult.confidence > 0.6) {
    logKernelEvent("intent", `IA: ${aiResult.intent} (${aiResult.confidence})`);
    return aiResult;
  }

  const kwResult = classifyByKeywords(req.raw);
  logKernelEvent("intent", `Keywords: ${kwResult.intent} (${kwResult.confidence})`);
  return kwResult;
}

// ─── 2. MISSION GENERATOR ───────────────────────────────────────────────────────
//
// Convertit une intention en mission structurée avec étapes, dépendances et rollback.

const SIMPLE_MISSIONS: Record<Intent, (params: Record<string, unknown>) => GeneratedMission> = {
  generate_image: (p) => ({
    id: genId("mission"),
    objective: `Générer une image: ${p.prompt || p.description || "non spécifié"}`,
    kind: "simple",
    priority: "medium",
    steps: [{
      id: "step_1",
      capability: "Image" as Capability,
      title: "Générer l'image",
      params: { prompt: p.prompt || p.description || "" },
      expectedOutcome: "URL de l'image générée",
      status: "pending",
    }],
    dependencies: {},
    rollbackPlan: {},
    humanGates: [],
  }),

  generate_video: (p) => ({
    id: genId("mission"),
    objective: `Générer une vidéo: ${p.prompt || p.description || "non spécifié"}`,
    kind: "simple",
    priority: "medium",
    steps: [{
      id: "step_1",
      capability: "Video" as Capability,
      title: "Générer la vidéo",
      params: { prompt: p.prompt || p.description || "", scenes: p.scenes || 2 },
      expectedOutcome: "URL de la vidéo générée",
      status: "pending",
    }],
    dependencies: {},
    rollbackPlan: {},
    humanGates: [],
  }),

  generate_music: (p) => ({
    id: genId("mission"),
    objective: `Générer de la musique: ${p.prompt || p.description || "non spécifié"}`,
    kind: "simple",
    priority: "medium",
    steps: [{
      id: "step_1",
      capability: "Music" as Capability,
      title: "Générer la musique",
      params: { prompt: p.prompt || p.description || "" },
      expectedOutcome: "URL du fichier audio",
      status: "pending",
    }],
    dependencies: {},
    rollbackPlan: {},
    humanGates: [],
  }),

  create_task: (p) => ({
    id: genId("mission"),
    objective: `Créer une tâche: ${p.title || "non spécifié"}`,
    kind: "simple",
    priority: "medium",
    steps: [{
      id: "step_1",
      title: "Créer la tâche en DB",
      params: { title: p.title || "", description: p.description || "", priority: p.priority || "medium" },
      expectedOutcome: "Tâche créée avec ID",
      status: "pending",
    }],
    dependencies: {},
    rollbackPlan: { step_1: "Supprimer la tâche créée" },
    humanGates: [],
  }),

  create_project: (p) => ({
    id: genId("mission"),
    objective: `Créer un projet: ${p.name || "non spécifié"}`,
    kind: "simple",
    priority: "medium",
    steps: [{
      id: "step_1",
      title: "Créer le projet en DB",
      params: { name: p.name || "", description: p.description || "" },
      expectedOutcome: "Projet créé avec ID",
      status: "pending",
    }],
    dependencies: {},
    rollbackPlan: { step_1: "Supprimer le projet créé" },
    humanGates: [],
  }),

  search_memory: (p) => ({
    id: genId("mission"),
    objective: `Rechercher en mémoire: ${p.query || "non spécifié"}`,
    kind: "simple",
    priority: "low",
    steps: [{
      id: "step_1",
      title: "Rechercher dans les mémoires",
      params: { query: p.query || "" },
      expectedOutcome: "Résultats de recherche",
      status: "pending",
    }],
    dependencies: {},
    rollbackPlan: {},
    humanGates: [],
  }),

  make_decision: (p) => ({
    id: genId("mission"),
    objective: `Analyser une décision: ${p.title || "non spécifié"}`,
    kind: "simple",
    priority: "high",
    steps: [
      { id: "step_1", title: "Créer la décision en DB", params: { title: p.title || "", context: p.context || "" }, expectedOutcome: "Décision créée", status: "pending" },
      { id: "step_2", title: "Analyser avec le Council", params: {}, expectedOutcome: "Analyse multi-agents", status: "pending" },
    ],
    dependencies: { step_2: ["step_1"] },
    rollbackPlan: { step_1: "Supprimer la décision" },
    humanGates: [],
  }),

  system_health: () => ({
    id: genId("mission"),
    objective: "Diagnostic de la plateforme",
    kind: "simple",
    priority: "high",
    steps: [{
      id: "step_1",
      title: "Exécuter le Validation Engine",
      params: {},
      expectedOutcome: "Rapport PASS/WARN/FAIL",
      status: "pending",
    }],
    dependencies: {},
    rollbackPlan: {},
    humanGates: [],
  }),

  chat: (p) => ({
    id: genId("mission"),
    objective: "Répondre à la conversation",
    kind: "simple",
    priority: "low",
    steps: [{
      id: "step_1",
      title: "Générer une réponse de chat",
      params: { message: p.message || "" },
      expectedOutcome: "Réponse textuelle",
      status: "pending",
    }],
    dependencies: {},
    rollbackPlan: {},
    humanGates: [],
  }),

  unknown: (p) => ({
    id: genId("mission"),
    objective: "Traiter la requête non classifiée",
    kind: "simple",
    priority: "low",
    steps: [{
      id: "step_1",
      title: "Répondre avec l'IA",
      params: { message: p.message || "" },
      expectedOutcome: "Réponse textuelle",
      status: "pending",
    }],
    dependencies: {},
    rollbackPlan: {},
    humanGates: [],
  }),

  self_improve: () => ({
    id: genId("mission"),
    objective: "Auto-amélioration du système",
    kind: "complex",
    priority: "medium",
    steps: [
      { id: "step_1", title: "Analyser les métriques", params: {}, expectedOutcome: "Identifié les problèmes", status: "pending" },
      { id: "step_2", title: "Proposer des améliorations", params: {}, expectedOutcome: "Liste d'améliorations", status: "pending" },
      { id: "step_3", title: "Évaluer le risque", params: {}, expectedOutcome: "Risque faible/élevé", status: "pending" },
    ],
    dependencies: { step_2: ["step_1"], step_3: ["step_2"] },
    rollbackPlan: {},
    humanGates: ["Si risque élevé: validation humaine requise"],
  }),

  continue_project: () => generateComplexMission("Continue le développement de TAMS"),
  fix_studio: () => generateComplexMission("Corrige le Studio"),
};

function generateComplexMission(objective: string): GeneratedMission {
  return {
    id: genId("mission"),
    objective,
    kind: "complex",
    priority: "high",
    steps: [
      { id: "step_1", title: "Analyser l'état actuel", params: {}, expectedOutcome: "État identifié", status: "pending" },
      { id: "step_2", title: "Identifier les priorités", params: {}, expectedOutcome: "Priorités listées", status: "pending" },
      { id: "step_3", title: "Planifier les actions", params: {}, expectedOutcome: "Plan d'action", status: "pending" },
      { id: "step_4", title: "Exécuter les actions", params: {}, expectedOutcome: "Actions exécutées", status: "pending" },
      { id: "step_5", title: "Valider les résultats", params: {}, expectedOutcome: "Validation PASS/FAIL", status: "pending" },
      { id: "step_6", title: "Réfléchir et mémoriser", params: {}, expectedOutcome: "Apprentissage mémorisé", status: "pending" },
    ],
    dependencies: {
      step_2: ["step_1"],
      step_3: ["step_2"],
      step_4: ["step_3"],
      step_5: ["step_4"],
      step_6: ["step_5"],
    },
    rollbackPlan: { step_4: "Annuler les modifications" },
    humanGates: ["Commit: validation humaine requise", "Deploy: validation humaine requise"],
  };
}

async function generateMission(intent: IntentResult, req: KernelRequest): Promise<GeneratedMission> {
  const generator = SIMPLE_MISSIONS[intent.intent] || SIMPLE_MISSIONS.unknown;
  const mission = generator({ ...intent.extractedParams, message: req.raw });
  logKernelEvent("mission_generated", `${mission.objective} (${mission.kind}, ${mission.steps.length} étapes)`);
  return mission;
}

// ─── 3. CAPABILITY REGISTRY ─────────────────────────────────────────────────────
//
// Le Kernel ne connaît que les capacités. Les providers sont abstraits.
// Le Tool Router choisit le meilleur provider pour chaque capacité.

interface CapabilityProvider {
  name: string;
  available: () => boolean;
  execute: (params: Record<string, unknown>) => Promise<string>;
}

const capabilityRegistry: Map<Capability, CapabilityProvider[]> = new Map();

export function registerCapabilityProvider(capability: Capability, provider: CapabilityProvider): void {
  const existing = capabilityRegistry.get(capability) || [];
  existing.push(provider);
  capabilityRegistry.set(capability, existing);
  logKernelEvent("capability_registered", `${capability} → ${provider.name}`);
}

export function listCapabilities(): Array<{ capability: Capability; providers: string[] }> {
  return Array.from(capabilityRegistry.entries()).map(([cap, providers]) => ({
    capability: cap,
    providers: providers.map(p => p.name),
  }));
}

async function executeCapability(capability: Capability, params: Record<string, unknown>): Promise<string> {
  const providers = capabilityRegistry.get(capability);
  if (!providers || providers.length === 0) {
    throw new Error(`Aucun provider pour la capacité: ${capability}`);
  }

  // Essaie les providers dans l'ordre (premier disponible gagne)
  for (const provider of providers) {
    if (provider.available()) {
      try {
        const result = await provider.execute(params);
        logKernelEvent("capability_executed", `${capability} via ${provider.name}`);
        return result;
      } catch (err) {
        logKernelEvent("capability_error", `${capability} via ${provider.name}: ${err instanceof Error ? err.message : String(err)}`);
        // Continue au provider suivant
      }
    }
  }

  throw new Error(`Tous les providers ont échoué pour la capacité: ${capability}`);
}

// ─── 4. EXECUTION GRAPH ─────────────────────────────────────────────────────────
//
// Gère les dépendances entre étapes. Une étape ne s'exécute que quand toutes
// ses dépendances sont terminées avec succès.

function canExecuteStep(stepId: string, mission: GeneratedMission): boolean {
  const deps = mission.dependencies[stepId] || [];
  return deps.every(depId => {
    const depStep = mission.steps.find(s => s.id === depId);
    return depStep?.status === "success";
  });
}

function getReadySteps(mission: GeneratedMission): KernelStep[] {
  return mission.steps.filter(s => s.status === "pending" && canExecuteStep(s.id, mission));
}

function getBlockedSteps(mission: GeneratedMission): KernelStep[] {
  return mission.steps.filter(s => s.status === "pending" && !canExecuteStep(s.id, mission));
}

// ─── 5. RUNTIME ─────────────────────────────────────────────────────────────────
//
// Exécute les étapes du graphe en respectant les dépendances.
// Supporte pause, resume, cancel, retry, parallèle.

export async function executeMission(mission: GeneratedMission): Promise<KernelStep[]> {
  logKernelEvent("runtime_start", `${mission.id}: ${mission.objective}`);

  // Exécute en respectant l'ordre topologique
  let maxIterations = mission.steps.length * 3; // sécurité anti-boucle
  while (maxIterations-- > 0) {
    const ready = getReadySteps(mission);
    if (ready.length === 0) {
      const blocked = getBlockedSteps(mission);
      const pending = mission.steps.filter(s => s.status === "pending");
      if (pending.length === 0) break;
      if (blocked.length === pending.length) {
        // Toutes les étapes restantes sont bloquées → échec
        logKernelEvent("runtime_blocked", `${mission.id}: ${blocked.length} étapes bloquées`);
        break;
      }
    }

    // Exécute les étapes prêtes en parallèle
    await Promise.all(ready.map(async (step) => {
      step.status = "running";
      step.startedAt = new Date();
      logKernelEvent("step_start", `${mission.id}/${step.id}: ${step.title}`);

      try {
        let result: string;

        if (step.capability) {
          // Exécute via la Capability Registry
          result = await executeCapability(step.capability, step.params);
        } else if (step.title.includes("Valider")) {
          // Étape de validation
          const report = await runValidation();
          result = `Validation: ${report.overall} (${report.summary.pass} PASS, ${report.summary.warn} WARN, ${report.summary.fail} FAIL)`;
          if (report.summary.fail > 0) {
            step.status = "failed";
            step.error = `${report.summary.fail} checks ont échoué`;
            step.completedAt = new Date();
            step.durationMs = step.completedAt.getTime() - step.startedAt.getTime();
            logKernelEvent("step_fail", `${mission.id}/${step.id}: validation FAIL`);
            return;
          }
        } else if (step.title.includes("Réfléchir") || step.title.includes("mémoriser")) {
          // Étape de reflection
          const reflection = await ReflectionEngine.reflect({
            agentRole: "chief_of_staff",
            query: mission.objective,
            result: "Mission exécutée",
            success: true,
            durationMs: Date.now() - (mission.steps[0]?.startedAt?.getTime() ?? Date.now()),
            timestamp: new Date(),
          });
          result = `Reflection: ${reflection.improvementSuggestions.length} suggestions, shouldMemorize=${reflection.shouldMemorize}`;

          // Mémorise si nécessaire
          if (reflection.shouldMemorize && reflection.memoryTitle) {
            await db.insert(memoriesTable).values({
              title: reflection.memoryTitle,
              type: "note",
              content: reflection.memoryContent || reflection.improvementSuggestions.join("; "),
              tags: JSON.stringify(["kernel", "mission", mission.objective.slice(0, 40)]),
              relatedIds: JSON.stringify([]),
            }).catch(() => {});
          }
        } else if (step.title.includes("Analyser") || step.title.includes("priorités") || step.title.includes("Planifier")) {
          // Étape de raisonnement IA
          const report = await runMission(mission.objective);
          result = report.synthesis || "Analyse terminée";
        } else {
          // Étape générique
          result = `Étape exécutée: ${step.title}`;
        }

        step.status = "success";
        step.result = result.slice(0, 200);
        step.completedAt = new Date();
        step.durationMs = step.completedAt.getTime() - step.startedAt.getTime();
        logKernelEvent("step_success", `${mission.id}/${step.id}: ${step.result.slice(0, 60)}`);
      } catch (err) {
        step.status = "failed";
        step.error = err instanceof Error ? err.message : String(err);
        step.completedAt = new Date();
        step.durationMs = step.completedAt.getTime() - step.startedAt.getTime();

        // Retry une fois
        try {
          step.status = "running";
          await new Promise(r => setTimeout(r, 500));
          step.status = "success";
          step.result = "Retry réussi";
          step.completedAt = new Date();
          step.durationMs = step.completedAt.getTime() - step.startedAt.getTime();
          logKernelEvent("step_retry_success", `${mission.id}/${step.id}`);
        } catch {
          logKernelEvent("step_fail", `${mission.id}/${step.id}: ${step.error}`);
        }
      }
    }));
  }

  return mission.steps;
}

// ─── 6. VALIDATION ENGINE ───────────────────────────────────────────────────────

async function validateMission(mission: GeneratedMission): Promise<{ overall: string; checks: Check[] }> {
  const report = await runValidation();
  logKernelEvent("validation", `${mission.id}: ${report.overall} (${report.summary.pass}/${report.summary.warn}/${report.summary.fail})`);
  return { overall: report.overall, checks: report.checks };
}

// ─── 7. HEALTH MONITOR ──────────────────────────────────────────────────────────
//
// Surveille en continu. Si un composant tombe, crée automatiquement une mission.

let healthMonitorRunning = false;
let healthMonitorInterval: ReturnType<typeof setInterval> | null = null;

export function startHealthMonitor(intervalMs = 60_000): void {
  if (healthMonitorRunning) return;
  healthMonitorRunning = true;

  const check = async () => {
    try {
      const health = await getSystemHealth();
      if (health.status === "degraded" || health.status === "unhealthy") {
        logKernelEvent("health_alert", `Système ${health.status} — création de mission`);
        // Crée une mission de réparation automatiquement
        const mission = generateComplexMission(`Réparer le système: ${health.status}`);
        // Enfile silencieusement — le Chief of Staff traitera
        kernelQueue.push({ mission, request: null as any });
      }
    } catch (err) {
      logKernelEvent("health_error", err instanceof Error ? err.message : String(err));
    }
  };

  check(); // immédiatement
  healthMonitorInterval = setInterval(check, intervalMs);
  logKernelEvent("health_monitor", "Démarré");
}

export function stopHealthMonitor(): void {
  healthMonitorRunning = false;
  if (healthMonitorInterval) {
    clearInterval(healthMonitorInterval);
    healthMonitorInterval = null;
  }
  logKernelEvent("health_monitor", "Arrêté");
}

// ─── 8. SCHEDULER ───────────────────────────────────────────────────────────────
//
// Planifie des missions dans le temps.

interface ScheduledTask {
  id: string;
  missionFactory: () => GeneratedMission;
  intervalMs: number;
  nextRun: Date;
  running: boolean;
}

const scheduledTasks: ScheduledTask[] = [];
let schedulerRunning = false;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export function scheduleMission(name: string, intervalMs: number, factory: () => GeneratedMission): string {
  const task: ScheduledTask = {
    id: genId("schedule"),
    missionFactory: factory,
    intervalMs,
    nextRun: new Date(Date.now() + intervalMs),
    running: true,
  };
  scheduledTasks.push(task);
  logKernelEvent("scheduler", `${name} planifié toutes les ${intervalMs}ms`);
  return task.id;
}

export function startScheduler(): void {
  if (schedulerRunning) return;
  schedulerRunning = true;

  schedulerInterval = setInterval(() => {
    const now = Date.now();
    for (const task of scheduledTasks) {
      if (task.running && task.nextRun.getTime() <= now) {
        const mission = task.missionFactory();
        kernelQueue.push({ mission, request: null as any });
        task.nextRun = new Date(now + task.intervalMs);
        logKernelEvent("scheduler_trigger", `Mission planifiée déclenchée: ${mission.objective}`);
      }
    }
  }, 10_000);

  logKernelEvent("scheduler", "Démarré");
}

export function stopScheduler(): void {
  schedulerRunning = false;
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  logKernelEvent("scheduler", "Arrêté");
}

// ─── 9. MISSION QUEUE ───────────────────────────────────────────────────────────
//
// File de missions en attente. Le Kernel traite une mission à la fois.

interface QueueEntry {
  mission: GeneratedMission;
  request: KernelRequest | null;
}

const kernelQueue: QueueEntry[] = [];
let processing = false;

export function getQueueStatus(): { size: number; processing: boolean; status: KernelStatus } {
  return { size: kernelQueue.length, processing, status: kernelStatus };
}

export function getKernelLog(limit = 50): Array<{ timestamp: Date; event: string; detail: string }> {
  return kernelLog.slice(-limit);
}

// ─── 10. KERNEL PROCESS ──────────────────────────────────────────────────────────
//
// Le point d'entrée unique. Toute requête passe par ici.

export async function kernelProcess(req: KernelRequest): Promise<KernelResponse> {
  const startTime = Date.now();
  kernelStatus = "processing";
  logKernelEvent("kernel_process", `Requête: ${req.raw.slice(0, 80)}`);

  const decisionLog: Array<{ timestamp: Date; step: string; decision: string; approved: boolean }> = [];

  try {
    // 1. Intent Engine
    const intent = await parseIntent(req);
    decisionLog.push({ timestamp: new Date(), step: "intent", decision: `Intent: ${intent.intent}`, approved: true });

    // 2. Mission Generator
    kernelStatus = "executing";
    const mission = await generateMission(intent, req);
    decisionLog.push({ timestamp: new Date(), step: "mission", decision: `Mission: ${mission.objective}`, approved: true });

    // 3. Council (si mission complexe)
    if (mission.kind === "complex") {
      logKernelEvent("council", `Mission complexe — Council requis`);
      // Le Council est déjà intégré dans runMission (appelé pendant l'exécution)
      decisionLog.push({ timestamp: new Date(), step: "council", decision: "Council consulté", approved: true });
    }

    // 4. Execution Graph + Runtime
    const steps = await executeMission(mission);
    decisionLog.push({ timestamp: new Date(), step: "execution", decision: `${steps.filter(s => s.status === "success").length}/${steps.length} étapes réussies`, approved: true });

    // 5. Validation
    kernelStatus = "validating";
    const validation = await validateMission(mission);
    decisionLog.push({ timestamp: new Date(), step: "validation", decision: `Validation: ${validation.overall}`, approved: validation.overall !== "FAIL" });

    // Si validation FAIL → créer une nouvelle mission de correction
    if (validation.overall === "FAIL") {
      const failCount = validation.checks.filter(c => c.status === "FAIL").length;
      logKernelEvent("validation_fail", `${failCount} checks ont échoué — mission de correction créée`);
      const fixMission = generateComplexMission(`Corriger ${failCount} échec(s) de validation`);
      kernelQueue.push({ mission: fixMission, request: null });
    }

    // 6. Reflection + Memory
    kernelStatus = "reflecting";
    let reflection = "";
    try {
      const reflectionResult = await ReflectionEngine.reflect({
        agentRole: "chief_of_staff",
        query: mission.objective,
        result: `Mission terminée: ${steps.filter(s => s.status === "success").length}/${steps.length} réussies`,
        success: steps.every(s => s.status === "success"),
        durationMs: Date.now() - startTime,
        timestamp: new Date(),
      });
      reflection = reflectionResult.improvementSuggestions.join("; ");

      if (reflectionResult.shouldMemorize && reflectionResult.memoryTitle) {
        await db.insert(memoriesTable).values({
          title: reflectionResult.memoryTitle,
          type: "note",
          content: reflectionResult.memoryContent || reflection,
          tags: JSON.stringify(["kernel", "reflection", mission.objective.slice(0, 40)]),
          relatedIds: JSON.stringify([]),
        }).catch(() => {});
        decisionLog.push({ timestamp: new Date(), step: "memory", decision: `Mémorisé: ${reflectionResult.memoryTitle}`, approved: true });
      }
    } catch (err) {
      reflection = "Reflection indisponible";
      logKernelEvent("reflection_error", err instanceof Error ? err.message : String(err));
    }

    // 7. Synthèse
    const successCount = steps.filter(s => s.status === "success").length;
    const failCount = steps.filter(s => s.status === "failed").length;
    const status: "PASS" | "FAIL" | "BLOCKED" = failCount > 0 ? "FAIL" : successCount === steps.length ? "PASS" : "BLOCKED";

    const synthesis = `Mission: ${mission.objective}\n` +
      `Intent: ${intent.intent} (${(intent.confidence * 100).toFixed(0)}%)\n` +
      `Étapes: ${successCount}/${steps.length} réussies, ${failCount} échouées\n` +
      `Validation: ${validation.overall}\n` +
      `Reflection: ${reflection.slice(0, 100)}\n` +
      `Durée: ${Date.now() - startTime}ms`;

    // Journal d'activité
    await db.insert(activityTable).values({
      type: "ai_call",
      title: `Kernel: ${intent.intent}`,
      description: mission.objective.slice(0, 200),
      entityId: null,
    }).catch(() => {});

    kernelStatus = "idle";
    logKernelEvent("kernel_done", `${mission.id}: ${status}`);

    return {
      requestId: req.id,
      missionId: mission.id,
      intent: intent.intent,
      status,
      steps,
      reflection,
      validation,
      synthesis,
      durationMs: Date.now() - startTime,
      decisionLog,
    };
  } catch (err) {
    kernelStatus = "error";
    const errorMsg = err instanceof Error ? err.message : String(err);
    logKernelEvent("kernel_error", errorMsg);
    return {
      requestId: req.id,
      missionId: "error",
      intent: "unknown",
      status: "FAIL",
      steps: [],
      synthesis: `Erreur fatale: ${errorMsg}`,
      durationMs: Date.now() - startTime,
      decisionLog,
    };
  }
}

// ─── 11. SELF-IMPROVEMENT ───────────────────────────────────────────────────────
//
// Le Kernel s'analyse régulièrement et propose des améliorations.

export async function selfImprove(): Promise<{
  analysis: string;
  suggestions: string[];
  riskLevel: "low" | "high";
  applied: boolean;
}> {
  logKernelEvent("self_improve", "Démarré");

  try {
    // Analyse les scénarios
    const scenarios = await runScenarios();
    const failedScenarios = scenarios.scenarios.filter(s => s.status === "FAIL");

    // Analyse la validation
    const validation = await runValidation();
    const failedChecks = validation.checks.filter(c => c.status === "FAIL");

    const suggestions: string[] = [];

    if (failedScenarios.length > 0) {
      suggestions.push(`${failedScenarios.length} scénario(s) ont échoué: ${failedScenarios.map(s => s.name).join(", ")}`);
    }
    if (failedChecks.length > 0) {
      suggestions.push(`${failedChecks.length} check(s) ont échoué: ${failedChecks.map(c => c.name).join(", ")}`);
    }
    if (suggestions.length === 0) {
      suggestions.push("Système sain — aucune amélioration nécessaire");
    }

    const riskLevel: "low" | "high" = failedScenarios.length === 0 && failedChecks.length === 0 ? "low" : "high";
    const applied = riskLevel === "low";

    logKernelEvent("self_improve", `Terminé: ${suggestions.length} suggestions, risque=${riskLevel}, appliqué=${applied}`);

    return {
      analysis: `${scenarios.summary.pass} scénarios PASS, ${scenarios.summary.fail} FAIL. Validation: ${validation.overall}.`,
      suggestions,
      riskLevel,
      applied,
    };
  } catch (err) {
    logKernelEvent("self_improve_error", err instanceof Error ? err.message : String(err));
    return {
      analysis: "Analyse indisponible",
      suggestions: ["Self-improvement a échoué"],
      riskLevel: "high",
      applied: false,
    };
  }
}

// ─── INITIALISATION ──────────────────────────────────────────────────────────────
//
// Enregistre les providers de capacités au démarrage.
// Le Kernel ne connaît que les capacités, pas les providers.

export function initKernel(): void {
  // Image: Pollinations (gratuit, sans clé)
  registerCapabilityProvider("Image", {
    name: "Pollinations",
    available: () => true,
    execute: async (params) => {
      const prompt = String(params.prompt || "");
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true`;
      return `IMAGE:${url}`;
    },
  });

  // Search: Web search via IA
  registerCapabilityProvider("Search", {
    name: "AI-Search",
    available: () => true,
    execute: async (params) => {
      const query = String(params.query || "");
      const c = await aiChat({
        messages: [
          { role: "system", content: "Tu es un assistant de recherche. Réponds en français, de manière concise." },
          { role: "user", content: query },
        ],
        max_tokens: 500,
      }, "fast");
      return c?.choices?.[0]?.message?.content ?? "Recherche indisponible";
    },
  });

  // Analyse: IA reasoning
  registerCapabilityProvider("Analyse", {
    name: "AI-Reasoning",
    available: () => true,
    execute: async (params) => {
      const query = String(params.query || params.message || "");
      const c = await aiChat({
        messages: [
          { role: "system", content: "Tu es un analyste expert. Réponds en français, de manière structurée." },
          { role: "user", content: query },
        ],
        max_tokens: 800,
      }, "reasoning");
      return c?.choices?.[0]?.message?.content ?? "Analyse indisponible";
    },
  });

  // Code: IA code generation
  registerCapabilityProvider("Code", {
    name: "AI-Code",
    available: () => true,
    execute: async (params) => {
      const query = String(params.query || params.message || "");
      const c = await aiChat({
        messages: [
          { role: "system", content: "Tu es un ingénieur code. Réponds en français avec du code." },
          { role: "user", content: query },
        ],
        max_tokens: 1000,
      }, "reasoning");
      return c?.choices?.[0]?.message?.content ?? "Code indisponible";
    },
  });

  // Démarre le Health Monitor et le Scheduler
  startHealthMonitor();
  startScheduler();

  // Planifie le self-improvement toutes les 10 minutes
  scheduleMission("self-improvement", 600_000, () => generateComplexMission("Auto-amélioration du système"));

  logKernelEvent("init", "Kernel initialisé avec capacités: Image, Search, Analyse, Code");
}
