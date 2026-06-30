import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile, rm } from "node:fs/promises";
import path from "node:path";

export type TaskStatus =
  | "Queued"
  | "Analyzing"
  | "Planned"
  | "Executing"
  | "Validating"
  | "Completed"
  | "Failed"
  | "Retried"
  | "Escalated";

export interface RuntimeLog {
  at: string;
  status: TaskStatus;
  message: string;
}

export interface RuntimeTask {
  id: string;
  objective: string;
  status: TaskStatus;
  priority: "low" | "medium" | "high" | "urgent";
  impactedFiles: string[];
  plan: string[];
  logs: RuntimeLog[];
  retryCount: number;
  maxRetries: 3;
  rollback: { performed: boolean; files: string[] };
  result?: string;
  report?: ValidationReport;
}

export interface RepositoryAnalysis {
  root: string;
  files: string[];
  packageFiles: string[];
  routes: string[];
  dependencies: string[];
  summary: string;
}

export interface CommandResult {
  command: string;
  args: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface ValidationReport {
  verdict: "PASS" | "FAIL";
  diff: string;
  build: CommandResult;
  tests: CommandResult | null;
  health: { checked: boolean; ok: boolean; detail: string };
  limitations: string[];
}

const IGNORED = new Set([".git", "node_modules", "dist", "coverage", ".cache"]);
const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".yml", ".yaml", ".toml",
  ".sql", ".css", ".html", ".sh",
]);

function now(): string {
  return new Date().toISOString();
}

function relative(root: string, file: string): string {
  return path.relative(root, file).replaceAll("\\", "/");
}

export class RepositoryTools {
  readonly root: string;

  constructor(root = process.cwd()) {
    this.root = path.resolve(root);
  }

  resolve(repoPath: string): string {
    const target = path.resolve(this.root, repoPath);
    if (target !== this.root && !target.startsWith(this.root + path.sep)) {
      throw new Error(`Path escapes repository: ${repoPath}`);
    }
    return target;
  }

  async readFile(repoPath: string): Promise<string> {
    return readFile(this.resolve(repoPath), "utf8");
  }

  async writeFile(repoPath: string, content: string): Promise<void> {
    const target = this.resolve(repoPath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }

  async removeFile(repoPath: string): Promise<void> {
    await rm(this.resolve(repoPath), { force: true });
  }

  async indexRepo(limit = 5000): Promise<string[]> {
    const files: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      if (files.length >= limit) return;
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (IGNORED.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile()) files.push(relative(this.root, full));
        if (files.length >= limit) return;
      }
    };
    await walk(this.root);
    return files.sort();
  }

  async searchCode(query: string, files?: string[]): Promise<Array<{ file: string; line: number; text: string }>> {
    if (!query.trim()) throw new Error("Search query is required");
    const candidates = files ?? await this.indexRepo();
    const needle = query.toLowerCase();
    const matches: Array<{ file: string; line: number; text: string }> = [];
    for (const file of candidates) {
      if (!TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
      let content: string;
      try { content = await this.readFile(file); } catch { continue; }
      content.split(/\r?\n/).forEach((text, index) => {
        if (matches.length < 200 && text.toLowerCase().includes(needle)) {
          matches.push({ file, line: index + 1, text: text.trim().slice(0, 240) });
        }
      });
      if (matches.length >= 200) break;
    }
    return matches;
  }

  runCommand(command: string, args: string[], timeoutMs = 300_000): Promise<CommandResult> {
    const allowed = new Set(["git", "pnpm", "node"]);
    if (!allowed.has(command)) throw new Error(`Command not allowed: ${command}`);
    return new Promise((resolve) => {
      const started = Date.now();
      const child = spawn(command, args, { cwd: this.root, shell: false, env: process.env });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        stderr += `\nTimeout after ${timeoutMs}ms`;
      }, timeoutMs);
      child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({ command, args, exitCode: -1, stdout, stderr: stderr + error.message, durationMs: Date.now() - started });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ command, args, exitCode: code ?? -1, stdout, stderr, durationMs: Date.now() - started });
      });
    });
  }

  gitStatus(): Promise<CommandResult> {
    return this.runCommand("git", ["status", "--short", "--branch"], 30_000);
  }

  async gitDiff(): Promise<string> {
    const tracked = await this.runCommand("git", ["diff", "--no-ext-diff", "--"], 30_000);
    const statusResult = await this.runCommand("git", ["status", "--porcelain"], 30_000);
    const untracked = statusResult.stdout
      .split(/\r?\n/)
      .filter((line) => line.startsWith("?? "))
      .map((line) => line.slice(3))
      .filter(Boolean);
    const additions: string[] = [];
    for (const file of untracked) {
      try {
        const value = await this.readFile(file);
        additions.push([
          `diff --git a/${file} b/${file}`,
          "new file mode 100644",
          "--- /dev/null",
          `+++ b/${file}`,
          ...value.split(/\r?\n/).map((line) => `+${line}`),
        ].join("\n"));
      } catch { /* binary or transient file */ }
    }
    return [tracked.stdout, ...additions].filter(Boolean).join("\n");
  }
}

