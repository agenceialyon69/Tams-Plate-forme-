import { randomUUID } from "node:crypto";
import {
  RepositoryIntelligence,
  RepositoryTools,
  TaskExecutionEngine,
  type RepositoryAnalysis,
  type ValidationReport,
} from "./dev-runtime";

export type PermissionMode =
  | "read_only"
  | "propose_patch"
  | "apply_safe_patch"
  | "commit_candidate"
  | "deploy_check";

export type EngineeringStrategy =
  | "repo_audit"
  | "docs_update"
  | "test_generation"
  | "safe_code_patch"
  | "debug_from_failure"
  | "runtime_validation"
  | "security_refusal";

export interface ExecutionBudget {
  maxFiles: number;
  maxCommands: number;
  maxDurationMs: number;
  maxRetries: 3;
  maxDiffBytes: number;
}

export interface ChatEngineeringRequest {
  actorId?: string;
  objective: string;
  mode?: PermissionMode;
  strategy?: EngineeringStrategy;
  targetFile?: string;
  content?: string;
  healthUrl?: string;
}

export interface EngineeringTask {
  id: string;
  actorId: string;
  objective: string;
  mode: PermissionMode;
  strategy: EngineeringStrategy;
  status: "Queued" | "Analyzing" | "Planned" | "Executing" | "Validating" | "Completed" | "Failed" | "ApprovalRequired" | "Refused";
  budget: ExecutionBudget;
  impactedFiles: string[];
  plan: string[];
  logs: Array<{ at: string; event: string; detail: string }>;
  security: { allowed: boolean; reason: string };
  diff: string;
  report: {
    verdict: "PASS" | "FAIL" | "REFUSED" | "APPROVAL_REQUIRED";
    summary: string;
    validation?: ValidationReport;
    analysis?: RepositoryAnalysis;
    limitations: string[];
  };
}

const DEFAULT_BUDGETS: Record<PermissionMode, ExecutionBudget> = {
  read_only: { maxFiles: 0, maxCommands: 0, maxDurationMs: 30_000, maxRetries: 3, maxDiffBytes: 0 },
  propose_patch: { maxFiles: 0, maxCommands: 0, maxDurationMs: 60_000, maxRetries: 3, maxDiffBytes: 20_000 },
  apply_safe_patch: { maxFiles: 1, maxCommands: 6, maxDurationMs: 900_000, maxRetries: 3, maxDiffBytes: 30_000 },
  commit_candidate: { maxFiles: 3, maxCommands: 8, maxDurationMs: 900_000, maxRetries: 3, maxDiffBytes: 50_000 },
  deploy_check: { maxFiles: 0, maxCommands: 5, maxDurationMs: 900_000, maxRetries: 3, maxDiffBytes: 0 },
};

const CRITICAL_PATHS = [
  "AGENTS.md",
  "railway.toml",
  "nixpacks.toml",
  ".env",
  ".env.example",
  ".github/workflows/",
  ".tams/guardian/",
  "supabase/migrations/",
  "lib/db/src/schema/",
];

function timestamp(): string {
  return new Date().toISOString();
}

function isDangerousObjective(objective: string): string | null {
  const value = objective.toLowerCase();
  if (/push(?:er)?\s+(?:sur\s+)?main|merge(?:r)?\s+(?:sur\s+)?main|force[- ]?push/.test(value)) {
    return "Toute écriture ou fusion directe vers main est interdite";
  }
  if (/supprim|delete|remove|efface/.test(value) && CRITICAL_PATHS.some((entry) => value.includes(entry.toLowerCase().replace(/\/$/, "")))) {
    return "Suppression d’un fichier critique interdite";
  }
  if (/migration|alter table|drop table|schema db|base de données/.test(value)) {
    return "Migration de base de données soumise à validation humaine";
  }
  if (/secret|api[_ -]?key|\.env/.test(value)) {
    return "Secrets et fichiers d’environnement hors périmètre";
  }
  return null;
}

function inferStrategy(objective: string): EngineeringStrategy {
  const value = objective.toLowerCase();
  if (isDangerousObjective(objective)) return "security_refusal";
  if (/valide|validation|build|tests? runtime/.test(value)) return "runtime_validation";
  if (/audit|analyse le repo|quels fichiers/.test(value)) return "repo_audit";
  if (/documentation|docs?|note/.test(value)) return "docs_update";
  if (/test/.test(value)) return "test_generation";
  if (/erreur|échec|failure|debug/.test(value)) return "debug_from_failure";
  return "safe_code_patch";
}

