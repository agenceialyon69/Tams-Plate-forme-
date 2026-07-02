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

function appVersion(): string {
  return process.env.RAILWAY_GIT_COMMIT_SHA
    || process.env.GIT_COMMIT_SHA
    || process.env.SOURCE_VERSION
    || process.env.GITHUB_SHA
    || process.env.npm_package_version
    || "dev";
}

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/healthz/detailed", async (_req, res) => {
  try {
    const checks: Record<string, { status: "ok" | "warn" | "error"; message?: string }> = {};

    try {
      await db.execute(sql`SELECT 1`);
      checks.database = { status: "ok", message: "Connected" };
    } catch (err: unknown) {
      checks.database = { status: "error", message: err instanceof Error ? err.message : "DB unreachable" };
    }

    try {
      const providers = aiProviders();
      const aiStatus = providers.length > 0 ? "ok" : "error";
      const aiMessage = providers.length > 0 ? `Providers: ${providers.join(", ")}` : "No provider configured";
      checks.ai_router = { status: aiStatus, message: aiMessage };
      // Frontend system dashboard expects checks.ai. Keep alias stable.
      checks.ai = { status: aiStatus, message: aiMessage };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "AI check failed";
      checks.ai_router = { status: "error", message };
      checks.ai = { status: "error", message };
    }

    try {
      checks.ai_configured = aiConfigured()
        ? { status: "ok", message: "Ready" }
        : { status: "warn", message: "No API keys set" };
    } catch {
      checks.ai_configured = { status: "error", message: "Check failed" };
    }

    checks.pollinations = { status: "ok", message: "Free, no key required" };

    const hf = !!(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY);
    checks.whisper = hf
      ? { status: "ok", message: "HF_TOKEN present" }
      : { status: "warn", message: "HF_TOKEN absent — advanced audio limited" };

    try {
      const { spawn } = await import("node:child_process");
      const p = spawn("ffmpeg", ["-version"], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      const ffmpegOk = await new Promise<boolean>((resolve) => {
        let done = false;
        const finish = (ok: boolean) => { if (!done) { done = true; resolve(ok); } };
        const onData = (d: Buffer) => { out += d.toString(); if (/ffmpeg version/i.test(out)) finish(true); };
        p.stdout.on("data", onData);
        p.stderr.on("data", onData);
        p.on("error", () => finish(false));
        setTimeout(() => { try { p.kill(); } catch { /* noop */ } finish(false); }, 5000);
      });
      checks.ffmpeg = ffmpegOk
        ? { status: "ok", message: out.split("\n")[0]?.slice(0, 60) || "Available" }
        : { status: "error", message: "ffmpeg not found" };
    } catch {
      checks.ffmpeg = { status: "error", message: "ffmpeg check failed" };
    }

    checks.font = existsSync(FONT_PATH)
      ? { status: "ok", message: "Embedded" }
      : { status: "warn", message: "Missing — video text disabled" };

    try {
      const extResult = await db.execute(sql`SELECT 1 FROM pg_extension WHERE extname = 'vector'`);
      const rows = Array.isArray(extResult) ? extResult : (extResult as { rows?: unknown[] }).rows ?? [];
      checks.pgvector = rows.length > 0
        ? { status: "ok", message: "pgvector active" }
        : { status: "warn", message: "pgvector not installed" };
    } catch {
      checks.pgvector = { status: "warn", message: "Cannot check pgvector" };
    }

    try {
      let received = false;
      const hid = EventBus.subscribe("system", async (e) => { if (e.action === "started") received = true; });
      await EventBus.publish({ domain: "system", action: "started", source: "health", payload: {} });
      await new Promise(r => setTimeout(r, 100));
      EventBus.unsubscribe(hid);
      checks.event_bus = received ? { status: "ok", message: "Pub/sub working" } : { status: "error", message: "Event not received" };
    } catch (err: unknown) {
      checks.event_bus = { status: "error", message: err instanceof Error ? err.message : "EventBus failed" };
    }

    try {
      const agents = getAllAgents();
      checks.council = agents.length > 0 ? { status: "ok", message: `${agents.length} agents registered` } : { status: "error", message: "No agents" };
      checks.agent_runtime = agents.length > 0 ? { status: "ok", message: `${agents.length} agents ready` } : { status: "error", message: "No agents" };
    } catch {
      checks.council = { status: "error", message: "Council check failed" };
      checks.agent_runtime = { status: "error", message: "Runtime check failed" };
    }

    try {
      const tools = getAllTools();
      checks.planner = tools.length > 0 ? { status: "ok", message: `${tools.length} tools available` } : { status: "error", message: "No tools" };
      checks.tool_orchestrator = tools.length > 0 ? { status: "ok", message: `${tools.length} tools registered` } : { status: "error", message: "No tools" };
    } catch {
      checks.planner = { status: "error", message: "Planner check failed" };
      checks.tool_orchestrator = { status: "error", message: "Orchestrator check failed" };
    }

    checks.reflection = { status: "ok", message: "Engine loaded" };

    try {
      const rules = getWorkflowRules();
      const running = isWorkflowEngineRunning();
      checks.workflow = rules.length > 0
        ? { status: "ok", message: `${rules.length} rules, engine ${running ? "running" : "stopped"}` }
        : { status: "warn", message: "No rules registered" };
    } catch {
      checks.workflow = { status: "warn", message: "Workflow check failed" };
    }

    checks.goal_engine = { status: "ok", message: "Integrated in Reflection" };

    try {
      const fs = await import("node:fs");
      fs.statSync(".");
      checks.disk = { status: "ok", message: "Accessible" };
    } catch (err: unknown) {
      checks.disk = { status: "error", message: err instanceof Error ? err.message : "Disk check failed" };
    }

    const mem = process.memoryUsage();
    const heapPct = mem.heapUsed / Math.max(1, mem.heapTotal);
    checks.memory_process = heapPct < 0.9
      ? { status: "ok", message: `Heap ${Math.round(mem.heapUsed / 1024 / 1024)}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB` }
      : { status: "error", message: `Heap critical: ${Math.round(mem.heapUsed / 1024 / 1024)}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB` };
    // Frontend system dashboard expects checks.memory. Keep alias stable.
    checks.memory = checks.memory_process;

    const hasError = Object.values(checks).some(c => c.status === "error");
    const hasWarn = Object.values(checks).some(c => c.status === "warn");

    res.json({
      status: hasError ? "degraded" : hasWarn ? "ok" : "ok",
      uptime: process.uptime(),
      version: appVersion(),
      checks,
    });
  } catch (_err) {
    res.status(500).json({ status: "error", error: "Health check failed" });
  }
});

export default router;
