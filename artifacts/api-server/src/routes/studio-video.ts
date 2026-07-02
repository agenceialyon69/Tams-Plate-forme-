import { Router } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { generateSlideshowVideo, VIDEO_DIR } from "../lib/video";

const router = Router();

function studioImageUrl(prompt: string, index: number): string {
  const scene = `${prompt}. Vertical TikTok UGC product video frame, realistic lifestyle, natural light, premium activewear, cinematic composition, frame ${index + 1}`;
  const seed = Math.abs([...scene].reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) | 0, 7_777)) + index;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(scene)}?width=720&height=1280&nologo=true&model=flux&seed=${seed}`;
}

function autoImages(text?: string, count = 4): string[] {
  const prompt = text?.trim();
  if (!prompt) return [];
  return Array.from({ length: Math.min(Math.max(count, 3), 6) }, (_unused, index) => studioImageUrl(prompt, index));
}

/**
 * Studio vidéo free-first.
 *
 * Red Team:
 * - Ce n'est pas Kling/Runway.
 * - C'est un vrai MP4 généré côté serveur.
 * - Sans images fournies, le backend crée des images IA gratuites puis monte la vidéo.
 * - Si les images gratuites échouent, lib/video retombe sur MP4 texte explicite.
 */
router.post("/studio/generate-video", async (req, res) => {
  const { images, text, secondsPerImage, musicUrl, imageCount } = req.body as {
    images?: string[]; text?: string; secondsPerImage?: number; musicUrl?: string; imageCount?: number;
  };
  try {
    const sourceImages = Array.isArray(images) && images.length > 0 ? images : autoImages(text, imageCount ?? 4);
    const result = await generateSlideshowVideo({
      images: sourceImages,
      text,
      secondsPerImage: secondsPerImage ?? 2.5,
      musicUrl,
    });
    return res.json({
      ok: true,
      ...result,
      provider: sourceImages.length > 0 ? "pollinations_plus_ffmpeg" : "ffmpeg_text",
      imageProvider: sourceImages.length > 0 ? "pollinations" : "none",
      inputImages: sourceImages.length,
      honesty: result.degraded ? "Fallback local: résultat réel mais pas niveau Kling/Runway." : "Vidéo réelle générée avec images IA gratuites + montage FFmpeg.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("requise") ? 400 : 500;
    req.log?.error?.({ err }, "Video generation failed");
    return res.status(status).json({ error: "Génération vidéo échouée", detail: msg });
  }
});

router.get("/studio/video/:file", (req, res) => {
  const file = req.params.file;
  if (!/^[\w.-]+\.mp4$/.test(file)) { res.status(400).json({ error: "Nom invalide" }); return; }
  const full = path.join(VIDEO_DIR, file);
  if (!existsSync(full)) { res.status(404).json({ error: "Vidéo introuvable (expirée ?)" }); return; }
  res.setHeader("Content-Type", "video/mp4");
  res.sendFile(full);
});

router.get("/studio/video/status", (_req, res) => {
  return res.json({
    ok: true,
    provider: "pollinations_plus_ffmpeg",
    level: "free_first_real_mp4",
    premiumEquivalent: false,
    capabilities: ["text_to_ai_images", "ai_images_to_mp4", "subtitled_overlay", "local_fallback"],
    missingForKlingLevel: ["true_motion_model", "image_to_video_diffusion", "character_consistency", "product_try_on", "camera_motion_control"],
  });
});

export default router;
