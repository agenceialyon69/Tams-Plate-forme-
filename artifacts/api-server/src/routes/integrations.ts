import { Router, type IRouter } from "express";
import { requireRole } from "../middlewares/auth-jwt";
import {
  isGithubConfigured,
  githubViewer,
  listRepos,
  listIssues,
  createIssue,
} from "../lib/integrations/github";
import { ffmpegStatus, probeBase64, extractAudioBase64 } from "../lib/integrations/ffmpeg";
import { generateImage, imageProviders, isImageGenAvailable } from "../lib/integrations/image-gen";
import { makeSlideshow, captionsAvailable } from "../lib/integrations/video-maker";
import { searchProviders } from "../lib/integrations/web-search";
import { configuredProviders } from "../lib/llm";
import { trackMediaGenerated } from "../lib/events";
import { transcribeAudio } from "../lib/ai";
import { rateLimitByUser } from "../middlewares/rate-limit";

// Tight limit for the (external, heavier) image generation endpoint.
const imageLimiter = rateLimitByUser({ windowMs: 60_000, max: 15 });
// Video assembly is CPU-heavy; keep it modest.
const videoLimiter = rateLimitByUser({ windowMs: 60_000, max: 6 });

const router: IRouter = Router();

/**
 * External integrations (modular, feature-flagged). Each integration only
 * activates when its credentials are present; otherwise the status endpoint
 * reports it as disabled and the data endpoints return 503. All routes are
 * restricted to owner/admin — these touch the owner's external accounts.
 */

/**
 * GET /api/integrations/status — single source of truth for what is actually
 * configured server-side (env vars), so the UI can show a real green/red state
 * instead of guessing. No external calls (except cached ffmpeg check).
 */
router.get(
  "/integrations/status",
  requireRole("owner", "admin"),
  async (_req, res): Promise<void> => {
    const ff = await ffmpegStatus();
    res.json({
      ai: {
        preferred: (process.env.AI_PROVIDER || "auto").toLowerCase(),
        providers: configuredProviders(), // gemini / groq / openrouter / ollama
      },
      webSearch: { providers: searchProviders() },
      imageGeneration: { configured: isImageGenAvailable(), providers: imageProviders() },
      github: { configured: isGithubConfigured() },
      ffmpeg: { available: ff.available, version: ff.version },
    });
  }
);

// --- GitHub ----------------------------------------------------------------

/** GET /api/integrations/github/status — configured? + viewer identity. */
router.get(
  "/integrations/github/status",
  requireRole("owner", "admin"),
  async (_req, res): Promise<void> => {
    if (!isGithubConfigured()) {
      res.json({ configured: false });
      return;
    }
    try {
      const viewer = await githubViewer();
      res.json({ configured: true, viewer });
    } catch {
      // Token present but invalid/expired — surface clearly, don't leak it.
      res.json({ configured: true, valid: false, error: "Token GitHub invalide ou expiré." });
    }
  }
);

function ensureGithub(res: import("express").Response): boolean {
  if (!isGithubConfigured()) {
    res.status(503).json({ error: "Intégration GitHub non configurée (GITHUB_TOKEN manquant)." });
    return false;
  }
  return true;
}

/** GET /api/integrations/github/repos — accessible repositories. */
router.get(
  "/integrations/github/repos",
  requireRole("owner", "admin"),
  async (req, res): Promise<void> => {
    if (!ensureGithub(res)) return;
    try {
      const limit = Number(req.query.limit) || 20;
      res.json({ repos: await listRepos(limit) });
    } catch (err) {
      res.status(502).json({ error: "Impossible de récupérer les dépôts.", detail: String(err).slice(0, 200) });
    }
  }
);

