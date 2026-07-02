import { Router } from "express";
import {
  ciOperatorPlan,
  ciOperatorStatus,
  createPullRequest,
  dispatchWorkflow,
  listJobs,
  listRuns,
  readJobLogs,
  rerunFailedJobs,
  runRepairLoop,
  type RunKind,
} from "../lib/dev-agent-ci-operator.js";

const router = Router();

type Body = Record<string, unknown>;

function body(req: { body?: unknown }): Body {
  return typeof req.body === "object" && req.body !== null ? req.body as Body : {};
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function kind(value: unknown): RunKind | undefined {
  return value === "typecheck" || value === "e2e_playwright" || value === "full_validation" ? value : undefined;
}

router.get("/dev-agent/ci/status", (_req, res) => {
  res.json({ ok: true, ...ciOperatorStatus(), plan: ciOperatorPlan() });
});

router.post("/dev-agent/ci/dispatch", async (req, res) => {
  const b = body(req);
  const result = await dispatchWorkflow({ repo: str(b.repo), ref: str(b.ref), runKind: kind(b.runKind) });
  res.json(result);
});

router.get("/dev-agent/ci/runs", async (req, res) => {
  const result = await listRuns({ repo: str(req.query.repo), branch: str(req.query.branch) });
  res.json(result);
});

router.get("/dev-agent/ci/runs/:runId/jobs", async (req, res) => {
  const result = await listJobs({ repo: str(req.query.repo), runId: Number(req.params.runId) });
  res.json(result);
});

router.get("/dev-agent/ci/jobs/:jobId/logs", async (req, res) => {
  const result = await readJobLogs({ repo: str(req.query.repo), jobId: Number(req.params.jobId) });
  res.json(result);
});

router.post("/dev-agent/ci/runs/:runId/rerun-failed", async (req, res) => {
  const result = await rerunFailedJobs({ repo: str(body(req).repo), runId: Number(req.params.runId) });
  res.json(result);
});

router.post("/dev-agent/ci/pr", async (req, res) => {
  const b = body(req);
  const result = await createPullRequest({
    repo: str(b.repo),
    head: str(b.head) || "tams-dev",
    base: str(b.base) || "main",
    title: str(b.title) || "dev-agent: propose changes",
    body: str(b.body) || "Created by TAMS Dev Agent.",
  });
  res.json(result);
});

router.post("/dev-agent/ci/repair-loop", async (req, res) => {
  const b = body(req);
  const runId = num(b.runId);
  if (!runId) return res.status(400).json({ ok: false, error: "runId requis" });
  const result = await runRepairLoop({ repo: str(b.repo), runId, rerun: b.rerun === true });
  return res.json(result);
});

router.post("/capabilities/execute", async (req, res, next) => {
  const capabilityId = typeof req.body?.capabilityId === "string" ? req.body.capabilityId : "";
  if (capabilityId !== "dev.agent.ci") return next();
  const options = typeof req.body?.options === "object" && req.body.options !== null ? req.body.options as Body : {};
  const action = str(options.action) || "status";
  try {
    let data: unknown;
    if (action === "dispatch") data = await dispatchWorkflow({ repo: str(options.repo), ref: str(options.ref), runKind: kind(options.runKind) });
    else if (action === "runs") data = await listRuns({ repo: str(options.repo), branch: str(options.branch) });
    else if (action === "jobs") data = await listJobs({ repo: str(options.repo), runId: num(options.runId) || 0 });
    else if (action === "logs") data = await readJobLogs({ repo: str(options.repo), jobId: num(options.jobId) || 0 });
    else if (action === "rerun_failed") data = await rerunFailedJobs({ repo: str(options.repo), runId: num(options.runId) || 0 });
    else if (action === "create_pr") data = await createPullRequest({ repo: str(options.repo), head: str(options.head) || "tams-dev", base: str(options.base), title: str(options.title) || "dev-agent: propose changes", body: str(options.body) });
    else if (action === "repair_loop") data = await runRepairLoop({ repo: str(options.repo), runId: num(options.runId) || 0, rerun: options.rerun === true });
    else data = { status: ciOperatorStatus(), plan: ciOperatorPlan() };

    return res.json({
      capabilityId,
      status: "success",
      mode: action === "status" ? "read_only" : "real",
      title: "Dev Agent CI Operator",
      result: JSON.stringify(data, null, 2),
      artifact: { type: "json", data },
      limitations: ["Boucle de correction timeboxée : lecture logs + diagnostic + relance possible ; les corrections longues doivent être confiées à Codex."],
      nextActions: ["Activer les flags nécessaires", "Lancer dispatch", "Lire jobs/logs", "Rerun failed ou confier patch à Codex"],
      providerUsed: "github-actions-api",
      debug: { safe: true, noSecrets: true },
    });
  } catch (error) {
    return res.status(500).json({ capabilityId, status: "error", mode: "disabled", title: "CI Operator error", result: error instanceof Error ? error.message : String(error), artifact: { type: "none" }, limitations: ["Erreur retournée sans secret."], nextActions: ["Vérifier GITHUB_TOKEN et flags d’écriture"], providerUsed: "github-actions-api", debug: { safe: true, noSecrets: true } });
  }
});

export default router;
