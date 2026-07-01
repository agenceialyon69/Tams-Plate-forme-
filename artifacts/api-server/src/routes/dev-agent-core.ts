import { Router } from "express";
import { runDevAgentCore, type DevAgentCoreInput } from "../lib/dev-agent-core";

const router = Router();

function bodyToInput(body: unknown): DevAgentCoreInput {
  const value = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  return {
    objective: typeof value.objective === "string" ? value.objective : typeof value.input === "string" ? value.input : "Rapprocher TAMS de Claude Code avec sécurité.",
    mode: value.mode === "preview" ? "preview" : "analyze",
    changes: Array.isArray(value.changes)
      ? value.changes
          .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
          .map(item => ({
            path: typeof item.path === "string" ? item.path : "",
            content: typeof item.content === "string" ? item.content : "",
            reason: typeof item.reason === "string" ? item.reason : undefined,
          }))
      : [],
  };
}

router.get("/dev-agent/status", (_req, res) => {
  res.json({
    ok: true,
    name: "TAMS Dev Agent Core",
    level: "Claude Code-like v1",
    writePolicy: "human_review_required",
    runtimePolicy: "allowlisted_commands_only",
    availableLayers: [
      "Repo Intelligence",
      "Patch Preview",
      "Permission Layer",
      "Validation Engine contract",
      "GitHub Operator handoff",
      "Memory handoff",
    ],
  });
});

router.post("/dev-agent/core", (req, res) => {
  const input = bodyToInput(req.body);
  const result = runDevAgentCore(input);
  res.status(result.ok ? 200 : 403).json(result);
});

router.post("/capabilities/execute", (req, res, next) => {
  const capabilityId = typeof req.body?.capabilityId === "string" ? req.body.capabilityId : "";
  if (capabilityId !== "dev.agent.core") return next();
  const options = typeof req.body?.options === "object" && req.body.options !== null ? req.body.options as Record<string, unknown> : {};
  const input = bodyToInput({
    objective: typeof req.body?.input === "string" ? req.body.input : undefined,
    mode: options.mode,
    changes: options.changes,
  });
  const result = runDevAgentCore(input);
  return res.status(result.ok ? 200 : 403).json({
    capabilityId,
    status: result.ok ? "success" : "disabled",
    mode: "read_only",
    title: "Dev Agent Core",
    result: [
      result.summary,
      "",
      "LAYERS",
      ...result.layers.map(layer => `- ${layer.name}: ${layer.status} — ${layer.detail}`),
      "",
      "PATCH PREVIEW",
      result.patchPreview,
      "",
      "VALIDATION",
      ...result.validationPlan.allowlistedCommands.map(command => `- ${command}`),
    ].join("\n"),
    artifact: { type: "json", data: result },
    limitations: result.limitations,
    nextActions: result.nextActions,
    providerUsed: "dev-agent-core",
    debug: { safe: true, noSecrets: true },
  });
});

export default router;
