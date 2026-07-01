/**
 * Studio Orchestrate Route
 * POST /api/studio/orchestrate — transforms a creative request into a production plan.
 */

import { Router } from "express";
import { StudioOrchestrator } from "../lib/studio/studio-orchestrator";
import type { StudioRequest } from "../lib/studio/studio-types";

const router = Router();
const orchestrator = new StudioOrchestrator();

router.post("/studio/orchestrate", (req, res) => {
  const body = req.body as Partial<StudioRequest>;

  if (!body?.objective?.trim()) {
    return res.status(400).json({ error: "objective is required" });
  }

  const plan = orchestrator.orchestrate({
    objective: body.objective,
    targetPlatform: body.targetPlatform,
    project: body.project,
    product: body.product,
    format: body.format,
    tone: body.tone,
    constraints: body.constraints,
    availableCapabilities: body.availableCapabilities,
  });

  return res.json(plan);
});

export default router;
