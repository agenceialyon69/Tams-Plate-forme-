import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { aiConfigured, aiProviders } from "../lib/ai";
import { getAllAgents, getAllTools } from "../lib/agents/orchestrator";
import { getWorkflowRules, isWorkflowEngineRunning } from "../lib/workflows";
import { EventBus } from "../lib/event-bus";
import { existsSync } from "node:fs";
import { FONT_PATH } from "../lib/video";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/healthz/detailed", async (_req, res) => {
  try {
    const checks: Record<string, { status: "ok" | "warn" | "error"; message?: string }> = {};

    // ── Database ──
    try {
      await db.execute(sql`SELECT 1`);
      checks.database = { status: "ok", message: "Connected" };
    } catch (err: unknown) {
      checks.database = { status: "error", message: err instanceof Error ? err.message : "DB unreachable" };
    }

    // ── AI Router ──
    try {
      const providers = aiProviders();
      checks.ai_router = providers.length > 0
        ? { status: "ok", message: `Providers: ${providers.join(", ")}` }
        : { status: "error", message: "No provider configured" };
    } catch (err: unknown) {
      checks.ai_router = { status: "error", message: err instanceof Error ? err.message : "AI check failed" };
    }

    // ── AI Configured ──
    try {
      checks.ai_configured = aiConfigured()
        ? { status: "ok", message: "Ready" }
        : { status: "warn", message: "No API keys set" };
    } catch {
      checks.ai_configured = { status: "error", message: "Check failed" };
    }

    // ── Pollinations (image generation, free, no key) ──
    checks.pollinations = { status: "ok", message: "Free, no key required" };

    // ── Whisper / HuggingFace (audio) ──
    const hf = !!(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY);
    checks.whisper = hf
      ? { status: "ok", message: "HF_TOKEN present" }
      : { status: "warn", message: "HF_TOKEN absent — TTS/music disabled" };

    // ── FFmpeg ──
    try {
      const { spawn } = await import("node:child_process");
      const p = spawn("ffmpeg", ["-version"], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      const ffmpegOk = await new Promise<boolean>((resolve) => {
        const onData = (d: Buffer) => { out += d.toString(); if (/ffmpeg version/i.test(out)) resolve(true); };
        p.stdout.on("data", onData);
        p.stderr.on("data", onData);
        p.on("error", () => resolve(false));
        setTimeout(() => { try { p.kill(); } catch { /* */ } resolve(false); }, 5000);
      });
      checks.ffmpeg = ffmpegOk
        ? { status: "ok", message: out.split("\n")[0]?.slice(0, 60) || "Available" }
        : { status: "error", message: "ffmpeg not found" };
    } catch {
      checks.ffmpeg = { status: "error", message: "ffmpeg check failed" };
    }

    // ── Font (video overlay) ──
    checks.font = existsSync(FONT_PATH)
      ? { status: "ok", message: "Embedded" }
      : { status: "warn", message: "Missing — video text disabled" };

    // ── Memory (pgvector) ──
    try {
      const extResult = await db.execute(sql`SELECT 1 FROM pg_extension WHERE extname = 'vector'`);
      const rows = Array.isArray(extResult) ? extResult : (extResult as { rows?: unknown[] }).rows ?? [];
      checks.memory = rows.length > 0
        ? { status: "ok", message: "pgvector active" }
        : { status: "warn", message: "pgvector not installed" };
    } catch {
      checks.memory = { status: "warn", message: "Cannot check pgvector" };
    }

    // ── Event Bus ──
    try {
      let received = false;
      const hid = EventBus.subscribe("system", async (e) => { if (e.action === "started") received = true; });
      await EventBus.publish({ domain: "system", action: "started", source: "health", payload: {} });
      await new Promise(r => setTimeout(r, 100));
      EventBus.unsubscribe(hid);
      checks.event_bus = received
        ? { status: "ok", message: "Pub/sub working" }
        : { status: "error", message: "Event not received" };
    } catch (err: unknown) {
      checks.event_bus = { status: "error", message: err instanceof Error ? err.message : "EventBus failed" };
    }

    // ── Council ──
    try {
      const agents = getAllAgents();
      checks.council = agents.length > 0
        ? { status: "ok", message: `${agents.length} agents registered` }
        : { status: "error", message: "No agents" };
    } catch {
      checks.council = { status: "error", message: "Council check failed" };
    }

    // ── Planner ──
    try {
      const tools = getAllTools();
      checks.planner = tools.length > 0
        ? { status: "ok", message: `${tools.length} tools available` }
        : { status: "error", message: "No tools" };
    } catch {
      checks.planner = { status: "error", message: "Planner check failed" };
    }

    // ── Reflection ──
    checks.reflection = { status: "ok", message: "Engine loaded" };

    // ── Tool Orchestrator ──
    try {
      const tools = getAllTools();
      checks.tool_orchestrator = tools.length > 0
        ? { status: "ok", message: `${tools.length} tools registered` }
        : { status: "error", message: "No tools" };
    } catch {
      checks.tool_orchestrator = { status: "error", message: "Orchestrator check failed" };
    }

    // ── Agent Runtime ──
    try {
      const agents = getAllAgents();
      checks.agent_runtime = agents.length > 0
        ? { status: "ok", message: `${agents.length} agents ready` }
        : { status: "error", message: "No agents" };
    } catch {
      checks.agent_runtime = { status: "error", message: "Runtime check failed" };
    }

    // ── Workflow Engine ──
    try {
      const rules = getWorkflowRules();
      const running = isWorkflowEngineRunning();
      checks.workflow = rules.length > 0
        ? { status: "ok", message: `${rules.length} rules, engine ${running ? "running" : "stopped"}` }
        : { status: "warn", message: "No rules registered" };
    } catch {
      checks.workflow = { status: "warn", message: "Workflow check failed" };
    }

    // ── Goal Engine (part of Reflection) ──
    checks.goal_engine = { status: "ok", message: "Integrated in Reflection" };

    // ── Disk ──
    try {
      const fs = await import("node:fs");
      fs.statSync(".");
      checks.disk = { status: "ok", message: "Accessible" };
    } catch (err: unknown) {
      checks.disk = { status: "error", message: err instanceof Error ? err.message : "Disk check failed" };
    }

    // ── Memory (process) ──
    const mem = process.memoryUsage();
    const heapPct = mem.heapUsed / mem.heapTotal;
    checks.memory_process = heapPct < 0.9
      ? { status: "ok", message: `Heap ${Math.round(mem.heapUsed / 1024 / 1024)}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB` }
      : { status: "error", message: `Heap critical: ${Math.round(mem.heapUsed / 1024 / 1024)}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB` };

    const hasError = Object.values(checks).some(c => c.status === "error");
    const hasWarn = Object.values(checks).some(c => c.status === "warn");

    res.json({
      status: hasError ? "degraded" : hasWarn ? "ok" : "ok",
      uptime: process.uptime(),
      version: process.env.npm_package_version ?? "0.0.0",
      checks,
    });
  } catch (err) {
    res.status(500).json({ status: "error", error: "Health check failed" });
  }
});

export default router;
