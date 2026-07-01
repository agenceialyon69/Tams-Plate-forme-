/**
 * Kernel Types
 *
 * Shared type definitions for the TAMS Kernel.
 * Extracted from kernel/index.ts for reuse across kernel modules.
 */

// ─── INTENT ────────────────────────────────────────────────────────────────────

export type Intent =
  | "chat"               // Conversation simple
  | "create_task"        // Créer une tâche
  | "create_project"     // Créer un projet
  | "generate_image"     // Générer une image
  | "generate_video"     // Générer une vidéo
  | "generate_music"     // Générer de la musique
  | "search_memory"      // Rechercher en mémoire
  | "make_decision"      // Prendre une décision (Red Team / Council)
  | "continue_project"   // Continuer le projet (mission complexe)
  | "fix_studio"         // Corriger le Studio (mission complexe)
  | "system_health"      // Vérifier la santé du système
  | "self_improve"       // Auto-amélioration
  | "general_chat"       // Alias chat standard
  | "decision_red_team"  // Analyse Red Team
  | "studio_create"      // Création Studio
  | "project_plan"       // Plan de projet
  | "task_create"        // Création de tâche
  | "memory_query"       // Requête mémoire
  | "repo_audit"         // Audit de repo (Dev Runtime)
  | "system_check"       // Vérification système
  | "provider_status"    // Statut des providers
  | "unknown";           // Non classifié

export type Capability =
  | "Image" | "Video" | "Music" | "Voice" | "Publish"
  | "Search" | "Analyse" | "Code" | "Git" | "Deploy";

export type MissionKind =
  | "simple"    // Une seule action
  | "complex";  // Multi-étapes avec dépendances

export type KernelStatus =
  | "idle"       // En attente
  | "processing" // Traite une requête
  | "executing"  // Exécute une mission
  | "validating" // Valide les résultats
  | "reflecting" // Réfléchit après exécution
  | "error";     // Erreur

export type RiskLevel = "none" | "low" | "medium" | "high" | "critical";

export type PermissionMode =
  | "read_only"         // Lecture seule, zéro modification
  | "propose_patch"     // Peut proposer, ne commit pas
  | "apply_safe_patch"  // Peut appliquer des patches sûrs
  | "commit_candidate"  // Peut committer sur branche dédiée
  | "deploy_check";     // Peut vérifier la config Railway

// ─── KERNEL REQUEST ────────────────────────────────────────────────────────────

export interface KernelRequest {
  id: string;
  raw: string;           // Requête brute de l'utilisateur
  userId?: string;
  conversationId?: number;
  timestamp: Date;
}

// ─── INTENT ENGINE ─────────────────────────────────────────────────────────────

export interface IntentResult {
  intent: Intent;
  domain: string;           // Domaine principal (studio, memory, system, dev...)
  confidence: number;       // 0.0 - 1.0
  riskLevel: RiskLevel;     // Risque estimé de la requête
  requiredPermission: PermissionMode; // Permission minimale requise
  missionKind: MissionKind;
  extractedParams: Record<string, unknown>;
  reasoning: string;
  recommendedCapability?: string;  // Capability principale recommandée
  providerCandidates: string[];    // Providers adaptés (free-first)
  executionMode: "direct" | "plan_first" | "council" | "human_gate";
  userFacingExplanation: string;   // Explication claire pour l'utilisateur
  missingPrerequisites: string[];  // Ce qui manque pour exécuter
}

// ─── MISSION ───────────────────────────────────────────────────────────────────

export interface KernelStep {
  id: string;
  capability?: Capability;
  agentRole?: string;
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

// ─── KERNEL RESPONSE ───────────────────────────────────────────────────────────

export interface Check {
  name: string;
  status: "PASS" | "WARN" | "FAIL";
  detail?: string;
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

// ─── ROUTE-INTENT RESPONSE ─────────────────────────────────────────────────────
//
// Returned by POST /api/kernel/route-intent

export interface RouteIntentResponse {
  intent: Intent;
  domain: string;
  confidence: number;
  riskLevel: RiskLevel;
  requiredPermission: PermissionMode;
  missionKind: MissionKind;
  recommendedCapability?: string;
  providerCandidates: string[];
  executionMode: "direct" | "plan_first" | "council" | "human_gate";
  userFacingExplanation: string;
  missingPrerequisites: string[];
  suggestedMode: string;      // Chat OS mode suggéré (chat, decision, red_team...)
  suggestedAction?: string;   // Action pré-remplie pour le chat
  canExecuteNow: boolean;     // true si tous les prérequis sont réunis
  reasoning: string;
}