/** GET /api/integrations/github/repos/:owner/:repo/issues — open issues/PRs. */
router.get(
  "/integrations/github/repos/:owner/:repo/issues",
  requireRole("owner", "admin"),
  async (req, res): Promise<void> => {
    if (!ensureGithub(res)) return;
    try {
      const limit = Number(req.query.limit) || 20;
      const issues = await listIssues(String(req.params.owner), String(req.params.repo), limit);
      res.json({ issues });
    } catch (err) {
      res.status(502).json({ error: "Impossible de récupérer les issues.", detail: String(err).slice(0, 200) });
    }
  }
);

/** POST /api/integrations/github/repos/:owner/:repo/issues — create an issue. */
router.post(
  "/integrations/github/repos/:owner/:repo/issues",
  requireRole("owner", "admin"),
  async (req, res): Promise<void> => {
    if (!ensureGithub(res)) return;
    const body = (req.body ?? {}) as { title?: unknown; body?: unknown };
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      res.status(400).json({ error: "Titre requis." });
      return;
    }
    try {
      const created = await createIssue(
        String(req.params.owner),
        String(req.params.repo),
        title,
        typeof body.body === "string" ? body.body : undefined
      );
      res.status(201).json(created);
    } catch (err) {
      res.status(502).json({ error: "Création de l'issue impossible.", detail: String(err).slice(0, 200) });
    }
  }
);

// --- FFmpeg (video/audio toolkit — free, local, no account) ----------------

/** GET /api/integrations/ffmpeg/status — is ffmpeg available? + version. */
router.get(
  "/integrations/ffmpeg/status",
  requireRole("owner", "admin"),
  async (_req, res): Promise<void> => {
    const status = await ffmpegStatus();
    res.json({ configured: status.available, version: status.version });
  }
);

async function ensureFfmpeg(res: import("express").Response): Promise<boolean> {
  if (!(await ffmpegStatus()).available) {
    res.status(503).json({ error: "FFmpeg n'est pas disponible dans cet environnement." });
    return false;
  }
  return true;
}

function readMediaBase64(body: unknown): string | null {
  const b = (body ?? {}) as { mediaBase64?: unknown };
  if (typeof b.mediaBase64 !== "string" || b.mediaBase64.trim().length === 0) return null;
  // Strip a possible data-URL prefix (e.g. "data:video/mp4;base64,").
  return b.mediaBase64.includes(",") ? b.mediaBase64.split(",").pop()! : b.mediaBase64;
}

/** POST /api/integrations/ffmpeg/probe — metadata of an uploaded media file. */
router.post(
  "/integrations/ffmpeg/probe",
  requireRole("owner", "admin"),
  async (req, res): Promise<void> => {
    if (!(await ensureFfmpeg(res))) return;
    const media = readMediaBase64(req.body);
    if (!media) {
      res.status(400).json({ error: "mediaBase64 requis." });
      return;
    }
    try {
      res.json({ metadata: await probeBase64(media) });
    } catch (err) {
      res.status(422).json({ error: "Média illisible.", detail: String(err).slice(0, 200) });
    }
  }
);

/**
 * POST /api/integrations/ffmpeg/extract-audio — extract the audio track from
 * an uploaded video. With ?transcribe=1 (and a transcription provider), also
 * returns the transcript (video → audio → text).
 */
router.post(
  "/integrations/ffmpeg/extract-audio",
  requireRole("owner", "admin"),
  async (req, res): Promise<void> => {
    if (!(await ensureFfmpeg(res))) return;
    const media = readMediaBase64(req.body);
    if (!media) {
      res.status(400).json({ error: "mediaBase64 requis." });
      return;
    }
    try {
      const { audioBase64, mimeType, metadata } = await extractAudioBase64(media);
      const wantTranscript = req.query.transcribe === "1" || req.query.transcribe === "true";
      let transcript: string | undefined;
      if (wantTranscript) {
        try {
          transcript = await transcribeAudio(audioBase64, mimeType);
        } catch {
          // Transcription is optional (needs GROQ_API_KEY) — keep the audio.
          transcript = undefined;
        }
      }
      res.json({ audioBase64, mimeType, metadata, transcript });
    } catch (err) {
      const msg = String(err);
      if (msg.includes("NO_AUDIO_TRACK")) {
        res.status(422).json({ error: "Ce média ne contient pas de piste audio." });
        return;
      }
      res.status(422).json({ error: "Extraction audio impossible.", detail: msg.slice(0, 200) });
    }
  }
);

