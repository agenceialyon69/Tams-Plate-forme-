import { randomUUID } from "node:crypto";
import { Router } from "express";

const router = Router();

type GpuKind = "video" | "image" | "audio" | "voice" | "vision" | "general";
type GpuJobStatus = "queued" | "running" | "success" | "failed" | "missing_config";
type WorkerLookup = { key: string; url: string };
type WorkerStatus = "connected" | "configured_unverified" | "failed" | "missing_config";

type GpuJob = {
  id: string;
  kind: GpuKind;
  prompt: string;
  status: GpuJobStatus;
  workerId?: string;
  url?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

const jobs = new Map<string, GpuJob>();
const validKinds: GpuKind[] = ["video", "image", "audio", "voice", "vision", "general"];
const mediaKinds: GpuKind[] = ["video", "image", "audio", "voice"];

function env(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function now() {
  return new Date().toISOString();
}

function isGpuKind(value: string): value is GpuKind {
  return validKinds.includes(value as GpuKind);
}

function workerUrl(kind: GpuKind): WorkerLookup | null {
  const byKind: Record<GpuKind, string[]> = {
    video: ["STUDIO_GPU_VIDEO_URL", "STUDIO_GPU_GENERAL_URL"],
    image: ["STUDIO_GPU_IMAGE_URL", "STUDIO_GPU_GENERAL_URL"],
    audio: ["STUDIO_GPU_AUDIO_URL", "STUDIO_GPU_GENERAL_URL"],
    voice: ["STUDIO_GPU_VOICE_URL", "STUDIO_GPU_GENERAL_URL"],
    vision: ["STUDIO_GPU_VISION_URL", "STUDIO_GPU_GENERAL_URL"],
    general: ["STUDIO_GPU_GENERAL_URL"],
  };
  for (const key of byKind[kind]) {
    const value = env(key);
    if (value) return { key, url: value };
  }
  return null;
}

function healthUrl(url: string) {
  if (url.endsWith("/generate")) return url.replace(/\/generate$/, "/health");
  return `${url.replace(/\/$/, "")}/health`;
}

async function verifyWorker(found: WorkerLookup | null) {
  if (!found) {
    return {
      status: "missing_config" as WorkerStatus,
      endpointConfigured: false,
      env: null,
      healthUrl: null,
      note: "Set the matching STUDIO_GPU_*_URL variable to connect a real worker.",
    };
  }

  const url = healthUrl(found.url);
  try {
    const response = await fetch(url, { method: "GET", signal: AbortSignal.timeout(5000) });
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (response.ok && data.ok !== false) {
      return {
        status: "connected" as WorkerStatus,
        endpointConfigured: true,
        env: found.key,
        healthUrl: url,
        note: "Worker /health responded successfully.",
      };
    }
    return {
      status: "failed" as WorkerStatus,
      endpointConfigured: true,
      env: found.key,
      healthUrl: url,
      note: `Worker /health returned HTTP ${response.status}.`,
    };
  } catch (error) {
    return {
      status: "configured_unverified" as WorkerStatus,
      endpointConfigured: true,
      env: found.key,
      healthUrl: url,
      note: error instanceof Error ? error.message : String(error),
    };
  }
}

async function workers() {
  return Promise.all(validKinds.map(async kind => {
    const found = workerUrl(kind);
    const verification = await verifyWorker(found);
    return {
      id: `gpu-${kind}`,
      kind,
      ...verification,
    };
  }));
}

router.get("/gpu/status", async (_req, res) => {
  const list = await workers();
  return res.json({
    ok: true,
    architecture: "api_orchestrator_plus_external_gpu_workers",
    honestLimit: "The API server does not host GPU models. It routes work to external workers when configured and verified.",
    connected: list.filter(w => w.status === "connected").length,
    configured: list.filter(w => w.endpointConfigured).length,
    workers: list,
    jobCount: jobs.size,
  });
});

router.get("/gpu/workers", async (_req, res) => {
  return res.json({ ok: true, workers: await workers() });
});

router.get("/gpu/jobs", (_req, res) => {
  return res.json({ ok: true, jobs: [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50) });
});

router.get("/gpu/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: "gpu_job_not_found" });
  return res.json({ ok: true, job });
});

router.post("/gpu/jobs", async (req, res) => {
  const rawKind = String(req.body?.kind ?? "video");
  const prompt = String(req.body?.prompt ?? req.body?.text ?? "").trim();
  if (!isGpuKind(rawKind)) {
    return res.status(400).json({ ok: false, error: "invalid_gpu_kind" });
  }
  if (!prompt) return res.status(400).json({ ok: false, error: "prompt_required" });

  const kind = rawKind;
  const job: GpuJob = { id: randomUUID(), kind, prompt, status: "queued", createdAt: now(), updatedAt: now() };
  jobs.set(job.id, job);

  const worker = workerUrl(kind);
  if (!worker) {
    job.status = "missing_config";
    job.error = `No worker URL configured for ${kind}.`;
    job.updatedAt = now();
    return res.status(503).json({ ok: false, job, missingConfig: true, requiredEnv: `STUDIO_GPU_${kind.toUpperCase()}_URL or STUDIO_GPU_GENERAL_URL` });
  }

  job.status = "running";
  job.workerId = worker.key;
  job.updatedAt = now();

  try {
    const response = await fetch(worker.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job.id, kind, prompt, input: req.body?.input ?? {}, source: "tams" }),
      signal: AbortSignal.timeout(180_000),
    });
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok || data.ok === false) {
      job.status = "failed";
      job.error = String(data.error || data.detail || `worker_http_${response.status}`);
      job.updatedAt = now();
      return res.status(response.ok ? 502 : response.status).json({ ok: false, job, result: data });
    }

    const url = typeof data.url === "string" ? data.url : typeof data.artifactUrl === "string" ? data.artifactUrl : undefined;
    if (mediaKinds.includes(kind) && !url) {
      job.status = "failed";
      job.error = "Worker returned ok:true but no media URL. Refusing fake success.";
      job.updatedAt = now();
      return res.status(502).json({ ok: false, job, result: data });
    }

    job.status = "success";
    if (url) job.url = url;
    job.updatedAt = now();
    return res.json({ ok: true, job, result: data });
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    job.updatedAt = now();
    return res.status(502).json({ ok: false, job });
  }
});

export default router;
