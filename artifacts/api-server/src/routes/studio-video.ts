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

function gpuVideoUrl() {
  return process.env.STUDIO_GPU_VIDEO_URL || process.env.STUDIO_GPU_GENERAL_URL || "";
}

async function tryGpuVideo(text: string | undefined, images: string[]) {
  const endpoint = gpuVideoUrl();
  if (!endpoint) return null;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "video", prompt: text ?? "", images, source: "tams-studio" }),
      signal: AbortSignal.timeout(180_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { error: data?.error || data?.detail || `gpu_http_${response.status}` };
    const url = typeof data?.url === "string" ? data.url : typeof data?.artifactUrl === "string" ? data.artifactUrl : undefined;
    return url ? { url, data } : { error: "gpu_worker_no_url" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

router.post("/studio/generate-video", async (req, res) => {
  const { images, text, secondsPerImage, musicUrl, imageCount } = req.body as {
    images?: string[]; text?: string; secondsPerImage?: number; musicUrl?: string; imageCount?: number;
  };
  try {
    const sourceImages = Array.isArray(images) && images.length > 0 ? images : autoImages(text, imageCount ?? 4);
    const gpu = await tryGpuVideo(text, sourceImages);
    if (gpu?.url) {
      return res.json({
        ok: true,
        url: gpu.url,
        provider: "gpu_worker",
        engine: "external_gpu_worker",
        degraded: false,
        inputImages: sourceImages.length,
        honesty: "Vidéo générée par worker GPU externe configuré.",
      });
    }
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
      gpuWarning: gpu?.error,
      honesty: result.degraded ? "Fallback local: résultat réel mais pas niveau vidéo premium." : "Vidéo réelle générée avec images IA gratuites + montage FFmpeg.",
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
  const hasGpu = Boolean(gpuVideoUrl());
  return res.json({
    ok: true,
    provider: hasGpu ? "gpu_worker" : "pollinations_plus_ffmpeg",
    level: hasGpu ? "external_gpu_worker" : "free_first_real_mp4",
    premiumEquivalent: hasGpu,
    capabilities: hasGpu ? ["gpu_worker", "fallback_mp4"] : ["text_to_ai_images", "ai_images_to_mp4", "subtitled_overlay", "local_fallback"],
  });
});

export default router;