// --- Image generation (text-to-image, free providers) ----------------------

/** GET /api/integrations/image/status — providers available for generation. */
router.get(
  "/integrations/image/status",
  requireRole("owner", "admin"),
  (_req, res): void => {
    res.json({ configured: isImageGenAvailable(), providers: imageProviders() });
  }
);

/** POST /api/integrations/image/generate — generate an image from a prompt. */
router.post(
  "/integrations/image/generate",
  requireRole("owner", "admin"),
  imageLimiter,
  async (req, res): Promise<void> => {
    if (!isImageGenAvailable()) {
      res.status(503).json({ error: "Génération d'images désactivée (ENABLE_IMAGE_GENERATION=false)." });
      return;
    }
    const body = (req.body ?? {}) as { prompt?: unknown; width?: unknown; height?: unknown; seed?: unknown };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      res.status(400).json({ error: "Prompt requis." });
      return;
    }
    try {
      const image = await generateImage(prompt, {
        width: Number(body.width) || undefined,
        height: Number(body.height) || undefined,
        seed: Number(body.seed) || undefined,
      });
      trackMediaGenerated({ userId: req.authUser?.id, tenantId: req.tenantId, kind: "image", provider: image.provider, req });
      res.json(image);
    } catch (err) {
      const msg = String(err);
      // A blocked egress policy is the most common deploy-time failure.
      const hint = msg.includes("allowlist") || msg.includes("ENOTFOUND") || msg.includes("fetch")
        ? " (le serveur n'a peut-être pas accès à Internet — vérifie la politique réseau)."
        : "";
      res.status(502).json({ error: `Génération impossible${hint}`, detail: msg.slice(0, 200) });
    }
  }
);

// --- Product video maker (images → vertical slideshow, free via FFmpeg) -----

const VIDEO_FORMATS: Record<string, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
};

/** Parse a {title, subtitle} title card from request input. */
function parseCard(v: unknown): { title?: string; subtitle?: string } | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as { title?: unknown; subtitle?: unknown };
  const title = typeof o.title === "string" ? o.title.trim() : "";
  const subtitle = typeof o.subtitle === "string" ? o.subtitle.trim() : "";
  if (!title && !subtitle) return undefined;
  return { title: title || undefined, subtitle: subtitle || undefined };
}

/** POST /api/integrations/video/slideshow — build a video from given images. */
router.post(
  "/integrations/video/slideshow",
  requireRole("owner", "admin"),
  videoLimiter,
  async (req, res): Promise<void> => {
    if (!(await ensureFfmpeg(res))) return;
    const body = (req.body ?? {}) as {
      images?: unknown; format?: unknown; secondsPerImage?: unknown; musicBase64?: unknown;
      captions?: unknown; transition?: unknown; style?: unknown; kenBurns?: unknown;
      intro?: unknown; outro?: unknown; brand?: unknown;
    };
    const images = Array.isArray(body.images) ? body.images.filter((s) => typeof s === "string") as string[] : [];
    if (images.length === 0) {
      res.status(400).json({ error: "Au moins une image est requise." });
      return;
    }
    const captions = Array.isArray(body.captions)
      ? body.captions.map((c) => (typeof c === "string" ? c : ""))
      : undefined;
    const TRANSITIONS = new Set(["none", "fade", "dissolve", "slide", "circle"]);
    const STYLES = new Set(["none", "vivid", "warm", "cinema", "bw"]);
    const fmt = VIDEO_FORMATS[String(body.format)] ?? VIDEO_FORMATS["9:16"];
    try {
      const video = await makeSlideshow(images, {
        width: fmt.width,
        height: fmt.height,
        secondsPerImage: Number(body.secondsPerImage) || undefined,
        musicBase64: typeof body.musicBase64 === "string" ? body.musicBase64 : undefined,
        captions,
        transition: TRANSITIONS.has(String(body.transition)) ? (body.transition as "fade") : "fade",
        style: STYLES.has(String(body.style)) ? (body.style as "vivid") : "none",
        kenBurns: body.kenBurns === true,
        intro: parseCard(body.intro),
        outro: parseCard(body.outro),
        brand: typeof body.brand === "string" ? body.brand : undefined,
      });
      trackMediaGenerated({ userId: req.authUser?.id, tenantId: req.tenantId, kind: "video", provider: "ffmpeg", req });
      res.json(video);
    } catch (err) {
      res.status(422).json({ error: "Création vidéo impossible.", detail: String(err).slice(0, 200) });
    }
  }
);

