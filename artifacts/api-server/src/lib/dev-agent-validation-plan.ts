export function devAgentValidationPlan() {
  return {
    name: "TAMS Dev Agent Validation Runner v1",
    layers: [
      "worker sandbox",
      "allowlisted validation commands",
      "CI log reader",
      "repair loop contract",
      "pull request handoff",
      "browser e2e readiness",
      "scheduler status",
    ],
    status: "safe_plan_ready",
  };
}
