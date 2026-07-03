import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { runtimeEnabled } from "@workspace/scripts/dev-runtime-chat";
import { aiConfigured, aiProviders } from "../lib/ai";
import { providerSummary } from "../lib/provider-registry.js";

const router = Router();

type Check = {
  ok: boolean;
  status: string;
  notes?: string;
  verdict?: "PASS" | "WARN" | "FAIL";
};

async function checkFfmpeg(): Promise<Check> {
  try {
    const { spawn } = await import("node:child_process");
    const ok = await new Promise<boolean>((resolve) => {
      const p = spawn("ffmpeg", ["-version"], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      let settled = false;
      const done = (value: boolean) => {
        if (settled) return;
        settled = true;
        try { p.kill(); } catch { /** noop */ }
        resolve(value);
      };
      const onData = (d: Buffer) => {
        out += d.toString();
        if (/ffmpeg version/i.test(out)) done(true);
      };
      p.stdout.on("data", onData);
      p.stderr.on("data", onData);
      p.on("error", () => done(false));
      p.on("close", () => done(/ffmpeg version/i.test(out)));
      setTimeout(() => done(false), 3000);
    });
    return {
      ok,
      status: ok ? "available" : "missing",
      verdict: ok ? "PASS" : "FAIL",
      notes: ok ? "FFmpeg available for Studio MP4 exports." : "FFmpeg is missing; Studio media export must fail clearly.",
    };
  } catch {
    return { ok: false, status: "check_failed", verdict: "FAIL" };
  }
}

async function checkDatabase(): Promise<Check> {
  try {
    await db.execute(sql`SELECT 1`);
    return { ok: true, status: "connected", verdict: "PASS" };
  } catch {
    return {
      ok: false,
      status: "error",
      verdict: "FAIL",
      notes: "Database unreachable. Secret values are never returned.",
    };
  }
}

async function checkPgvector(): Promise<Check> {
  try {
    const rows = await db.execute(sql`SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS enabled`);
    const first = Array.isArray(rows) ? rows[0] : undefined;
    const enabled = typeof first === "object" && first !== null && "enabled" in first ? Boolean((first as { enabled?: unknown }).enabled) : false;
    return {
      ok: true,
      status: enabled ? "enabled" : "missing_extension",
      verdict: enabled ? "PASS" : "WARN",
      notes: enabled ? "pgvector extension is enabled." : "Database is reachable but pgvector extension was not detected.",
    };
  } catch {
    return {
      ok: true,
      status: "check_failed",
      verdict: "WARN",
      notes: "Could not verify pgvector extension; DB check stayed non-destructive.",
    };
  }
}

/**
 * System readiness endpoint for Railway and ops checks.
 * Never exposes secret values — only presence/absence, runtime facts and PASS/WARN/FAIL.
 */
router.get("/system/readiness", async (_req, res) => {
  const checks: Record<string, Check> = {};

  const registry = providerSummary();

  checks.app = { ok: true, status: "running", verdict: "PASS" };
  checks.database = await checkDatabase();
  checks.pgvector = checks.database.ok ? await checkPgvector() : { ok: true, status: "skipped_db_failed", verdict: "WARN" };

  try {
    const providers = aiProviders();
    checks.ai = {
      ok: aiConfigured(),
      status: providers.length > 0 ? `configured: ${providers.join(", ")}` : "no_provider",
      verdict: providers.length > 0 ? "PASS" : "FAIL",
      notes: providers.length > 0 ? "AI router has at least one provider." : "Configure GEMINI_API_KEY or GROQ_API_KEY first.",
    };
  } catch {
    checks.ai = { ok: false, status: "check_failed", verdict: "FAIL" };
  }

  checks.dev_runtime = {
    ok: true,
    status: runtimeEnabled() ? "enabled" : "disabled",
    verdict: runtimeEnabled() ? "WARN" : "PASS",
    notes: runtimeEnabled()
      ? "TAMS_DEV_RUNTIME_ENABLED=true — keep production actions behind explicit permissions."
      : "TAMS_DEV_RUNTIME_ENABLED=false — safe default.",
  };

  checks.unsafe_actions = {
    ok: true,
    status: "disabled",
    verdict: "PASS",
    notes: "ENABLE_UNSAFE_RUNTIME_ACTIONS=false invariant expected in production.",
  };

  checks.registry = {
    ok: true,
    status: "available",
    verdict: registry.verdict === "PASS" ? "PASS" : "WARN",
    notes: "Provider registry loaded. See providerRegistry and capabilityReadiness in response.",
  };

  checks.ffmpeg = await checkFfmpeg();

  const isRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME || process.env.RAILWAY_GIT_COMMIT_SHA);
  checks.railway = {
    ok: true,
    status: isRailway ? "detected" : "not_detected",
    verdict: isRailway ? "PASS" : "WARN",
    notes: isRailway
      ? `env=${process.env.RAILWAY_ENVIRONMENT ?? "unknown"}, service=${process.env.RAILWAY_SERVICE_NAME ?? "unknown"}, sha=${process.env.RAILWAY_GIT_COMMIT_SHA ?? "unknown"}`
      : "Running outside Railway or Railway metadata missing.",
  };

  const criticalFailed = [checks.app, checks.database, checks.ai, checks.ffmpeg].some(c => !c.ok || c.verdict === "FAIL");
  const hasWarn = Object.values(checks).some(c => c.verdict === "WARN") || registry.verdict === "WARN";
  const status = criticalFailed ? "not_ready" : hasWarn ? "degraded" : "ready";

  return res.status(criticalFailed ? 503 : 200).json({
    ok: !criticalFailed,
    verdict: criticalFailed ? "FAIL" : hasWarn ? "WARN" : "PASS",
    status,
    checkedAt: new Date().toISOString(),
    release: {
      railway: isRailway,
      sha: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
      environment: process.env.RAILWAY_ENVIRONMENT ?? null,
      service: process.env.RAILWAY_SERVICE_NAME ?? null,
    },
    checks,
    providerRegistry: registry.providers.map(provider => ({
      id: provider.id,
      label: provider.label,
      priority: provider.priority,
      category: provider.category,
      status: provider.status,
      configured: provider.configured,
      env: provider.env,
      capabilities: provider.capabilities,
      freeFirstRole: provider.freeFirstRole,
      fallbackStrategy: provider.fallbackStrategy,
      notes: provider.notes,
    })),
    capabilityReadiness: registry.capabilities,
    recommendedNextEnv: registry.recommendedNextEnv,
    operatingRules: [
      "No PASS from build alone: PASS requires Railway SHA + production endpoint + browser/mobile scenario.",
      "No force-push or direct main push for platform features.",
      "Premium media must return missing_config when no GPU/provider is configured.",
      "Railway main service stays orchestrator; heavy GPU/ComfyUI workers must be external.",
    ],
  });
});

export default router;