export class RepositoryIntelligence {
  constructor(private readonly tools: RepositoryTools) {}

  async analyze(): Promise<RepositoryAnalysis> {
    const files = await this.tools.indexRepo();
    const packageFiles = files.filter((file) => file.endsWith("package.json"));
    const routes = files.filter((file) => /(^|\/)routes\/.+\.ts$/.test(file));
    const dependencies = new Set<string>();
    for (const packageFile of packageFiles) {
      try {
        const parsed = JSON.parse(await this.tools.readFile(packageFile)) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        Object.keys(parsed.dependencies ?? {}).forEach((name) => dependencies.add(name));
        Object.keys(parsed.devDependencies ?? {}).forEach((name) => dependencies.add(name));
      } catch { /* malformed package is reported by build/typecheck */ }
    }
    return {
      root: this.tools.root,
      files,
      packageFiles,
      routes,
      dependencies: [...dependencies].sort(),
      summary: `${files.length} files, ${packageFiles.length} packages, ${routes.length} API route modules, ${dependencies.size} dependencies`,
    };
  }

  async summarizeModule(modulePath: string): Promise<string> {
    const prefix = modulePath.replace(/\/$/, "") + "/";
    const files = (await this.tools.indexRepo()).filter((file) => file === modulePath || file.startsWith(prefix));
    const imports = new Set<string>();
    for (const file of files.filter((item) => /\.[cm]?[jt]sx?$/.test(item)).slice(0, 100)) {
      const content = await this.tools.readFile(file);
      for (const match of content.matchAll(/from\s+["']([^"']+)["']/g)) imports.add(match[1]);
    }
    return `${modulePath}: ${files.length} files; imports: ${[...imports].slice(0, 30).join(", ") || "none"}`;
  }
}

class TaskStore {
  constructor(private readonly tools: RepositoryTools) {}

  private taskPath(id: string): string {
    return `.tams/runtime/tasks/${id}.json`;
  }

  async save(task: RuntimeTask): Promise<void> {
    await this.tools.writeFile(this.taskPath(task.id), JSON.stringify(task, null, 2) + "\n");
  }

  async get(id: string): Promise<RuntimeTask> {
    return JSON.parse(await this.tools.readFile(this.taskPath(id))) as RuntimeTask;
  }
}

export class ValidationEngine {
  constructor(private readonly tools: RepositoryTools) {}

  async validate(healthUrl?: string): Promise<ValidationReport> {
    const diff = await this.tools.gitDiff();
    const build = await this.tools.runCommand("pnpm", ["run", "build:check"], 900_000);
    const rootPackage = JSON.parse(await this.tools.readFile("package.json")) as { scripts?: Record<string, string> };
    const tests = rootPackage.scripts?.test
      ? await this.tools.runCommand("pnpm", ["test"], 600_000)
      : await this.tools.runCommand("pnpm", ["--filter", "@workspace/scripts", "test"], 600_000);
    let health = { checked: false, ok: false, detail: "No health URL provided; CI smoke test must verify /api/healthz." };
    if (healthUrl) {
      try {
        const response = await fetch(healthUrl, { signal: AbortSignal.timeout(10_000) });
        health = { checked: true, ok: response.ok, detail: `HTTP ${response.status}` };
      } catch (error) {
        health = { checked: true, ok: false, detail: error instanceof Error ? error.message : String(error) };
      }
    }
    const limitations = health.checked ? [] : [health.detail];
    return {
      verdict: diff.trim() && build.exitCode === 0 && tests.exitCode === 0 && (!health.checked || health.ok) ? "PASS" : "FAIL",
      diff,
      build,
      tests,
      health,
      limitations,
    };
  }
}

export class TaskExecutionEngine {
  private readonly store: TaskStore;
  private readonly intelligence: RepositoryIntelligence;
  private readonly validator: ValidationEngine;

  constructor(private readonly tools = new RepositoryTools()) {
    this.store = new TaskStore(tools);
    this.intelligence = new RepositoryIntelligence(tools);
    this.validator = new ValidationEngine(tools);
  }

  async createTask(objective: string, priority: RuntimeTask["priority"] = "medium"): Promise<RuntimeTask> {
    const task: RuntimeTask = {
      id: randomUUID(),
      objective,
      status: "Queued",
      priority,
      impactedFiles: [],
      plan: [],
      logs: [{ at: now(), status: "Queued", message: "Task created" }],
      retryCount: 0,
      maxRetries: 3,
      rollback: { performed: false, files: [] },
    };
    await this.store.save(task);
    return task;
  }

