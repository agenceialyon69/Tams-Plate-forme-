/**
 * Agent System Types
 * Core types for the multi-agent architecture
 *
 * L'organisation autonome de TAMS :
 *
 *   Chief of Staff
 *       ↓
 *   Mission Planner → Architect → Product → Research
 *       ↓
 *   Code Engineer → DevOps → QA → Security → Red Team
 *       ↓
 *   Reflection → Memory Manager → Chief of Staff (boucle)
 *
 * Chaque agent a des droits limités, des critères de validation,
 * et ne peut pas contourner les portes de validation humaine.
 */

// ─── Rôles de l'organisation ─────────────────────────────────────────────────

export type AgentRole =
  | "chief_of_staff"    // Orchestration exécutive + synthèse
  | "planning"          // Décomposition d'objectifs + priorisation
  | "architect"         // Garant de la Constitution + contraintes
  | "product"           // Vision produit + priorisation utilisateur
  | "research"          // Recherche + synthèse d'information
  | "engineering"       // Code & analyse technique
  | "devops"            // Infrastructure + déploiement
  | "qa"                // Tests + validation + non-régression
  | "security"          // Sécurité + permissions + audit
  | "red_team"          // Critique + risk analysis + challenge
  | "reflection"        // Auto-critique + apprentissage
  | "memory"            // Gestion de la mémoire + knowledge graph
  | "decision"          // Analyse de décisions + scoring
  | "business"          // Stratégie business
  | "marketing"         // Contenu + positionnement
  | "studio";           // Génération créative (image, vidéo, audio)

// ─── Capacités ───────────────────────────────────────────────────────────────

export type AgentCapability =
  | "analyze"       // Lire et analyser
  | "create"        // Créer des items
  | "update"        // Modifier des items
  | "delete"        // Supprimer (jamais sur code critique)
  | "search"        // Rechercher interne/externe
  | "generate"      // Générer du contenu
  | "delegate"      // Déléguer à d'autres agents
  | "monitor"       // Surveiller et alerter
  | "validate"      // Valider le travail d'autres agents
  | "deploy";       // Déployer (porte humaine obligatoire)

// ─── Niveaux de permission ──────────────────────────────────────────────────

export type PermissionLevel =
  | "read_only"        // Analyse, recherche, critique
  | "write_db"         // Créer/modifier en DB (tasks, memories, decisions)
  | "write_code"       // Proposer du code (jamais committer directement)
  | "deploy";          // Déployer (JAMAIS sans validation humaine)

// ─── Outils ──────────────────────────────────────────────────────────────────

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
  /** Timeout en ms pour cet outil (défaut: 30s) */
  timeoutMs?: number;
  /** Nombre de retries en cas d'échec (défaut: 1) */
  retries?: number;
  /** Si true, l'outil peut modifier l'état et nécessite un rollback */
  hasSideEffects?: boolean;
}

// ─── Agent ───────────────────────────────────────────────────────────────────

export interface Agent {
  role: AgentRole;
  name: string;
  description: string;
  capabilities: AgentCapability[];
  tools: AgentTool[];
  permissionLevel: PermissionLevel;
  systemPrompt: string;
  fallbackResponse: string;
  /** Critères de validation que cet agent doit vérifier */
  validationCriteria: string[];
  /** Métriques de performance (remplies au runtime) */
  metrics?: AgentMetrics;
}

export interface AgentMetrics {
  totalMissions: number;
  successRate: number;
  avgDurationMs: number;
  lastUsed: Date | null;
}

// ─── Contexte ────────────────────────────────────────────────────────────────

export interface AgentContext {
  userId?: string;
  conversationId?: number;
  projectId?: number;
  taskId?: number;
  decisionId?: number;
  memoryId?: number;
  contactId?: number;
  missionId?: string;
  customContext?: Record<string, unknown>;
}

export interface AgentResponse {
  content: string;
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
    result: string;
  }>;
  delegatedTo?: AgentRole;
  confidence?: number;
  reasoning?: string;
}

// ─── Runtime de mission ──────────────────────────────────────────────────────

export type MissionStatus =
  | "pending"       // En attente de démarrage
  | "analyzing"     // Phase d'analyse
  | "planning"      // Phase de planification
  | "architecting"  // Phase d'architecture
  | "executing"     // Exécution des étapes
  | "reviewing"     // Red Team + QA
  | "validating"    // Validation finale
  | "reflecting"    // Reflection + apprentissage
  | "completed"     // Terminée avec succès
  | "failed"        // Échec
  | "cancelled"     // Annulée
  | "blocked";      // Bloquée (porte humaine)

export type MissionPriority = "low" | "medium" | "high" | "critical";

export interface MissionStep {
  id: string;
  role: AgentRole;
  title: string;
  rationale?: string;
  status: "pending" | "running" | "success" | "failed" | "skipped" | "blocked";
  result?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  /** Si true, nécessite une validation humaine avant de passer à la suite */
  humanGate?: boolean;
  /** Étape à exécuter si celle-ci échoue */
  rollbackAction?: string;
}

export interface Mission {
  id: string;
  objective: string;
  priority: MissionPriority;
  status: MissionStatus;
  steps: MissionStep[];
  currentStep: number;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  /** Journal de toutes les décisions prises pendant la mission */
  decisionLog: DecisionLogEntry[];
  /** Rapport de reflection post-mission */
  reflection?: string;
  /** Portes de validation humaine en attente */
  pendingHumanGates: string[];
  /** Erreur fatale si la mission a échoué */
  fatalError?: string;
}

export interface DecisionLogEntry {
  timestamp: Date;
  agent: AgentRole;
  decision: string;
  rationale: string;
  approved: boolean;
}

export interface AgentRegistry {
  getAgent(role: AgentRole): Agent | undefined;
  getAllAgents(): Agent[];
  getAgentsForCapability(capability: AgentCapability): Agent[];
  getAgentsByPermission(permission: PermissionLevel): Agent[];
}
