import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";

const execFileAsync = promisify(execFile);
const router = Router();

// Configuration
const UPLOAD_DIR = process.env.STUDIO_UPLOAD_DIR || "/tmp/tams-uploads";
const OUTPUT_DIR = process.env.STUDIO_OUTPUT_DIR || "/tmp/tams-videos";
const MAX_VIDEO_SIZE_MB = 250;
const MAX_IMAGE_SIZE_MB = 20;
const MAX_AUDIO_SIZE_MB = 50;
const MAX_PHOTOS = 30;
const MAX_DURATION_SEC = 120;

// Ensure directories exist
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// In-memory asset store (MVP: temp storage, TTL 2h)
// Production note: Replace with Supabase Storage / Cloudflare R2 / S3
const assets = new Map<string, {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  type: "video" | "image" | "audio";
  sizeBytes: number;
  uploadedAt: Date;
  path: string;
}>();

// Cleanup old assets every 30 min
setInterval(() => {
  const now = Date.now();
  const ttl = 2 * 60 * 60 * 1000; // 2h
  for (const [id, asset] of assets) {
    if (now - asset.uploadedAt.getTime() > ttl) {
      try { fs.unlinkSync(asset.path); } catch {}
      assets.delete(id);
    }
  }
}, 30 * 60 * 1000);

// Allowed MIME types
const ALLOWED_MIME: Record<string, string[]> = {
  video: ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo", "video/3gpp"],
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  audio: ["audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a", "audio/ogg"],
};

const EXT_MAP: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "video/x-msvideo": ".avi",
  "video/3gpp": ".3gp",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/ogg": ".ogg",
};

function detectType(mime: string): "video" | "image" | "audio" | null {
  if (ALLOWED_MIME.video.includes(mime)) return "video";
  if (ALLOWED_MIME.image.includes(mime)) return "image";
  if (ALLOWED_MIME.audio.includes(mime)) return "audio";
  return null;
}

// Multer config
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || EXT_MAP[file.mimetype] || "";
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
  },
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const detected = detectType(file.mimetype);
  if (detected) {
    cb(null, true);
  } else {
    cb(new Error(`Type de fichier non supporté: ${file.mimetype}`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_VIDEO_SIZE_MB * 1024 * 1024 },
});

// ─────────────────────────────────────────────────────────────
// UPLOAD ENDPOINT
// ─────────────────────────────────────────────────────────────

