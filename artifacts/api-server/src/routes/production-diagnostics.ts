import { execFile } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Router } from "express";

const router = Router();
const execFileAsync = promisify(execFile);

type CheckStatus = "pass" | "warn" | "fail";

type Check = {
  status: CheckStatus;
  detail: string;
  data?: Record<string, unknown>;
};

function hasEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

function firstEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) return { name, value: value.trim() };
  }
  return null;
}

function safeBoolEnv(names: string[]) {
  return names.some(hasEnv);
}

async function checkFfmpeg(): Promise<Check> {
  try {
    const { stdout } = await execFileAsync("ffmpeg", ["-version"], { timeout: 4000, maxBuffer: 100_000 });
    const firstLine = stdout.split("\n")[0] || "ffmpeg available";
    return { status: "pass", detail: firstLine };
  } catch (error) {
    return { status: "fail", detail: error instanceof Error ? error.message : String(error) };
  }
}

async function checkTempWrite(): Promise<Check> {
  const dir = path.join(os.tmpdir(), "tams-diagnostics");
  const file = path.join(dir, `probe-${Date.now()}.txt`);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(file, "ok");
    await rm(file, { force: true });
    return { status: "pass", detail: "temp directory writable", data: { tmpdir: os.tmpdir() } };
  } catch (error) {
    return { status: "fail", detail: error instanceof Error ? error.message : String(error), data: { tmpdir: os.tmpdir() } };
  }
}

async function checkDatabase(): Promise<Check> {
  if (!hasEnv("DATABASE_URL")) return { status: "warn", detail: "DATABASE_URL missing" };
  try {
    const postgres = await import("postgres");
    const sql = postgres.default(process.env.DATABASE_URL as string, { max: 1, idle_timeout: 1, connect_timeout: 5 });
    const rows = await sql<{ ok: number }[]>`select 1 as ok`;
    await sql.end({ timeout: 1 });
    return rows?.[0]?.ok === 1 ? { status: "pass", detail: "database query ok" } : { status: "fail", detail: "unexpected database response" };
  } catch (error) {
    return { status: "fail", detail: error instanceof Error ? error.message : String(error) };
  }
}

function routeCheck(): Check {
  return {
    status: "pass",
    detail: "diagnostic route loaded; mounted routes should include Studio, GPU, Life OS, Dev Agent, health and version routers",
    data: {
      studio: ["/api/studio/generate-video", "/api/studio/generate-music", "/api/studio/generate-image", "/api/studio/providers/status"],
      gpu: ["/api/gpu/status", "/api/gpu/workers", "/api/gpu/jobs"],
      health: ["/api/healthz", "/api/version"],
    },
  };
}

function envStatus(): Record<string, boolean> {
  return {
    railwayDetected: safeBoolEnv(["RAILWAY_ENVIRONMENT", "RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID", "RAILWAY_DEPLOYMENT_ID"]),
    databaseConfigured: hasEnv("DATABASE_URL"),
    hfConfigured: safeBoolEnv(["HF_TOKEN", "HUGGINGFACE_API_KEY"]),
    n8nConfigured: hasEnv("N8N_WEBHOOK_URL"),
    gpuVideoConfigured: safeBoolEnv(["STUDIO_GPU_VIDEO_URL", "STUDIO_GPU_GENERAL_URL"]),
    gpuAudioConfigured: safeBoolEnv(["STUDIO_GPU_AUDIO_URL", "STUDIO_GPU_GENERAL_URL"]),
    gpuVoiceConfigured: safeBoolEnv(["STUDIO_GPU_VOICE_URL", "STUDIO_GPU_GENERAL_URL"]),
    gpuVisionConfigured: safeBoolEnv(["STUDIO_GPU_VISION_URL", "STUDIO_GPU_GENERAL_URL"]),
    googleClientConfigured: safeBoolEnv(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]),
    gmailRefreshConfigured: hasEnv("GMAIL_REFRESH_TOKEN"),
    calendarRefreshConfigured: hasEnv("GOOGLE_CALENDAR_REFRESH_TOKEN"),
  };
}

function commitInfo() {
  const git = firstEnv(["RAILWAY_GIT_COMMIT_SHA", "GIT_COMMIT_SHA", "VERCEL_GIT_COMMIT_SHA", "SOURCE_VERSION", "COMMIT_SHA"]);
  return {
    sha: git?.value ?? "unknown",
    sourceEnv: git?.name ?? null,
    deploymentIdPresent: safeBoolEnv(["RAILWAY_DEPLOYMENT_ID"]),
    serviceIdPresent: safeBoolEnv(["RAILWAY_SERVICE_ID"]),
    projectIdPresent: safeBoolEnv(["RAILWAY_PROJECT_ID"]),
  };
}

function summarize(checks: Record<string, Check>) {
  const statuses = Object.values(checks).map(c => c.status);
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warn")) return "warn";
  return "pass";
}

router.get("/_diagnostics/production", async (_req, res) => {
  const checks: Record<string, Check> = {
    routes: routeCheck(),
    tempWrite: await checkTempWrite(),
    ffmpeg: await checkFfmpeg(),
    database: await checkDatabase(),
  };

  const env = envStatus();
  const studioOperational = checks.ffmpeg.status === "pass" && checks.tempWrite.status === "pass";
  const exactState = {
    ok: summarize(checks) !== "fail",
    verdict: summarize(checks),
    checkedAt: new Date().toISOString(),
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      uptimeSec: Math.round(process.uptime()),
      cwd: process.cwd(),
      tmpdir: os.tmpdir(),
      env: process.env.NODE_ENV ?? "unknown",
    },
    deployment: commitInfo(),
    env,
    checks,
    capabilities: {
      studioVideoFallbackUsable: studioOperational,
      studioAudioFallbackUsable: checks.tempWrite.status === "pass",
      gpuWorkersUsable: env.gpuVideoConfigured || env.gpuAudioConfigured || env.gpuVoiceConfigured || env.gpuVisionConfigured,
      premiumVideoUsable: env.gpuVideoConfigured,
      databaseBackedFeaturesUsable: checks.database.status === "pass",
    },
    redTeam: {
      secretsExposed: false,
      productionTruth: "This endpoint reports runtime facts only. It does not prove the frontend currently shown in the browser is the latest build unless deployment.sha matches the expected GitHub commit.",
      nextChecks: [
        "Compare deployment.sha with latest GitHub main commit.",
        "Open /studio and verify it calls these production routes.",
        "Generate one video and confirm the returned media URL plays.",
      ],
    },
  };

  res.status(exactState.verdict === "fail" ? 503 : 200).json(exactState);
});

export default router;
