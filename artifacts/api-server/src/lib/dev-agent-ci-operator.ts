const DEFAULT_REPO = "agenceialyon69/Tams-Plate-forme-";

export function ciOperatorStatus() {
  return {
    githubConfigured: Boolean(process.env.GITHUB_TOKEN),
    ciWriteEnabled: process.env.TAMS_DEV_AGENT_CI_WRITE === "true",
    prWriteEnabled: process.env.TAMS_DEV_AGENT_PR_WRITE === "true",
    schedulerEnabled: process.env.TAMS_DEV_AGENT_SCHEDULER === "true",
    repo: process.env.GITHUB_REPO || DEFAULT_REPO,
    workflow: "dev-agent-sandbox.yml",
  };
}

export function ciOperatorPlan() {
  return {
    directGithubActionsDispatch: "available_when_TAMS_DEV_AGENT_CI_WRITE_true",
    ciLogsReader: "available_when_GITHUB_TOKEN_configured",
    rerunFailedJobs: "available_when_TAMS_DEV_AGENT_CI_WRITE_true",
    pullRequestCreation: "available_when_TAMS_DEV_AGENT_PR_WRITE_true",
    scheduler: "available_when_TAMS_DEV_AGENT_SCHEDULER_true",
    browserE2E: "playwright_specs_required",
  };
}