/**
 * POST /api/integrations/video/from-prompt — generate N images from a prompt
 * then assemble them into a vertical slideshow video. The free, no-GPU path to
 * "video from a prompt" (ideal for Shopify product clips).
 */
router.post(
  "/integrations/video/from-prompt",
  requireRole("owner", "admin"),
  videoLimiter,
  async (req, res): Promise<void> => {
    if (!(await ensureFfmpeg(res))) return;
    if (!isImageGenAvailable()) {
      res.status(503).json({ error: "Génération d'images désactivée — requise pour la vidéo." });
      return;
    }
    const body = (req.body ?? {}) as {
      prompt?: unknown; scenes?: unknown; format?: unknown; secondsPerImage?: unknown;
      musicBase64?: unknown; transition?: unknown; style?: unknown; kenBurns?: unknown;
      intro?: unknown; outro?: unknown; brand?: unknown;
    };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      res.status(400).json({ error: "Prompt requis." });
      return;
    }
    const scenes = Math.min(Math.max(Number(body.scenes) || 4, 2), 6);
    const fmt = VIDEO_FORMATS[String(body.format)] ?? VIDEO_FORMATS["9:16"];
    const TRANSITIONS = new Set(["none", "fade", "dissolve", "slide", "circle"]);
    const STYLES = new Set(["none", "vivid", "warm", "cinema", "bw"]);

    try {
      // Generate scenes in parallel; vary the seed so they differ.
      const images = await Promise.all(
        Array.from({ length: scenes }, (_, i) =>
          generateImage(`${prompt} — plan ${i + 1}`, { width: fmt.width, height: fmt.height, seed: 1000 + i })
        )
      );
      const video = await makeSlideshow(
        images.map((im) => im.imageBase64),
        {
          width: fmt.width,
          height: fmt.height,
          secondsPerImage: Number(body.secondsPerImage) || undefined,
          musicBase64: typeof body.musicBase64 === "string" ? body.musicBase64 : undefined,
          transition: TRANSITIONS.has(String(body.transition)) ? (body.transition as "fade") : "fade",
          style: STYLES.has(String(body.style)) ? (body.style as "vivid") : "none",
          kenBurns: body.kenBurns === true,
          intro: parseCard(body.intro),
          outro: parseCard(body.outro),
          brand: typeof body.brand === "string" ? body.brand : undefined,
        }
      );
      trackMediaGenerated({ userId: req.authUser?.id, tenantId: req.tenantId, kind: "video", provider: "ffmpeg", req });
      res.json(video);
    } catch (err) {
      const msg = String(err);
      const hint = msg.includes("allowlist") || msg.includes("ENOTFOUND") || msg.includes("fetch")
        ? " (le serveur n'a peut-être pas accès à Internet pour générer les images)."
        : "";
      res.status(502).json({ error: `Vidéo impossible${hint}`, detail: msg.slice(0, 200) });
    }
  }
);

export default router;