  getTask(id: string): Promise<RuntimeTask> {
    return this.store.get(id);
  }

  private async transition(task: RuntimeTask, status: TaskStatus, message: string): Promise<void> {
    task.status = status;
    task.logs.push({ at: now(), status, message });
    await this.store.save(task);
  }

  async run(id: string, healthUrl?: string): Promise<RuntimeTask> {
    const task = await this.store.get(id);
    const target = ".tams/runtime-check.md";
    let previous: string | null = null;
    try {
      await this.transition(task, "Analyzing", "Indexing repository and locating impacted files");
      const analysis = await this.intelligence.analyze();
      task.impactedFiles = [target];
      task.plan = [
        `Analyze repository: ${analysis.summary}`,
        `Create or update ${target} through RepositoryTools`,
        "Inspect git diff",
        "Run build and available tests",
        "Produce an honest PASS/FAIL report",
      ];
      await this.transition(task, "Planned", task.plan.join(" | "));
      if (!/runtime-check/i.test(task.objective)) {
        throw new Error("V1 only accepts the controlled runtime-check scenario");
      }
      try { previous = await this.tools.readFile(target); } catch { previous = null; }
      await this.transition(task, "Executing", `Writing ${target} through the tool layer`);
      await this.tools.writeFile(target, [
        "# TAMS Development Runtime Check",
        "",
        "Created by the controlled development runtime scenario.",
        `Task: ${task.id}`,
        "Flow: request -> analysis -> task -> plan -> tool -> validation -> report",
        "",
      ].join("\n"));
      await this.transition(task, "Validating", "Collecting diff, build, tests and health evidence");
      task.report = await this.validator.validate(healthUrl);
      if (task.report.verdict !== "PASS") {
        if (previous === null) await this.tools.removeFile(target);
        else await this.tools.writeFile(target, previous);
        task.rollback = { performed: true, files: [target] };
        task.result = "Validation failed; controlled file change rolled back";
        await this.transition(task, "Failed", task.result);
        if (task.retryCount < task.maxRetries) {
          task.retryCount += 1;
          await this.transition(task, "Retried", `Retry ${task.retryCount}/${task.maxRetries} requires a new explicit run`);
        } else {
          await this.transition(task, "Escalated", "Maximum retries reached");
        }
      } else {
        task.result = `Runtime scenario completed: ${analysis.summary}`;
        await this.transition(task, "Completed", task.result);
      }
    } catch (error) {
      task.result = error instanceof Error ? error.message : String(error);
      await this.transition(task, "Failed", task.result);
    }
    await this.store.save(task);
    return task;
  }

  analyze(): Promise<RepositoryAnalysis> {
    return this.intelligence.analyze();
  }

  validate(healthUrl?: string): Promise<ValidationReport> {
    return this.validator.validate(healthUrl);
  }
}

export class ChatControlPlane {
  constructor(private readonly engine: TaskExecutionEngine) {}

  async handle(input: { action: "create" | "run" | "status" | "analyze" | "validate" | "logs" | "report"; taskId?: string; objective?: string; healthUrl?: string }): Promise<unknown> {
    switch (input.action) {
      case "create": return this.engine.createTask(input.objective ?? "");
      case "run": return this.engine.run(this.requiredId(input.taskId), input.healthUrl);
      case "status": return this.engine.getTask(this.requiredId(input.taskId));
      case "analyze": return this.engine.analyze();
      case "validate": return this.engine.validate(input.healthUrl);
      case "logs": return (await this.engine.getTask(this.requiredId(input.taskId))).logs;
      case "report": return (await this.engine.getTask(this.requiredId(input.taskId))).report ?? null;
    }
  }

  private requiredId(id?: string): string {
    if (!id) throw new Error("taskId is required");
    return id;
  }
}

async function main(): Promise<void> {
  const [action = "scenario", ...rest] = process.argv.slice(2);
  const rootFlag = rest.indexOf("--root");
  const root = rootFlag >= 0 ? rest[rootFlag + 1] : process.cwd();
  const engine = new TaskExecutionEngine(new RepositoryTools(root));
  const control = new ChatControlPlane(engine);
  let result: unknown;
  if (action === "scenario") {
    const task = await engine.createTask("Analyse le repo et ajoute un fichier runtime-check sans casser le projet.", "high");
    result = await engine.run(task.id);
  } else if (action === "analyze") {
    result = await control.handle({ action: "analyze" });
  } else {
    const payload = rest.find((value) => value.startsWith("{"));
    if (!payload) throw new Error("JSON control payload required");
    result = await control.handle(JSON.parse(payload));
  }
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if ((result as RuntimeTask)?.report?.verdict === "FAIL") process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll("\\", "/")}`) {
  main().catch((error) => {
    process.stderr.write((error instanceof Error ? error.stack : String(error)) + "\n");
    process.exitCode = 1;
  });
}
