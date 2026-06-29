import { Router } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { generateSlideshowVideo, VIDEO_DIR } from "../lib/video";

const router = Router();

/**
 * Génération VIDÉO 9:16 (TikTok/Reels/Shorts) — 100% gratuite via FFmpeg.
 * Voir lib/video.ts (moteur partagé avec l'outil Chat create_video).
 * Body: { images: string[], text?, secondsPerImage?, musicUrl? }
 */
router.post("/studio/generate-video", async (req, res) => {
  const { images, text, secondsPerImage, musicUrl } = req.body as {
    images?: string[]; text?: string; secondsPerImage?: number; musicUrl?: string;
  };
  try {
    const result = await generateSlideshowVideo({
      images: Array.isArray(images) ? images : [],
      text, secondsPerImage, musicUrl,
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("requise") ? 400 : 500;
    req.log?.error?.({ err }, "Video generation failed");
    return res.status(status).json({ error: "Génération vidéo échouée", detail: msg });
  }
});

// Sert la vidéo générée.
router.get("/studio/video/:file", (req, res) => {
  const file = req.params.file;
  if (!/^[\w.-]+\.mp4$/.test(file)) { res.status(400).json({ error: "Nom invalide" }); return; }
  const full = path.join(VIDEO_DIR, file);
  if (!existsSync(full)) { res.status(404).json({ error: "Vidéo introuvable (expirée ?)" }); return; }
  res.setHeader("Content-Type", "video/mp4");
  res.sendFile(full);
});

export default router;
