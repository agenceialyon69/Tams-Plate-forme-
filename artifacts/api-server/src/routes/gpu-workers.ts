import { randomUUID } from "node:crypto";
import { Router } from "express";

const router = Router();

type GpuKind = "video" | "image" | "audio" | "voice" | "vision" | "general";
type GpuJobStatus = "queued" | "running" | "success" | "failed" | "missing_config";

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

function env(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function now() {
  return new Date().toISOString();
}

function workerUrl(kind: GpuKind) {
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

function workers() {
  const kinds: GpuKind[] = ["video", "image", "audio", "voice", "vision", "general"];
  return kinds.map(kind => {
    const found = workerUrl(kind);
    return {
      id: `gpu-${kind}`,
      kind,
      status: found ? "connected" : "missing_config",
      env: found?.key ?? null,
      endpointConfigured: Boolean(found),
      note: found ? "External GPU worker is configured." : "Set the matching STUDIO_GPU_*_URL variable to connect a real GPU worker.",
    };
  });
}

router.get("/gpu/status", (_req, res) => {
  const list = workers();
  return res.json({
    ok: true,
    architecture: "api_orchestrator_plus_external_gpu_workers",
    honestLimit: "The API server does not host GPU models. It routes work to external GPU workers when configured.",
    connected: list.filter(w => w.status === "connected").length,
    workers: list,
    jobCount: jobs.size,
  });
});

router.get("/gpu/workers", (_req, res) => {
  return res.json({ ok: true, workers: workers() });
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
  const kind = String(req.body?.kind ?? "video") as GpuKind;
  const prompt = String(req.body?.prompt ?? req.body?.text ?? "").trim();
  if (!["video", "image", "audio", "voice", "vision", "general"].includes(kind)) {
    return res.status(400).json({ ok: false, error: "invalid_gpu_kind" });
  }
  if (!prompt) return res.status(400).json({ ok: false, error: "prompt_required" });

  const job: GpuJob = { id: randomUUID(), kind, prompt, status: "queued", createdAt: now(), updatedAt: now() };
  jobs.set(job.id, job);

  const worker = workerUrl(kind);
  if (!worker) {
    job.status = "missing_config";
    job.error = `No GPU worker URL configured for ${kind}.`;
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
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      job.status = "failed";
      job.error = String(data?.error || data?.detail || `worker_http_${response.status}`);
      job.updatedAt = now();
      return res.status(502).json({ ok: false, job });
    }
    const url = typeof data?.url === "string" ? data.url : typeof data?.artifactUrl === "string" ? data.artifactUrl : undefined;
    job.status = "success";
    job.url = url;
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
