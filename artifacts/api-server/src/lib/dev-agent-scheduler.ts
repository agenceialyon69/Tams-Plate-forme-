import { dispatchWorkflow } from "./dev-agent-ci-operator";

let started = false;
let lastRunAt: string | null = null;
let lastError: string | null = null;

export function schedulerStatus() {
  return {
    enabled: process.env.TAMS_DEV_AGENT_SCHEDULER === "true",
    started,
    intervalMinutes: Number(process.env.TAMS_DEV_AGENT_SCHEDULER_MINUTES || 360),
    lastRunAt,
    lastError,
  };
}

export function startDevAgentScheduler() {
  if (started || process.env.TAMS_DEV_AGENT_SCHEDULER !== "true") return schedulerStatus();
  started = true;
  const minutes = Math.max(30, Number(process.env.TAMS_DEV_AGENT_SCHEDULER_MINUTES || 360));
  const run = async () => {
    try {
      lastRunAt = new Date().toISOString();
      lastError = null;
      await dispatchWorkflow({ ref: process.env.TAMS_DEV_AGENT_SCHEDULER_REF || "tams-dev", runKind: "full_validation" });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  };
  setInterval(() => { void run(); }, minutes * 60 * 1000).unref();
  return schedulerStatus();
}
