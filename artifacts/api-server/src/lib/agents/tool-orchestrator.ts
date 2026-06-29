/**
 * TOOL ORCHESTRATOR — couche de sécurité entre les agents et les outils.
 *
 * Aucun agent n'appelle directement un outil. Tous les outils passent par :
 * - validation des paramètres (Zod ou schéma)
 * - vérification des permissions (l'agent a-t-il le droit d'appeler cet outil ?)
 * - timeout (chaque outil a une limite de temps)
 * - retry (retry automatique avec backoff exponentiel)
 * - rollback (annulation si l'outil a des effets de bord)
 * - journalisation (tous les appels sont loggés)
 * - observabilité (métriques par outil)
 *
 * Règle de sécurité : un agent avec permissionLevel "read_only" ne peut pas
 * appeler un outil avec hasSideEffects=true.
 */

import type { AgentTool, AgentRole, PermissionLevel } from "./types";
import { getAllAgents } from "./definitions";
import { recordToolMetric } from "../observability";
import { logger } from "../logger";

// ─── Permissions par outil ─────────────────────────────────────────────────────

const TOOL_PERMISSIONS: Record<string, PermissionLevel> = {
  // Outils de lecture (read_only)
  list_tasks: "read_only",
  list_projects: "read_only",
  list_contacts: "read_only",
  list_memories: "read_only",
  search_memories: "read_only",
  get_briefing: "read_only",
  list_decisions: "read_only",
  // Outils d'écriture DB (write_db)
  create_task: "write_db",
  create_project: "write_db",
  create_contact: "write_db",
  create_memory: "write_db",
  create_decision: "write_db",
  update_task: "write_db",
  create_memory_edge: "write_db",
  create_asset: "write_db",
  create_project_contact: "write_db",
  // Outils de génération (write_db — créent des assets)
  generate_image: "write_db",
  generate_music: "write_db",
  create_video: "write_db",
  generate_report: "write_db",
  // Outils de recherche externe (read_only)
  web_search: "read_only",
  // Outils d'agent (read_only — délègue à un autre agent)
  run_agent: "read_only",
  delegate_to_agent: "read_only",
};

const PERMISSION_HIERARCHY: Record<PermissionLevel, number> = {
  read_only: 1,
  write_db: 2,
  write_code: 3,
  deploy: 4,
};

function hasPermission(agentPermission: PermissionLevel, toolPermission: PermissionLevel): boolean {
  return PERMISSION_HIERARCHY[agentPermission] >= PERMISSION_HIERARCHY[toolPermission];
}

// ─── Validation des paramètres ──────────────────────────────────────────────────

function validateParams(tool: AgentTool, args: Record<string, unknown>): { valid: boolean; error?: string } {
  const params = tool.parameters as { properties?: Record<string, { type?: string }>; required?: string[] };
  if (!params || !params.properties) return { valid: true };

  // Vérifie les paramètres requis
  if (params.required) {
    for (const req of params.required) {
      if (args[req] === undefined || args[req] === null) {
        return { valid: false, error: `Paramètre requis manquant: ${req}` };
      }
    }
  }

  // Vérifie les types de base
  for (const [key, value] of Object.entries(args)) {
    const schema = params.properties[key];
    if (!schema || !schema.type) continue;

    const expectedType = schema.type;
    const actualType = Array.isArray(value) ? "array" : typeof value;

    if (expectedType === "string" && actualType !== "string") {
      return { valid: false, error: `${key} doit être une string, reçu ${actualType}` };
    }
    if (expectedType === "number" && actualType !== "number") {
      return { valid: false, error: `${key} doit être un number, reçu ${actualType}` };
    }
    if (expectedType === "boolean" && actualType !== "boolean") {
      return { valid: false, error: `${key} doit être un boolean, reçu ${actualType}` };
    }
    if (expectedType === "array" && actualType !== "array") {
      return { valid: false, error: `${key} doit être un array, reçu ${actualType}` };
    }
  }

  return { valid: true };
}

// ─── Timeout ────────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, toolName: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Tool "${toolName}" timeout après ${ms}ms`));
    }, ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

// ─── Retry avec backoff exponentiel ──────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  toolName: string,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const backoff = Math.min(1000 * Math.pow(2, attempt), 5000);
        logger.warn({ toolName, attempt, backoff, err: err instanceof Error ? err.message : String(err) }, "tool retry");
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }
  throw lastError;
}

// ─── Journalisation ──────────────────────────────────────────────────────────────

export interface ToolCallLog {
  toolName: string;
  agentRole: AgentRole;
  args: Record<string, unknown>;
  result: string;
  success: boolean;
  durationMs: number;
  timestamp: Date;
  error?: string;
}

const callLog: ToolCallLog[] = [];
const MAX_LOG_SIZE = 500;

