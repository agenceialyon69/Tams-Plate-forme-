const DEFAULT_REPO = "agenceialyon69/Tams-Plate-forme-";
const WORKFLOW = "dev-agent-sandbox.yml";

type Json = Record<string, unknown>;
export type RunKind = "full_validation" | "typecheck" | "e2e_playwright";

function token(): string | null {
  const value = process.env.GITHUB_TOKEN;
  return value && value.trim() ? value.trim() : null;
}

function repoName(input?: string): string {
  const repo = input || process.env.GITHUB_REPO || DEFAULT_REPO;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("repo invalide");
  return repo;
}

function split(repo: string): { owner: string; name: string } {
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new Error("repo invalide");
  return { owner, name };
}

function redact(text: string): string {
  return text
    .replace(/ghp_[A-Za-z0-9_]+/g, "[redacted]")
    .replace(/github_pat_[A-Za-z0-9_]+/g, "[redacted]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
    .slice(0, 50000);
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function github(path: string, init: { method?: string; body?: unknown; text?: boolean } = {}): Promise<Json | string> {
  const secret = token();
  if (!secret) throw new Error("GITHUB_TOKEN manquant");
  const response = await fetch(`https://api.github.com${path}`, {
    method: init.method || "GET",
    headers: {
      Accept: init.text ? "text/plain" : "application/vnd.github+json",
      Authorization: ["token", secret].join(" "),
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(45_000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${redact(body)}`);
  return init.text ? redact(body) : body ? JSON.parse(body) as Json : {};
}

function requireWrite(flag: "TAMS_DEV_AGENT_CI_WRITE" | "TAMS_DEV_AGENT_PR_WRITE") {
  if (process.env[flag] !== "true") throw new Error(`${flag}=true requis`);
}

export function ciOperatorStatus() {
  return {
    githubConfigured: Boolean(token()),
    ciWriteEnabled: process.env.TAMS_DEV_AGENT_CI_WRITE === "true",
    prWriteEnabled: process.env.TAMS_DEV_AGENT_PR_WRITE === "true",
    schedulerEnabled: process.env.TAMS_DEV_AGENT_SCHEDULER === "true",
    repo: process.env.GITHUB_REPO || DEFAULT_REPO,
    workflow: WORKFLOW,
    maxRepairSeconds: Number(process.env.TAMS_DEV_AGENT_MAX_REPAIR_SECONDS || 120),
  };
}

export function ciOperatorPlan() {
  return {
    directGithubActionsDispatch: "real_endpoint_guarded",
    ciLogsReader: "real_endpoint_read_only",
    rerunFailedJobs: "real_endpoint_guarded",
    pullRequestCreation: "real_endpoint_guarded",
    scheduler: "real_interval_guarded",
    repairLoop: "timeboxed_read_logs_then_rerun_guarded",
    browserE2E: "real_playwright_specs_in_sandbox",
  };
}

export async function dispatchWorkflow(input: { repo?: string; ref?: string; runKind?: RunKind }) {
  requireWrite("TAMS_DEV_AGENT_CI_WRITE");
  const repo = repoName(input.repo);
  const { owner, name } = split(repo);
  const ref = input.ref || "tams-dev";
  const run_kind = input.runKind || "full_validation";
  await github(`/repos/${owner}/${name}/actions/workflows/${WORKFLOW}/dispatches`, { method: "POST", body: { ref, inputs: { run_kind } } });
  return { ok: true, repo, workflow: WORKFLOW, ref, runKind: run_kind };
}

export async function listRuns(input: { repo?: string; branch?: string }) {
  const repo = repoName(input.repo);
  const { owner, name } = split(repo);
  const query = input.branch ? `?branch=${encodeURIComponent(input.branch)}&per_page=10` : "?per_page=10";
  const data = await github(`/repos/${owner}/${name}/actions/runs${query}`) as Json;
  return { repo, runs: list(data.workflow_runs).slice(0, 10) };
}

export async function listJobs(input: { repo?: string; runId: number }) {
  const repo = repoName(input.repo);
  const { owner, name } = split(repo);
  const data = await github(`/repos/${owner}/${name}/actions/runs/${input.runId}/jobs?per_page=50`) as Json;
  return { repo, runId: input.runId, jobs: list(data.jobs) };
}

export async function readJobLogs(input: { repo?: string; jobId: number }) {
  const repo = repoName(input.repo);
  const { owner, name } = split(repo);
  const log = await github(`/repos/${owner}/${name}/actions/jobs/${input.jobId}/logs`, { text: true }) as string;
  return { repo, jobId: input.jobId, log };
}

export async function rerunFailedJobs(input: { repo?: string; runId: number }) {
  requireWrite("TAMS_DEV_AGENT_CI_WRITE");
  const repo = repoName(input.repo);
  const { owner, name } = split(repo);
  await github(`/repos/${owner}/${name}/actions/runs/${input.runId}/rerun-failed-jobs`, { method: "POST" });
  return { ok: true, repo, runId: input.runId };
}

export async function createPullRequest(input: { repo?: string; head: string; base?: string; title: string; body?: string }) {
  requireWrite("TAMS_DEV_AGENT_PR_WRITE");
  const repo = repoName(input.repo);
  const { owner, name } = split(repo);
  const pr = await github(`/repos/${owner}/${name}/pulls`, {
    method: "POST",
    body: {
      title: input.title,
      head: input.head,
      base: input.base || "main",
      body: input.body || "Created by TAMS Dev Agent CI Operator.",
      maintainer_can_modify: true,
    },
  }) as Json;
  return { repo, number: pr.number, url: pr.html_url, state: pr.state };
}

export async function runRepairLoop(input: { repo?: string; runId: number; rerun?: boolean }) {
  const startedAt = Date.now();
  const jobs = await listJobs({ repo: input.repo, runId: input.runId });
  const failed = jobs.jobs.filter(job => typeof job === "object" && job !== null && (job as Json).conclusion === "failure");
  const logs = [] as Array<{ jobId: number; excerpt: string }>;
  for (const job of failed.slice(0, 3)) {
    const jobId = numberValue((job as Json).id);
    if (!jobId) continue;
    const entry = await readJobLogs({ repo: input.repo, jobId });
    logs.push({ jobId, excerpt: entry.log.slice(-12000) });
    if ((Date.now() - startedAt) / 1000 > Number(process.env.TAMS_DEV_AGENT_MAX_REPAIR_SECONDS || 120)) break;
  }
  const rerun = input.rerun === true && failed.length > 0 ? await rerunFailedJobs({ repo: input.repo, runId: input.runId }) : null;
  return {
    ok: true,
    mode: "timeboxed",
    runId: input.runId,
    failedJobs: failed.length,
    logs,
    rerun,
    limitation: "Boucle courte : lit les logs, prépare le diagnostic et peut relancer les jobs échoués. Les patchs longs doivent être confiés à Codex ou à une nouvelle mission.",
  };
}