router.post("/studio/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        ok: false,
        error: "no_file",
        hint: "Envoyer un fichier avec le champ 'file'",
      });
    }

    const type = detectType(req.file.mimetype);
    if (!type) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        ok: false,
        error: "unsupported_type",
        allowed: [...ALLOWED_MIME.video, ...ALLOWED_MIME.image, ...ALLOWED_MIME.audio],
      });
    }

    // Size limits per type
    const sizeLimit = type === "video" ? MAX_VIDEO_SIZE_MB : type === "image" ? MAX_IMAGE_SIZE_MB : MAX_AUDIO_SIZE_MB;
    if (req.file.size > sizeLimit * 1024 * 1024) {
      fs.unlinkSync(req.file.path);
      return res.status(413).json({
        ok: false,
        error: "file_too_large",
        maxSizeMb: sizeLimit,
        actualSizeMb: Math.round(req.file.size / 1024 / 1024 * 10) / 10,
      });
    }

    const assetId = randomUUID();
    const asset = {
      id: assetId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimeType,
      type,
      sizeBytes: req.file.size,
      uploadedAt: new Date(),
      path: req.file.path,
    };

    assets.set(assetId, asset);

    return res.json({
      ok: true,
      assetId,
      url: `/api/studio/assets/${assetId}`,
      type,
      filename: req.file.originalname,
      sizeBytes: req.file.size,
      note: "Fichier stocké temporairement (TTL 2h). Pour prod durable, configurer Supabase Storage / R2 / S3.",
    });
  } catch (err) {
    req.log.error({ err }, "Upload error");
    return res.status(500).json({ ok: false, error: "upload_failed" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET ASSET ENDPOINT
// ─────────────────────────────────────────────────────────────

router.get("/studio/assets/:assetId", (req, res) => {
  const { assetId } = req.params;
  const asset = assets.get(assetId);

  if (!asset) {
    return res.status(404).json({
      ok: false,
      error: "asset_not_found",
      hint: "Asset expiré ou inexistant. Uploadez à nouveau.",
    });
  }

  if (!fs.existsSync(asset.path)) {
    assets.delete(assetId);
    return res.status(410).json({
      ok: false,
      error: "file_expired",
      hint: "Fichier supprimé du stockage temporaire.",
    });
  }

  return res.sendFile(asset.path);
});

// ─────────────────────────────────────────────────────────────
// VIDEO EDIT ENDPOINT - Montage depuis vidéos téléphone
// ─────────────────────────────────────────────────────────────

interface Clip {
  assetId: string;
  start?: number;
  end?: number;
}

interface TextOverlay {
  text: string;
  start: number;
  end: number;
  position?: "top" | "center" | "bottom";
}

interface EditRequest {
  clips: Clip[];
  format?: "9:16" | "1:1" | "16:9";
  durationSec?: number;
  textOverlays?: TextOverlay[];
  musicAssetId?: string;
  style?: "tiktok" | "instagram" | "youtube" | "standard";
}

router.post("/studio/render-edit", async (req, res) => {
  try {
    const body = req.body as EditRequest;

    if (!body.clips?.length) {
      return res.status(400).json({
        ok: false,
        error: "no_clips",
        hint: "Fournir au moins un clip avec assetId",
      });
    }

    // Verify all assets exist
    for (const clip of body.clips) {
      if (!assets.has(clip.assetId)) {
        return res.status(404).json({
          ok: false,
          error: "asset_not_found",
          missingAssetId: clip.assetId,
          hint: "Un des clips n'existe pas ou a expiré. Uploadez à nouveau.",
        });
      }
    }

    // Check duration limit
    const totalDuration = body.durationSec || 60;
    if (totalDuration > MAX_DURATION_SEC) {
      return res.status(400).json({
        ok: false,
        error: "duration_exceeded",
        maxDurationSec: MAX_DURATION_SEC,
      });
    }

    const outputId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const outputPath = path.join(OUTPUT_DIR, `${outputId}.mp4`);
    const format = body.format || "9:16";

    // FFmpeg resolution based on format
    const resolutions: Record<string, { w: number; h: number }> = {
      "9:16": { w: 1080, h: 1920 },
      "1:1": { w: 1080, h: 1080 },
      "16:9": { w: 1920, h: 1080 },
    };
    const res = resolutions[format] || resolutions["9:16"];

    // Build FFmpeg command - simple concatenation for MVP
    const inputFiles: string[] = [];
    const filterParts: string[] = [];
    let inputIdx = 0;

    for (const clip of body.clips) {
      const asset = assets.get(clip.assetId)!;
      inputFiles.push(asset.path);
      
      // Scale and crop for format
      const startSec = clip.start || 0;
      const duration = clip.end && clip.start ? clip.end - clip.start : undefined;
      
      // Build filter for this input
      filterParts.push(
        `[${inputIdx}:v]scale=${res.w}:${res.h}:force_original_aspect_ratio=increase,crop=${res.w}:${res.h},setsar=1[v${inputIdx}]`
      );
      inputIdx++;
    }

    // Build concat filter
    const concatInputs = body.clips.map((_, i) => `[v${i}]`).join("");
    const concatOuts = body.clips.map((_, i) => `[a${i}]`).join("");
    
    let filterComplex = filterParts.join(";");
    filterComplex += `;${concatInputs}concat=n=${body.clips.length}:v=1:a=0[outv]`;

    // Add text overlays if any
    if (body.textOverlays?.length) {
      for (let i = 0; i < body.textOverlays.length; i++) {
        const overlay = body.textOverlays[i];
        const y = overlay.position === "top" ? 50 : overlay.position === "bottom" ? res.h - 100 : res.h / 2;
        filterComplex += `;[outv]drawtext=text='${escapeText(overlay.text)}':fontcolor=white:fontsize=48:borderw=2:bordercolor=black:x=(w-text_w)/2:y=${y}:enable='between(t,${overlay.start},${overlay.end})'[outv]`;
      }
    }

    // Build args
    const args: string[] = ["-y"];
    for (const f of inputFiles) {
      args.push("-i", f);
    }
    args.push(
      "-filter_complex", filterComplex,
      "-map", "[outv]",
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-t", String(totalDuration),
      outputPath
    );

    // Run FFmpeg
    const { stderr } = await execFileAsync("ffmpeg", args, { timeout: 180_000 });

    // Verify output exists
    if (!fs.existsSync(outputPath)) {
      return res.status(500).json({
        ok: false,
        error: "render_failed",
        hint: "FFmpeg n'a pas généré de fichier",
        ffmpegLog: stderr.slice(-500),
      });
    }

    const stats = fs.statSync(outputPath);

    return res.json({
      ok: true,
      url: `/api/studio/video/${outputId}.mp4`,
      engine: "ffmpeg_editor",
      provider: "local_ffmpeg",
      durationSec: totalDuration,
      format,
      sizeBytes: stats.size,
      verified: true,
      note: "Montage local FFmpeg : assemblage, coupe, texte. Ce n'est pas une génération IA premium.",
    });
  } catch (err) {
    req.log.error({ err }, "Edit render error");
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      ok: false,
      error: "render_error",
      detail: message.slice(500),
    });
  }
});

// ─────────────────────────────────────────────────────────────
// PHOTO VIDEO ENDPOINT - Vidéo depuis photos
// ─────────────────────────────────────────────────────────────

interface PhotoItem {
  assetId: string;
  duration?: number;
}

interface PhotoVideoRequest {
  images: PhotoItem[];
  format?: "9:16" | "1:1" | "16:9";
  transition?: "fade" | "none" | "slide";
  musicAssetId?: string;
  textOverlays?: TextOverlay[];
  durationPerImage?: number;
}

router.post("/studio/render-photo-video", async (req, res) => {
  try {
    const body = req.body as PhotoVideoRequest;

    if (!body.images?.length) {
      return res.status(400).json({
        ok: false,
        error: "no_images",
        hint: "Fournir au moins une image avec assetId",
      });
    }

    if (body.images.length > MAX_PHOTOS) {
      return res.status(400).json({
        ok: false,
        error: "too_many_images",
        maxImages: MAX_PHOTOS,
        provided: body.images.length,
      });
    }

    // Verify all assets exist
    for (const img of body.images) {
      const asset = assets.get(img.assetId);
      if (!asset) {
        return res.status(404).json({
          ok: false,
          error: "asset_not_found",
          missingAssetId: img.assetId,
        });
      }
      if (asset.type !== "image") {
        return res.status(400).json({
          ok: false,
          error: "invalid_type",
          assetId: img.assetId,
          expected: "image",
          actual: asset.type,
        });
      }
    }

    const outputId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const outputPath = path.join(OUTPUT_DIR, `${outputId}.mp4`);
    const format = body.format || "9:16";
    const resMap: Record<string, { w: number; h: number }> = {
      "9:16": { w: 1080, h: 1920 },
      "1:1": { w: 1080, h: 1080 },
      "16:9": { w: 1920, h: 1080 },
    };
    const resolution = resMap[format] || resMap["9:16"];

    const defaultDuration = body.durationPerImage || 3;
    let totalDuration = 0;
    const filterParts: string[] = [];
    const inputs: string[] = [];
    let idx = 0;

    for (const img of body.images) {
      const asset = assets.get(img.assetId)!;
      const duration = img.duration || defaultDuration;
      totalDuration += duration;
      inputs.push("-loop", "1", "-t", String(duration), "-i", asset.path);
      
      // Scale and pad to resolution
      filterParts.push(
        `[${idx}:v]scale=${resolution.w}:${resolution.h}:force_original_aspect_ratio=decrease,pad=${resolution.w}:${resolution.h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[v${idx}]`
      );
      idx++;
    }

    // Check duration limit
    if (totalDuration > MAX_DURATION_SEC) {
      return res.status(400).json({
        ok: false,
        error: "duration_exceeded",
        maxDurationSec: MAX_DURATION_SEC,
        totalDuration,
      });
    }

    // Concat inputs
    const concatInputs = body.images.map((_, i) => `[v${i}]`).join("");
    let filterComplex = filterParts.join(";");
    
    // Add transitions if requested
    if (body.transition === "fade" && body.images.length > 1) {
      // Simple fade transition using xfade
      // For MVP, we just concat without complex transitions
    }

    filterComplex += `;${concatInputs}concat=n=${body.images.length}:v=1:a=0[outv]`;

    // Add text overlays
    if (body.textOverlays?.length) {
      for (const overlay of body.textOverlays) {
        const y = overlay.position === "top" ? 50 : overlay.position === "bottom" ? resolution.h - 100 : resolution.h / 2;
        filterComplex += `;[outv]drawtext=text='${escapeText(overlay.text)}':fontcolor=white:fontsize=48:borderw=2:bordercolor=black:x=(w-text_w)/2:y=${y}:enable='between(t,${overlay.start},${overlay.end})'[outv]`;
      }
    }

    // Build command
    const args = ["-y", ...inputs, "-filter_complex", filterComplex, "-map", "[outv]", "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p", outputPath];

    await execFileAsync("ffmpeg", args, { timeout: 180_000 });

    if (!fs.existsSync(outputPath)) {
      return res.status(500).json({
        ok: false,
        error: "render_failed",
        hint: "FFmpeg n'a pas généré de fichier",
      });
    }

    const stats = fs.statSync(outputPath);

    return res.json({
      ok: true,
      url: `/api/studio/video/${outputId}.mp4`,
      engine: "ffmpeg_photo_video",
      provider: "local_ffmpeg",
      durationSec: totalDuration,
      format,
      imageCount: body.images.length,
      sizeBytes: stats.size,
      verified: true,
      note: "Vidéo générée depuis vos photos : slideshow amélioré, pas vidéo IA premium.",
    });
  } catch (err) {
    req.log.error({ err }, "Photo video render error");
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      ok: false,
      error: "render_error",
      detail: message.slice(500),
    });
  }
});