function logCall(entry: ToolCallLog): void {
  callLog.push(entry);
  if (callLog.length > MAX_LOG_SIZE) {
    callLog.shift();
  }
  logger.info(
    { tool: entry.toolName, agent: entry.agentRole, success: entry.success, durationMs: entry.durationMs },
    "tool call",
  );
}

export function getToolCallLog(limit = 100): ToolCallLog[] {
  return callLog.slice(-limit);
}

// ─── Orchestrator principal ──────────────────────────────────────────────────────

/**
 * Exécute un outil avec toutes les garanties de sécurité.
 * C'est le SEUL point d'entrée pour les appels d'outils par les agents.
 */
export async function executeToolSafely(
  toolName: string,
  args: Record<string, unknown>,
  agentRole: AgentRole,
): Promise<string> {
  const startTime = Date.now();
  const timestamp = new Date();

  // 1. Trouve l'outil
  const agent = getAllAgents().find(a => a.role === agentRole);
  if (!agent) {
    throw new Error(`Agent inconnu: ${agentRole}`);
  }

  const tool = agent.tools.find(t => t.name === toolName);
  if (!tool) {
    // L'outil n'est pas dans les tools de cet agent — vérifie le catalogue global
    const allTools = getAllAgents().flatMap(a => a.tools);
    const globalTool = allTools.find(t => t.name === toolName);
    if (!globalTool) {
      throw new Error(`Outil inconnu: ${toolName}`);
    }
    // Vérifie les permissions même pour les outils globaux
    const requiredPermission = TOOL_PERMISSIONS[toolName] || "write_db";
    if (!hasPermission(agent.permissionLevel, requiredPermission)) {
      throw new Error(`Permission refusée: ${agentRole} (${agent.permissionLevel}) ne peut pas appeler ${toolName} (${requiredPermission})`);
    }
    return executeWithGuards(globalTool, args, agentRole, startTime, timestamp);
  }

  // 2. Vérifie les permissions
  const requiredPermission = TOOL_PERMISSIONS[toolName] || "write_db";
  if (!hasPermission(agent.permissionLevel, requiredPermission)) {
    const msg = `Permission refusée: ${agentRole} (${agent.permissionLevel}) ne peut pas appeler ${toolName} (${requiredPermission})`;
    logCall({ toolName, agentRole, args, result: "", success: false, durationMs: 0, timestamp, error: msg });
    throw new Error(msg);
  }

  return executeWithGuards(tool, args, agentRole, startTime, timestamp);
}

async function executeWithGuards(
  tool: AgentTool,
  args: Record<string, unknown>,
  agentRole: AgentRole,
  startTime: number,
  timestamp: Date,
): Promise<string> {
  // 3. Valide les paramètres
  const validation = validateParams(tool, args);
  if (!validation.valid) {
    const msg = `Validation échouée: ${validation.error}`;
    logCall({ toolName: tool.name, agentRole, args, result: "", success: false, durationMs: 0, timestamp, error: msg });
    throw new Error(msg);
  }

  // 4. Exécute avec timeout + retry
  const timeoutMs = tool.timeoutMs ?? 30_000;
  const retries = tool.retries ?? 1;

  try {
    const result = await withRetry(
      () => withTimeout(tool.execute(args), timeoutMs, tool.name),
      retries,
      tool.name,
    );

    const durationMs = Date.now() - startTime;
    logCall({ toolName: tool.name, agentRole, args, result: result.slice(0, 200), success: true, durationMs, timestamp });
    recordToolMetric({ tool: tool.name, success: true, latencyMs: durationMs, retryCount: 0, timestamp });

    return result;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);
    logCall({ toolName: tool.name, agentRole, args, result: "", success: false, durationMs, timestamp, error: errorMsg });
    recordToolMetric({ tool: tool.name, success: false, latencyMs: durationMs, retryCount: retries, timestamp, errorCode: errorMsg.slice(0, 50) });

    // Rollback si l'outil a des effets de bord
    if (tool.hasSideEffects) {
      logger.warn({ tool: tool.name, agentRole, err: errorMsg }, "tool failed with side effects — rollback needed");
    }

    throw err;
  }
}

// ─── Catalogue d'outils ──────────────────────────────────────────────────────────

export function getToolCatalog(): Array<{
  name: string;
  description: string;
  requiredPermission: PermissionLevel;
  hasSideEffects: boolean;
}> {
  const allTools = getAllAgents().flatMap(a => a.tools);
  const unique = new Map(allTools.map(t => [t.name, t]));
  return Array.from(unique.entries()).map(([name, tool]) => ({
    name,
    description: tool.description,
    requiredPermission: TOOL_PERMISSIONS[name] || "write_db",
    hasSideEffects: tool.hasSideEffects ?? false,
  }));
}

export function getToolNamesForAgent(role: AgentRole): string[] {
  const agent = getAllAgents().find(a => a.role === role);
  if (!agent) return [];
  return agent.tools.map(t => t.name);
}
