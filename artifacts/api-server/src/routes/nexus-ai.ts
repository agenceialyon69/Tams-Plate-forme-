import { Router, type IRouter } from "express";
import { requireRole } from "../middlewares/auth-jwt";
import { rateLimitByUser } from "../middlewares/rate-limit";
import {
  isNexusConfigured,
  submitVideoJob,
  submitMusicJob,
  getJob,
  listJobs,
} from "../lib/integrations/nexus-ai";

const router: IRouter = Router();

// Heavy generation endpoints: max 6 per minute per user.
const genLimiter = rateLimitByUser({ windowMs: 60_000, max: 6 });

/**
 * GET /api/nexus/status
 * Returns whether the NexusAI worker is configured and which models are active.
 */
router.get("/nexus/status", requireRole("owner", "admin"), (_req, res): void => {
  const configured = isNexusConfigured();
  res.json({
    configured,
    workerUrl: configured ? "(configuré)" : null,
    models: {
      video: { id: "wan-2.1", name: "Wan 2.1 (14B) + FramePack", available: configured },
      music: { id: "ace-step-1.5", name: "ACE-Step 1.5", available: configured },
    },
    note: configured
      ? "Worker NexusAI connecté — génération GPU active."
      : "NEXUS_AI_URL non configuré — les jobs sont enregistrés en file d'attente.",
  });
});

/**
 * POST /api/nexus/video/generate
 * Submit a text-to-video job via Wan 2.1 + FramePack.
 * Body: { prompt, format?, duration?, style?, frames?, guidance?, seed? }
 */
router.post(
  "/nexus/video/generate",
  requireRole("owner", "admin"),
  genLimiter,
  async (req, res): Promise<void> => {
    const body = (req.body ?? {}) as {
      prompt?: unknown;
      format?: unknown;
      duration?: unknown;
      style?: unknown;
      frames?: unknown;
      guidance?: unknown;
      seed?: unknown;
    };

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      res.status(400).json({ error: "Prompt requis." });
      return;
    }

    const FORMATS = new Set(["9:16", "1:1", "16:9"]);
    const format = FORMATS.has(String(body.format)) ? String(body.format) : "9:16";
    const duration = Math.min(Math.max(Number(body.duration) || 5, 2), 30);
    const style = typeof body.style === "string" ? body.style.slice(0, 50) : undefined;
    const frames = Number(body.frames) || undefined;
    const guidance = Number(body.guidance) || undefined;
    const seed = Number(body.seed) || undefined;

    try {
      const jobId = await submitVideoJob(
        prompt,
        { format, duration, style, frames, guidance, seed },
        req.authUser?.id,
        req.tenantId
      );
      res.status(202).json({
        jobId,
        model: "wan-2.1",
        status: "pending",
        message: isNexusConfigured()
          ? "Job envoyé au worker GPU NexusAI."
          : "Job enregistré — connectez NEXUS_AI_URL pour la génération GPU.",
        pollUrl: `/api/nexus/jobs/${jobId}`,
      });
    } catch (err) {
      res.status(500).json({ error: "Impossible de créer le job.", detail: String(err).slice(0, 200) });
    }
  }
);

/**
 * POST /api/nexus/music/generate
 * Submit a music generation job via ACE-Step 1.5.
 * Body: { prompt, duration?, genre?, mood?, vocal?, bpm?, seed? }
 */
router.post(
  "/nexus/music/generate",
  requireRole("owner", "admin"),
  genLimiter,
  async (req, res): Promise<void> => {
    const body = (req.body ?? {}) as {
      prompt?: unknown;
      duration?: unknown;
      genre?: unknown;
      mood?: unknown;
      vocal?: unknown;
      bpm?: unknown;
      seed?: unknown;
    };

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      res.status(400).json({ error: "Prompt / paroles requis." });
      return;
    }

    const DURATIONS = new Set([15, 30, 60, 90]);
    const rawDur = Number(body.duration);
    const duration = DURATIONS.has(rawDur) ? rawDur : 30;
    const genre = typeof body.genre === "string" ? body.genre.slice(0, 50) : undefined;
    const mood = typeof body.mood === "string" ? body.mood.slice(0, 50) : undefined;
    const vocal = body.vocal === true || body.vocal === "true";
    const bpm = Number(body.bpm) || undefined;
    const seed = Number(body.seed) || undefined;

    try {
      const jobId = await submitMusicJob(
        prompt,
        { duration, genre, mood, vocal, bpm, seed },
        req.authUser?.id,
        req.tenantId
      );
      res.status(202).json({
        jobId,
        model: "ace-step-1.5",
        status: "pending",
        message: isNexusConfigured()
          ? "Job envoyé au worker GPU NexusAI."
          : "Job enregistré — connectez NEXUS_AI_URL pour la génération GPU.",
        pollUrl: `/api/nexus/jobs/${jobId}`,
      });
    } catch (err) {
      res.status(500).json({ error: "Impossible de créer le job.", detail: String(err).slice(0, 200) });
    }
  }
);

/**
 * GET /api/nexus/jobs/:id
 * Poll the status of a media generation job.
 */
router.get("/nexus/jobs/:id", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const job = await getJob(String(req.params.id));
    if (!job) {
      res.status(404).json({ error: "Job introuvable." });
      return;
    }
    // Strip heavy base64 from list responses.
    const { resultBase64, ...rest } = job;
    res.json({
      ...rest,
      hasResult: Boolean(resultBase64),
      resultBase64: job.status === "done" ? resultBase64 : undefined,
    });
  } catch (err) {
    res.status(500).json({ error: "Erreur de lecture du job.", detail: String(err).slice(0, 200) });
  }
});

/**
 * GET /api/nexus/jobs
 * List the 20 most recent jobs for the current tenant.
 */
router.get("/nexus/jobs", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const jobs = await listJobs(req.tenantId, 20);
    res.json({
      jobs: jobs.map(({ resultBase64, ...j }) => ({ ...j, hasResult: Boolean(resultBase64) })),
    });
  } catch (err) {
    res.status(500).json({ error: "Erreur de lecture des jobs.", detail: String(err).slice(0, 200) });
  }
});

export default router;