function inferMode(strategy: EngineeringStrategy): PermissionMode {
  if (strategy === "repo_audit") return "read_only";
  if (strategy === "runtime_validation" || strategy === "debug_from_failure") return "deploy_check";
  if (strategy === "security_refusal") return "read_only";
  return "apply_safe_patch";
}

function pathAllowed(strategy: EngineeringStrategy, target: string): boolean {
  const normalized = target.replaceAll("\\", "/");
  if (CRITICAL_PATHS.some((entry) => normalized === entry || normalized.startsWith(entry))) return false;
  if (strategy === "docs_update") return normalized.endsWith(".md") && (normalized.startsWith("docs/") || normalized.startsWith(".tams/"));
  if (strategy === "test_generation") return /(^|\/)(tests?|__tests__)\/|\.test\.[cm]?[jt]sx?$/.test(normalized);
  if (strategy === "safe_code_patch") return normalized.startsWith("scripts/src/") && /\.[cm]?[jt]s$/.test(normalized);
  return false;
}

function modeAllowsWrite(mode: PermissionMode): boolean {
  return mode === "apply_safe_patch" || mode === "commit_candidate";
}

export class ChatEngineeringController {
  private readonly tools: RepositoryTools;
  private readonly intelligence: RepositoryIntelligence;
  private readonly engine: TaskExecutionEngine;

  constructor(root = process.cwd()) {
    this.tools = new RepositoryTools(root);
    this.intelligence = new RepositoryIntelligence(this.tools);
    this.engine = new TaskExecutionEngine(this.tools);
  }

