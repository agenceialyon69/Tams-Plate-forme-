import { randomUUID } from "crypto";
import { pool } from "@workspace/db";

export type MediaJobType = "video" | "music";
export type MediaModel = "wan-2.1" | "ace-step-1.5";
export type JobStatus = "pending" | "processing" | "done" | "failed";

export interface MediaJob {
  id: string;
  type: MediaJobType;
  model: MediaModel;
  status: JobStatus;
  prompt: string;
  params: Record<string, unknown> | null;
  resultUrl: string | null;
  resultBase64: string | null;
  resultMime: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export function isNexusConfigured(): boolean {
  return Boolean(process.env.NEXUS_AI_URL?.trim());
}

function nexusUrl(path: string): string {
  const base = (process.env.NEXUS_AI_URL ?? "").replace(/\/$/, "");
  return `${base}${path}`;
}

/** Create a job row in the database. Returns the job id. */
async function createJobRecord(
  type: MediaJobType,
  model: MediaModel,
  prompt: string,
  params: Record<string, unknown>,
  userId?: number,
  tenantId?: number
): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO ai_media_jobs
       (id, user_id, tenant_id, type, model, status, prompt, params, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,now(),now())`,
    [id, userId ?? null, tenantId ?? null, type, model, prompt, JSON.stringify(params)]
  );
  return id;
}

/** Update job status + result (or error). */
async function updateJob(
  id: string,
  status: JobStatus,
  opts: {
    resultUrl?: string;
    resultBase64?: string;
    resultMime?: string;
    error?: string;
  } = {}
): Promise<void> {
  await pool.query(
    `UPDATE ai_media_jobs
     SET status=$2, result_url=$3, result_base64=$4, result_mime=$5, error=$6, updated_at=now()
     WHERE id=$1`,
    [id, status, opts.resultUrl ?? null, opts.resultBase64 ?? null, opts.resultMime ?? null, opts.error ?? null]
  );
}

/** Fetch a job from the database. */
export async function getJob(id: string): Promise<MediaJob | null> {
  const res = await pool.query(
    `SELECT id,type,model,status,prompt,params,result_url,result_base64,result_mime,error,created_at,updated_at
     FROM ai_media_jobs WHERE id=$1`,
    [id]
  );
  if (!res.rows[0]) return null;
  const r = res.rows[0];
  return {
    id: r.id,
    type: r.type,
    model: r.model,
    status: r.status,
    prompt: r.prompt,
    params: r.params,
    resultUrl: r.result_url,
    resultBase64: r.result_base64,
    resultMime: r.result_mime,
    error: r.error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** List recent jobs for a tenant. */
export async function listJobs(tenantId: number | undefined, limit = 20): Promise<MediaJob[]> {
  const res = await pool.query(
    `SELECT id,type,model,status,prompt,params,result_url,result_base64,result_mime,error,created_at,updated_at
     FROM ai_media_jobs
     WHERE ($1::integer IS NULL OR tenant_id=$1)
     ORDER BY created_at DESC LIMIT $2`,
    [tenantId ?? null, limit]
  );
  return res.rows.map((r) => ({
    id: r.id,
    type: r.type,
    model: r.model,
    status: r.status,
    prompt: r.prompt,
    params: r.params,
    resultUrl: r.result_url,
    resultBase64: r.result_base64,
    resultMime: r.result_mime,
    error: r.error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/**
 * Submit a video generation job (Wan 2.1 + FramePack).
 * If the NexusAI worker is configured, dispatches immediately.
 * Otherwise, the job stays in 'pending' state until a worker picks it up.
 */
export async function submitVideoJob(
  prompt: string,
  params: {
    format?: string;        // "9:16" | "1:1" | "16:9"
    duration?: number;      // seconds
    style?: string;
    frames?: number;
    guidance?: number;
    seed?: number;
  },
  userId?: number,
  tenantId?: number
): Promise<string> {
  const id = await createJobRecord("video", "wan-2.1", prompt, params, userId, tenantId);

  if (!isNexusConfigured()) return id;

  // Fire-and-forget dispatch to the NexusAI worker.
  dispatchToWorker(id, "video", prompt, params).catch((err) =>
    updateJob(id, "failed", { error: String(err).slice(0, 500) })
  );

  return id;
}

/**
 * Submit a music generation job (ACE-Step 1.5).
 */
export async function submitMusicJob(
  prompt: string,
  params: {
    duration?: number;      // seconds (15 | 30 | 60 | 90)
    genre?: string;
    mood?: string;
    vocal?: boolean;
    bpm?: number;
    seed?: number;
  },
  userId?: number,
  tenantId?: number
): Promise<string> {
  const id = await createJobRecord("music", "ace-step-1.5", prompt, params, userId, tenantId);

  if (!isNexusConfigured()) return id;

  dispatchToWorker(id, "music", prompt, params).catch((err) =>
    updateJob(id, "failed", { error: String(err).slice(0, 500) })
  );

  return id;
}

/** Dispatch a job to the NexusAI worker and update the DB with the result. */
async function dispatchToWorker(
  jobId: string,
  type: MediaJobType,
  prompt: string,
  params: Record<string, unknown>
): Promise<void> {
  await updateJob(jobId, "processing");

  const endpoint = type === "video" ? "/generate/video" : "/generate/music";
  const controller = new AbortController();
  // Allow up to 10 minutes for GPU inference.
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);

  let resp: Response;
  try {
    resp = await fetch(nexusUrl(endpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId, prompt, ...params }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`NexusAI worker ${resp.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await resp.json()) as {
    result_base64?: string;
    result_url?: string;
    mime_type?: string;
  };

  await updateJob(jobId, "done", {
    resultBase64: data.result_base64,
    resultUrl: data.result_url,
    resultMime: data.mime_type ?? (type === "video" ? "video/mp4" : "audio/mpeg"),
  });
}
