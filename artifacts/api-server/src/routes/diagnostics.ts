import { Router, type IRouter } from "express";
import { db, getDbStatus } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireRole } from "../middlewares/auth-jwt";

const router: IRouter = Router();

router.get("/diagnostics", requireRole("admin", "owner"), async (req, res): Promise<void> => {
  const startTime = Date.now();
  const checks: Record<string, { status: "ok" | "warn" | "error"; detail?: string; latencyMs?: number }> = {};

  // DB check
  try {
    const t0 = Date.now();
    await db.execute(sql`SELECT 1`);
    checks.database = { status: "ok", latencyMs: Date.now() - t0 };
  } catch (err) {
    checks.database = { status: "error", detail: String(err) };
  }

  // Gemini API key
  checks.gemini = process.env.GEMINI_API_KEY
    ? { status: "ok", detail: "configured" }
    : { status: "warn", detail: "GEMINI_API_KEY not set — AI features unavailable" };

  // Groq API key
  checks.groq = process.env.GROQ_API_KEY
    ? { status: "ok", detail: "configured" }
    : { status: "warn", detail: "GROQ_API_KEY not set — voice transcription unavailable" };

  // Auth token
  checks.auth = process.env.API_AUTH_TOKEN && process.env.API_AUTH_TOKEN.length >= 16
    ? { status: "ok" }
    : { status: "error", detail: "API_AUTH_TOKEN missing or too short" };

  // Env
  checks.environment = {
    status: "ok",
    detail: process.env.NODE_ENV ?? "development",
  };

  // Memory usage
  const mem = process.memoryUsage();
  const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMb = Math.round(mem.heapTotal / 1024 / 1024);
  const heapPct = Math.round((mem.heapUsed / mem.heapTotal) * 100);
  checks.memory = {
    status: heapPct > 90 ? "warn" : "ok",
    detail: `${heapUsedMb}MB / ${heapTotalMb}MB (${heapPct}%)`,
  };

  // Uptime
  const uptimeSec = Math.round(process.uptime());
  checks.uptime = {
    status: "ok",
    detail: `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m ${uptimeSec % 60}s`,
  };

  const allStatuses = Object.values(checks).map((c) => c.status);
  const overall = allStatuses.includes("error") ? "error" : allStatuses.includes("warn") ? "warn" : "ok";

  res.json({
    overall,
    checks,
    latencyMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    dbStatus: getDbStatus(),
  });
});

export default router;