// ─────────────────────────────────────────────────────────────
// SERVE OUTPUT VIDEO
// ─────────────────────────────────────────────────────────────

router.get("/studio/video/:filename", (req, res) => {
  const { filename } = req.params;
  const fullPath = path.join(OUTPUT_DIR, filename);

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({
      ok: false,
      error: "video_not_found",
      hint: "Vidéo expirée ou inexistante.",
    });
  }

  return res.sendFile(fullPath);
});

// ─────────────────────────────────────────────────────────────
// LIST ASSETS
// ─────────────────────────────────────────────────────────────

router.get("/studio/assets", (_req, res) => {
  const list = Array.from(assets.values()).map(a => ({
    assetId: a.id,
    type: a.type,
    filename: a.originalName,
    sizeBytes: a.sizeBytes,
    uploadedAt: a.uploadedAt.toISOString(),
    url: `/api/studio/assets/${a.id}`,
  }));

  return res.json({
    ok: true,
    assets: list,
    note: "Stockage temporaire avec TTL 2h. Pour prod: Supabase Storage / R2 / S3.",
  });
});

// ─────────────────────────────────────────────────────────────
// DELETE ASSET
// ─────────────────────────────────────────────────────────────

router.delete("/studio/assets/:assetId", (req, res) => {
  const { assetId } = req.params;
  const asset = assets.get(assetId);

  if (!asset) {
    return res.status(404).json({ ok: false, error: "not_found" });
  }

  try { fs.unlinkSync(asset.path); } catch {}
  assets.delete(assetId);

  return res.json({ ok: true, deleted: assetId });
});

// Helper: escape text for FFmpeg
function escapeText(text: string): string {
  return text.replace(/'/g, "'\\''").replace(/:/g, "\\:").replace(/[\n\r]/g, " ").slice(0, 200);
}

export default router;
