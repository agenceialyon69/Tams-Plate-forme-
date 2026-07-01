/**
 * Permission Layer
 *
 * Enforces permission checks before any capability execution.
 * Returns whether an action is allowed and what's missing.
 */

import type { PermissionMode, RiskLevel, Intent } from "./kernel-types.js";

export interface PermissionCheck {
  allowed: boolean;
  reason: string;
  requiredMode: PermissionMode;
  actualMode: PermissionMode;
  missingConditions: string[];
}

// Ordered from least to most permissive
const PERMISSION_ORDER: PermissionMode[] = [
  "read_only",
  "propose_patch",
  "apply_safe_patch",
  "commit_candidate",
  "deploy_check",
];

function hasPermission(actual: PermissionMode, required: PermissionMode): boolean {
  return PERMISSION_ORDER.indexOf(actual) >= PERMISSION_ORDER.indexOf(required);
}

const DANGEROUS_INTENTS = new Set<Intent>([
  "fix_studio",
  "continue_project",
  "repo_audit",
]);

const RUNTIME_REQUIRED_INTENTS = new Set<Intent>([
  "fix_studio",
  "continue_project",
  "repo_audit",
]);

export function checkPermission(
  intent: Intent,
  requiredPermission: PermissionMode,
  riskLevel: RiskLevel,
  context: {
    runtimeEnabled: boolean;
    userPermissionMode: PermissionMode;
    unsafeActionsEnabled: boolean;
  },
): PermissionCheck {
  const missing: string[] = [];

  // Runtime check
  if (RUNTIME_REQUIRED_INTENTS.has(intent) && !context.runtimeEnabled) {
    missing.push("Dev Runtime désactivé (TAMS_DEV_RUNTIME_ENABLED=true requis)");
  }

  // Unsafe actions check — hardcoded false, never overridable
  if (riskLevel === "critical" || riskLevel === "high") {
    if (!context.unsafeActionsEnabled) {
      missing.push("Actions dangereuses désactivées (ENABLE_UNSAFE_RUNTIME_ACTIONS est hardcodé à false)");
    }
  }

  // Permission mode check
  if (!hasPermission(context.userPermissionMode, requiredPermission)) {
    missing.push(
      `Mode ${context.userPermissionMode} insuffisant — ${requiredPermission} requis`,
    );
  }

  const allowed = missing.length === 0;

  return {
    allowed,
    reason: allowed
      ? "Permission accordée"
      : `Permission refusée: ${missing[0]}`,
    requiredMode: requiredPermission,
    actualMode: context.userPermissionMode,
    missingConditions: missing,
  };
}

export function getEffectivePermissionMode(
  runtimeEnabled: boolean,
  unsafeActionsEnabled: boolean,
): PermissionMode {
  if (!runtimeEnabled) return "read_only";
  if (!unsafeActionsEnabled) return "propose_patch";
  return "apply_safe_patch";
}
