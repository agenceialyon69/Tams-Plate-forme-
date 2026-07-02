import { execFile } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Router } from "express";

const router = Router();
const execFileAsync = promisify(execFile);

type CheckStatus = "pass" | "warn" | "fail";
type Check = { status: CheckStatus; detail: string; data?: Record<string, unknown> };

function has(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

function any(names: string[]) {
  return names.some(has);
}

function first(names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) return { source: name, value: value.trim() };
  }
  return null;
}

async function ffmpegCheck(): Promise<Check> {
  try {
    const { stdout } = await execFileAsync("ffmpeg", ["-version"], { timeout: 4000, maxBuffer: 80_000 });
    return { status: "pass", detail: stdout.split("\n")[0] || "ffmpeg available" };
  } catch (error) {
    return { status: "fail", detail: error instanceof Error ? error.message : String(error) };
  }
}

async function tempCheck(): Promise<Check> {
  const dir = path.join(os.tmpdir(), "tams-diagnostics");
  const file = path.join(dir, `probe-${Date.now()}.txt`);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(file, "ok");
    await rm(file, { force: true });
    return { status: "pass", detail: "temp writable", data: { tmpdir: os.tmpdir() } };
  } catch (error) {
    return { status: "fail", detail: error instanceof Error ? error.message : String(error), data: { tmpdir: os.tmpdir() } };
  }
}

function dbCheck(): Check {
  return has("DATABASE_URL")
    ? { status: "pass", detail: "database env configured; query not executed by public diagnostics" }
    : { status: "warn", detail: "database env missing" };
}

function routesCheck(): Check {
  return {
    status: "pass",
    detail: "diagnostic route is loaded",
    data: {
      studio: ["/api/studio/generate-video", "/api/studio/generate-music", "/api/studio/generate-image"],
      gpu: ["/api/gpu/status", "/api/gpu/jobs"],
      system: ["/api/healthz", "/api/version"],
    },
  };
}

function verdict(checks: Record<string, Check>) {
  const values = Object.values(checks).map(c => c.status);
  if (values.includes("fail")) return "fail";
  if (values.includes("warn")) return "warn";
  return "pass";
}

router.get("/_diagnostics/production", async (_req, res) => {
  const checks: Record<string, Check> = {
    routes: routesCheck(),
    tempWrite: await tempCheck(),
    ffmpeg: await ffmpegCheck(),
    database: dbCheck(),
  };

  const commit = first(["RAILWAY_GIT_COMMIT_SHA", "GIT_COMMIT_SHA", "SOURCE_VERSION", "COMMIT_SHA"]);
  const env = {
    railwayDetected: any(["RAILWAY_ENVIRONMENT", "RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID", "RAILWAY_DEPLOYMENT_ID"]),
    databaseConfigured: has("DATABASE_URL"),
    audioProviderConfigured: any(["HF_TOKEN", "HUGGINGFACE_API_KEY"]),
    workflowProviderConfigured: has("N8N_WEBHOOK_URL"),
    gpuVideoConfigured: any(["STUDIO_GPU_VIDEO_URL", "STUDIO_GPU_GENERAL_URL"]),
    gpuAudioConfigured: any(["STUDIO_GPU_AUDIO_URL", "STUDIO_GPU_GENERAL_URL"]),
    gpuVoiceConfigured: any(["STUDIO_GPU_VOICE_URL", "STUDIO_GPU_GENERAL_URL"]),
    gpuVisionConfigured: any(["STUDIO_GPU_VISION_URL", "STUDIO_GPU_GENERAL_URL"]),
  };

  const v = verdict(checks);
  const studioFallback = checks.ffmpeg.status === "pass" && checks.tempWrite.status === "pass";

  res.status(v === "fail" ? 503 : 200).json({
    ok: v !== "fail",
    verdict: v,
    checkedAt: new Date().toISOString(),
    deployment: {
      sha: commit?.value ?? "unknown",
      shaSource: commit?.source ?? null,
      railway: env.railwayDetected,
    },
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      uptimeSec: Math.round(process.uptime()),
      tmpdir: os.tmpdir(),
      nodeEnv: process.env.NODE_ENV ?? "unknown",
    },
    env,
    checks,
    capabilities: {
      studioVideoFallbackUsable: studioFallback,
      studioAudioFallbackUsable: checks.tempWrite.status === "pass",
      gpuWorkersUsable: env.gpuVideoConfigured || env.gpuAudioConfigured || env.gpuVoiceConfigured || env.gpuVisionConfigured,
      premiumVideoUsable: env.gpuVideoConfigured,
      databaseBackedFeaturesLikelyUsable: env.databaseConfigured,
    },
    safety: {
      secretsExposed: false,
      note: "Only booleans and runtime facts are returned. Secret values are never returned.",
    },
    nextChecks: [
      "Compare deployment.sha with the latest GitHub main commit.",
      "Open /studio and verify one video returns a playable media URL.",
      "If deployment.sha is unknown or old, Railway is not deploying the expected commit.",
    ],
  });
});

export default router;
