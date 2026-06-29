/**
 * Observability Routes
 * API endpoints for system monitoring
 */

import { Router } from "express";
import {
  getAIMetricsSummary,
  getToolMetricsSummary,
  getRecentActivity,
  getSystemHealth,
  getSystemMetrics,
} from "../lib/observability";
import { listTools } from "../lib/tools";

const router = Router();

// ─── System Health ────────────────────────────────────────────────────────────

router.get("/health/detailed", async (_req, res) => {
  try {
    const health = await getSystemHealth();
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: "Health check failed" });
  }
});

// ─── AI Metrics ───────────────────────────────────────────────────────────────

router.get("/metrics/ai", async (req, res) => {
  try {
    const hours = Number(req.query.hours) || 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const summary = await getAIMetricsSummary(since);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: "Failed to get AI metrics" });
  }
});

// ─── Tool Metrics ─────────────────────────────────────────────────────────────

router.get("/metrics/tools", async (req, res) => {
  try {
    const hours = Number(req.query.hours) || 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const summary = await getToolMetricsSummary(since);

    // Add available tools
    const tools = listTools();
    res.json({ ...summary, availableTools: tools });
  } catch (err) {
    res.status(500).json({ error: "Failed to get tool metrics" });
  }
});

// ─── Activity Log ─────────────────────────────────────────────────────────────

router.get("/activity", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const activity = await getRecentActivity(limit);
    res.json(activity);
  } catch (err) {
    res.status(500).json({ error: "Failed to get activity" });
  }
});

// ─── System Metrics (comprehensive) ───────────────────────────────────────────

router.get("/system/metrics", async (_req, res) => {
  try {
    const metrics = await getSystemMetrics();
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: "Failed to get system metrics" });
  }
});

export default router;
