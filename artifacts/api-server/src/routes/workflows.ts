import { Router } from "express";
import { z } from "zod";
import {
  getWorkflowRules,
  getWorkflowRule,
  toggleWorkflowRule,
  executeRuleManually,
  getExecutionHistory,
  registerWorkflowRule,
  WorkflowRule,
} from "../lib/workflows";
import { logger } from "../lib/logger";

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateRuleBody = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/),
  name: z.string().min(1).max(128),
  description: z.string().max(512).optional(),
  trigger: z.enum([
    "task_created",
    "task_completed",
    "project_created",
    "contact_added",
    "decision_created",
    "memory_created",
    "deadline_approaching",
    "scheduled",
  ]),
  enabled: z.boolean().default(true),
});

// ─── GET /api/workflows ───────────────────────────────────────────────────────
// List all rules with their status

router.get("/workflows", async (req, res) => {
  try {
    const rules = getWorkflowRules();
    const history = getExecutionHistory(200);

    // Build stats per rule
    const statsMap = new Map<string, { lastRun: string | null; runCount: number; lastSuccess: boolean | null }>();
    for (const h of history) {
      const existing = statsMap.get(h.ruleId);
      if (!existing) {
        statsMap.set(h.ruleId, {
          lastRun: h.executedAt,
          runCount: 1,
          lastSuccess: h.success,
        });
      } else {
        existing.runCount++;
        if (new Date(h.executedAt) > new Date(existing.lastRun ?? 0)) {
          existing.lastRun = h.executedAt;
          existing.lastSuccess = h.success;
        }
      }
    }

    const data = rules.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      trigger: r.trigger,
      enabled: r.enabled,
      isTemporal: r.isTemporal ?? false,
      lastRun: statsMap.get(r.id)?.lastRun ?? null,
      runCount: statsMap.get(r.id)?.runCount ?? 0,
      lastSuccess: statsMap.get(r.id)?.lastSuccess ?? null,
    }));

    return res.json({ data });
  } catch (err) {
    req.log.error({ err }, "Error listing workflows");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/workflows/:id/toggle ───────────────────────────────────────────
// Toggle a rule on/off

router.post("/workflows/:id/toggle", async (req, res) => {
  try {
    const { id } = req.params;
    const body = z.object({ enabled: z.boolean() }).safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: "Invalid input", details: body.error.issues });
    }

    const ok = toggleWorkflowRule(id, body.data.enabled);
    if (!ok) {
      return res.status(404).json({ error: "Rule not found" });
    }

    const rule = getWorkflowRule(id);
    return res.json({ data: { id, enabled: rule?.enabled } });
  } catch (err) {
    req.log.error({ err }, "Error toggling workflow");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/workflows/:id/run ──────────────────────────────────────────────
// Manually execute a rule

router.post("/workflows/:id/run", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await executeRuleManually(id);
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }
    return res.json({ data: { id, message: result.message } });
  } catch (err) {
    req.log.error({ err }, "Error running workflow manually");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/workflows/history ───────────────────────────────────────────────
// Execution history

router.get("/workflows/history", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const history = getExecutionHistory(limit);
    return res.json({ data: history });
  } catch (err) {
    req.log.error({ err }, "Error getting workflow history");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/workflows ──────────────────────────────────────────────────────
// Create a new custom rule (stores in memory only for now)

router.post("/workflows", async (req, res) => {
  try {
    const parsed = CreateRuleBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }

    const { id, name, description, trigger, enabled } = parsed.data;

    if (getWorkflowRule(id)) {
      return res.status(409).json({ error: "Rule with this ID already exists" });
    }

    // Custom rules get a simple no-op condition/action that just logs
    const rule: WorkflowRule = {
      id,
      name,
      description: description ?? "",
      trigger,
      enabled,
      condition: async () => true,
      action: async () => {
        logger.info({ ruleId: id }, `Custom rule "${name}" executed`);
      },
    };

    registerWorkflowRule(rule);
    return res.status(201).json({ data: { id, name, description, trigger, enabled } });
  } catch (err) {
    req.log.error({ err }, "Error creating workflow");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