  async handle(request: ChatEngineeringRequest): Promise<EngineeringTask> {
    const started = Date.now();
    const strategy = request.strategy ?? inferStrategy(request.objective);
    const mode = request.mode ?? inferMode(strategy);
    const task: EngineeringTask = {
      id: randomUUID(),
      actorId: request.actorId ?? "",
      objective: request.objective,
      mode,
      strategy,
      status: "Queued",
      budget: DEFAULT_BUDGETS[mode],
      impactedFiles: request.targetFile ? [request.targetFile] : [],
      plan: [],
      logs: [],
      security: { allowed: false, reason: "" },
      diff: "",
      report: { verdict: "FAIL", summary: "Task not executed", limitations: [] },
    };

    const log = (event: string, detail: string) => task.logs.push({ at: timestamp(), event, detail });
    log("task_created", `strategy=${strategy}; mode=${mode}`);

    if (!request.actorId) {
      task.status = "Refused";
      task.security = { allowed: false, reason: "Authentification obligatoire" };
      task.report = { verdict: "REFUSED", summary: task.security.reason, limitations: [] };
      log("security_refusal", task.security.reason);
      return task;
    }

    const dangerous = isDangerousObjective(request.objective);
    if (dangerous) {
      task.status = dangerous.includes("Migration") ? "ApprovalRequired" : "Refused";
      task.security = { allowed: false, reason: dangerous };
      task.report = {
        verdict: task.status === "ApprovalRequired" ? "APPROVAL_REQUIRED" : "REFUSED",
        summary: dangerous,
        limitations: ["Aucune modification ni commande exécutée"],
      };
      log("security_refusal", dangerous);
      return task;
    }

    task.security = { allowed: true, reason: "Authenticated actor and permitted strategy" };
    task.status = "Analyzing";
    const analysis = await this.intelligence.analyze();
    log("repo_analysis", analysis.summary);

    task.status = "Planned";
    task.plan = [
      `Apply ${strategy} under ${mode}`,
      "Enforce path and execution budgets",
      "Use RepositoryTools only",
      "Generate diff",
      "Validate and report",
    ];

    if (Date.now() - started > task.budget.maxDurationMs) return this.budgetFailure(task, "Duration budget exceeded", log);

    if (strategy === "repo_audit") {
      const runtimeFiles = analysis.files.filter((file) =>
        file.includes("dev-runtime") || file === ".tams/runtime-check.md" || file.endsWith("routes/conversations.ts"),
      );
      task.status = "Completed";
      task.impactedFiles = [];
      task.report = {
        verdict: "PASS",
        summary: `Runtime files: ${runtimeFiles.join(", ")}`,
        analysis,
        limitations: ["Read-only audit; no commands or writes executed"],
      };
      log("completed", task.report.summary);
      return task;
    }

    if ((strategy === "runtime_validation" || strategy === "debug_from_failure") && mode !== "deploy_check") {
      task.status = "Refused";
      task.report = {
        verdict: "REFUSED",
        summary: "Validation active interdite en mode read_only",
        limitations: ["Le bridge HTTP reste read_only tant que l’ownership conversation/utilisateur n’est pas prouvé"],
      };
      log("security_refusal", task.report.summary);
      return task;
    }

    if (strategy === "runtime_validation" || strategy === "debug_from_failure" || mode === "deploy_check") {
      task.status = "Validating";
      const validation = await this.engine.validate(request.healthUrl);
      const commandPass = validation.build.exitCode === 0 && (validation.tests?.exitCode ?? 0) === 0;
      validation.verdict = commandPass && (!validation.health.checked || validation.health.ok) ? "PASS" : "FAIL";
      task.status = validation.verdict === "PASS" ? "Completed" : "Failed";
      task.report = {
        verdict: validation.verdict,
        summary: validation.verdict === "PASS" ? "Runtime validation completed" : "Runtime validation failed",
        validation,
        limitations: validation.limitations,
      };
      log("validation", task.report.summary);
      return task;
    }

    if (mode === "propose_patch") {
      task.status = "Completed";
      task.report = {
        verdict: "PASS",
        summary: "Patch proposal generated; automatic application prohibited in propose_patch mode",
        analysis,
        limitations: ["No file modified"],
      };
      log("proposal_only", task.report.summary);
      return task;
    }

    if (!modeAllowsWrite(mode)) {
      task.status = "Refused";
      task.report = { verdict: "REFUSED", summary: `Mode ${mode} cannot write files`, limitations: [] };
      log("security_refusal", task.report.summary);
      return task;
    }

    const target = request.targetFile ?? (strategy === "docs_update" ? ".tams/runtime-chat-note.md" : "");
    if (!target || !pathAllowed(strategy, target)) {
      task.status = "ApprovalRequired";
      task.report = {
        verdict: "APPROVAL_REQUIRED",
        summary: `Target not allowed for ${strategy}: ${target || "(missing)"}`,
        limitations: ["Only docs/tests/scripts runtime files are writable in v2"],
      };
      log("approval_required", task.report.summary);
      return task;
    }
    if (task.impactedFiles.length > task.budget.maxFiles) return this.budgetFailure(task, "File budget exceeded", log);

    let previous: string | null = null;
    try { previous = await this.tools.readFile(target); } catch { previous = null; }
    task.status = "Executing";
    const nextContent = request.content ?? (
      strategy === "docs_update"
        ? "# TAMS Dev Runtime — Chat Control\n\nLe TAMS Dev Runtime est pilotable par tâche depuis le chat authentifié.\n"
        : ""
    );
    await this.tools.writeFile(target, nextContent);
    log("file_written", target);

    task.status = "Validating";
    const validation = await this.engine.validate(request.healthUrl);
    task.diff = validation.diff;
    if (Buffer.byteLength(task.diff, "utf8") > task.budget.maxDiffBytes) {
      validation.verdict = "FAIL";
      validation.limitations.push("Diff budget exceeded");
    }
    if (validation.verdict === "FAIL") {
      if (previous === null) await this.tools.removeFile(target);
      else await this.tools.writeFile(target, previous);
      task.status = "Failed";
      task.report = {
        verdict: "FAIL",
        summary: "Validation failed; patch rolled back",
        validation,
        limitations: validation.limitations,
      };
      log("rollback", target);
      return task;
    }

    task.status = "Completed";
    task.report = {
      verdict: "PASS",
      summary: `${strategy} completed and validated for ${target}`,
      validation,
      limitations: validation.limitations,
    };
    log("completed", task.report.summary);
    return task;
  }

  private budgetFailure(
    task: EngineeringTask,
    reason: string,
    log: (event: string, detail: string) => void,
  ): EngineeringTask {
    task.status = "Failed";
    task.report = { verdict: "FAIL", summary: reason, limitations: ["Stopped immediately; no retry"] };
    log("budget_exceeded", reason);
    return task;
  }
}

export function runtimeEnabled(env = process.env): boolean {
  return env.TAMS_DEV_RUNTIME_ENABLED === "true";
}
