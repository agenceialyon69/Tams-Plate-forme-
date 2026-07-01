import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { runtimeEnabled } from "@workspace/scripts/dev-runtime-chat";
import { aiConfigured, aiProviders } from "../lib/ai";
import { existsSync } from "node:fs";

const router = Router();

/**
 * System readiness endpoint for Railway and ops checks.
 * Returns app health, runtime flag status, and provider availability.
 * Never exposes secret values — only presence/absence.
 */
router.get("/system/readiness", async (_req, res) => {
  const checks: Record<string, { ok: boolean; status: string; notes?: string }> = {};

  // App
  checks.app = { ok: true, status: "running" };

  // Database
  try {
    await db.execute(sql`SELECT 1`);
    checks.database = { ok: true, status: "connected" };
  } catch (err) {
    checks.database = {
      ok: false,
      status: "error",
      notes: err instanceof Error ? err.message : "DB unreachable",
    };
  }

  // AI providers
  try {
    const providers = aiProviders();
    checks.ai = {
      ok: aiConfigured(),
      status: providers.length > 0 ? `configured: ${providers.join(", ")}` : "no_provider",
    };
  } catch {
    checks.ai = { ok: false, status: "check_failed" };
  }

  // Runtime flag
  checks.dev_runtime = {
    ok: true,
    status: runtimeEnabled() ? "enabled" : "disabled",
    notes: runtimeEnabled()
      ? "TAMS_DEV_RUNTIME_ENABLED=true — runtime bridge active"
      : "TAMS_DEV_RUNTIME_ENABLED=false — runtime bridge off (safe default)",
  };

  // Unsafe actions (always false — hardcoded invariant)
  checks.unsafe_actions = {
    ok: true,
    status: "disabled",
    notes: "ENABLE_UNSAFE_RUNTIME_ACTIONS=false (hardcoded, not overridable)",
  };

  // Registry
  checks.registry = { ok: true, status: "available", notes: "GET /api/registry/status" };

  // FFmpeg
  try {
    const { spawn } = await import("node:child_process");
    const ok = await new Promise<boolean>((resolve) => {
      const p = spawn("ffmpeg", ["-version"], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      const onData = (d: Buffer) => { out += d.toString(); if (/ffmpeg version/i.test(out)) resolve(true); };
      p.stdout.on("data", onData);
      p.stderr.on("data", onData);
      p.on("error", () => resolve(false));
      setTimeout(() => { try { p.kill(); } catch { /**/ } resolve(false); }, 3000);
    });
    checks.ffmpeg = { ok, status: ok ? "available" : "missing", notes: ok ? "Video editing ready" : "Install ffmpeg" };
  } catch {
    checks.ffmpeg = { ok: false, status: "check_failed" };
  }

  // Railway detection
  const isRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME);
  checks.railway = {
    ok: true,
    status: isRailway ? "detected" : "not_detected",
    notes: isRailway
      ? `env=${process.env.RAILWAY_ENVIRONMENT ?? "unknown"}, service=${process.env.RAILWAY_SERVICE_NAME ?? "unknown"}`
      : "Running outside Railway (local or other platform)",
  };

  // Providers configured (presence only, no values)
  const configuredProviders: string[] = [];
  if (process.env.GROQ_API_KEY) configuredProviders.push("groq");
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) configuredProviders.push("gemini");
  if (process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY) configuredProviders.push("huggingface");
  if (process.env.OPENROUTER_API_KEY || process.env.OPENROUTE_API_KEY) configuredProviders.push("openrouter");
  if (process.env.GITHUB_TOKEN) configuredProviders.push("github");
  if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME || process.env.RAILWAY_TOKEN) configuredProviders.push("railway");

  const expectedProviders = ["groq", "gemini", "huggingface", "openrouter", "github", "railway"];
  const missingProviders = expectedProviders.filter(provider => !configuredProviders.includes(provider));
  checks.providers_configured = {
    ok: configuredProviders.length > 0,
    status: configuredProviders.length > 0 ? `configured: ${configuredProviders.join(", ")}` : "none_configured",
    notes: "Presence checks only; secret values are never returned. Pollinations requires no key.",
  };
  checks.providers_missing = {
    ok: true,
    status: missingProviders.length > 0 ? `missing_config: ${missingProviders.join(", ")}` : "none",
  };

  const allOk = Object.values(checks).every(c => c.ok);
  const hasFailure = Object.values(checks).some(c => !c.ok);

  return res.status(hasFailure ? 503 : 200).json({
    status: allOk ? "ready" : "degraded",
    timestamp: new Date().toISOString(),
    checks,
    limitations: [
      "MusicGen: requires local GPU — not available on Railway",
      "Whisper/Piper: planned, not yet connected",
      "Remotion: planned, not yet connected",
      "video.generate: planned only",
    ],
  });
});

export default router;
