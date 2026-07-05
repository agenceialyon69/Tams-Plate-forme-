import { Router, type Request } from "express";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { generateSlideshowVideo, VIDEO_DIR, FONT_PATH, spawnFfmpeg } from "../lib/video";

const router = Router();

type WorkerResult = { url?: string; error?: string; data?: unknown };
type StudioUploadType = "video" | "image" | "audio";
type StudioFormat = "9:16" | "1:1" | "16:9";

const UPLOAD_DIR = path.join(os.tmpdir(), "tams-studio-uploads");
const MAX_UPLOAD_BYTES = 90_000_000;

// HOTFIX MINIMAL: Premium keywords for video honesty
const PREMIUM_VIDEO_KEYWORDS = ["tiktok naturel", "ugc naturel", "réaliste", "premium", "vraie vidéo", "pub tiktok", "haute conversion"];
function isPremiumVideoExpectation(text: string) { return PREMIUM_VIDEO_KEYWORDS.some(k => text.toLowerCase().includes(k)); }
// ─────────────────────────────────────────────────────────────────────────────

const FORMAT_SIZE: Record<StudioFormat, { w: number; h: number }> = {
  "9:16": { w: 720, h: 1280 },
  "1:1": { w: 1080, h: 1080 },
  "16:9": { w: 1280, h: 720 },
};

const EXT_TYPE: Record<string, StudioUploadType> = {
  ".mp4": "video",
  ".mov": "video",
  ".webm": "video",
  ".jpg": "image",
  ".jpeg": "image",
  ".png": "image",
  ".webp": "image",
  ".wav": "audio",
  ".mp3": "audio",
  ".ogg": "audio",
  ".flac": "audio",
  ".m4a": "audio",
};

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

function env(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function gpuVideoUrl() {
  return env("STUDIO_GPU_VIDEO_URL") || env("STUDIO_GPU_GENERAL_URL");
}

function premiumUrl(kind: "video" | "audio" | "image") {
  if (kind === "video") return env("STUDIO_GPU_VIDEO_URL") || env("COMFYUI_BASE_URL") || env("STUDIO_GPU_GENERAL_URL");
  if (kind === "audio") return env("STUDIO_GPU_AUDIO_URL") || env("STUDIO_GPU_GENERAL_URL");
  return env("STUDIO_GPU_IMAGE_URL") || env("COMFYUI_BASE_URL") || env("STUDIO_GPU_GENERAL_URL");
}

async function tryGpuVideo(text: string | undefined, images: string[]): Promise<WorkerResult | null> {
  const endpoint = gpuVideoUrl();
  if (!endpoint) return null;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "video", prompt: text ?? "", images, source: "tams-studio" }),
      signal: AbortSignal.timeout(180_000),
    });
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) return { error: String(data.error || data.detail || `gpu_http_${response.status}`) };
    const url = typeof data.url === "string" ? data.url : typeof data.artifactUrl === "string" ? data.artifactUrl : undefined;
    return url ? { url, data } : { error: "gpu_worker_no_url" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function isStudioFormat(value: unknown): value is StudioFormat {
  return value === "9:16" || value === "1:1" || value === "16:9";
}

function fileUrl(file: string) {
  return `/api/studio/upload/${file}`;
}

function safeUploadFileName(value: string) {
  return /^[a-f0-9-]+\.[a-z0-9]+$/i.test(value) ? value : null;
}

function mimeType(file: string) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".webm") return "video/webm";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".flac") return "audio/flac";
  return "application/octet-stream";
}

function parseBoundary(contentType: string | undefined) {
  const match = /boundary=(?:(?:"([^"]+)")|([^;]+))/i.exec(contentType || "");
  return match?.[1] || match?.[2] || null;
}

async function readRequestBuffer(req: Request, maxBytes = MAX_UPLOAD_BYTES): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) throw new Error("upload_too_large");
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function trimTrailingCrlf(buf: Buffer) {
  if (buf.length >= 2 && buf[buf.length - 2] === 13 && buf[buf.length - 1] === 10) return buf.subarray(0, -2);
  return buf;
}

function extractMultipartFiles(buffer: Buffer, boundary: string) {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const headerSeparator = Buffer.from("\r\n\r\n");
  const files: Array<{ fieldName: string; filename: string; contentType: string; data: Buffer }> = [];

  let start = buffer.indexOf(boundaryBuffer);
  while (start !== -1) {
    start += boundaryBuffer.length;
    if (buffer[start] === 45 && buffer[start + 1] === 45) break;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;

    const next = buffer.indexOf(boundaryBuffer, start);
    if (next === -1) break;
    const part = trimTrailingCrlf(buffer.subarray(start, next));
    const headerEnd = part.indexOf(headerSeparator);
    if (headerEnd > -1) {
      const rawHeaders = part.subarray(0, headerEnd).toString("utf8");
      const data = part.subarray(headerEnd + headerSeparator.length);
      const disposition = /content-disposition:\s*form-data;([^\r\n]+)/i.exec(rawHeaders)?.[1] || "";
      const fieldName = /name="([^"]+)"/i.exec(disposition)?.[1] || "file";
      const filename = /filename="([^"]*)"/i.exec(disposition)?.[1] || "";
      const contentType = /content-type:\s*([^\r\n]+)/i.exec(rawHeaders)?.[1]?.trim() || "application/octet-stream";
      if (filename && data.length > 0) files.push({ fieldName, filename, contentType, data });
    }
    start = next;
  }

  return files;
}

async function uploadedPath(file: string, expected?: StudioUploadType) {
  const safe = safeUploadFileName(file);
  if (!safe) throw new Error("invalid_file_id");
  const ext = path.extname(safe).toLowerCase();
  const type = EXT_TYPE[ext];
  if (!type || (expected && type !== expected)) throw new Error("invalid_file_type");
  const full = path.join(UPLOAD_DIR, safe);
  if (!existsSync(full)) throw new Error("uploaded_file_not_found");
  return { file: safe, full, type, ext };
}

async function textFile(text: string | undefined) {
  const clean = (text || "").trim().replace(/[\r\n]+/g, " ").slice(0, 220);
  if (!clean || !existsSync(FONT_PATH)) return null;
  await mkdir(VIDEO_DIR, { recursive: true });
  const file = path.join(VIDEO_DIR, `overlay-${Date.now()}-${Math.floor(Math.random() * 1e6)}.txt`);
  await writeFile(file, clean);
  return file;
}

function drawOverlay(label: string, overlayPath: string | null, output: string) {
  if (!overlayPath) return `[${label}]format=yuv420p[${output}]`;
  return `[${label}]drawtext=fontfile=${FONT_PATH}:textfile=${overlayPath}:fontcolor=white:fontsize=44:line_spacing=8:box=1:boxcolor=black@0.55:boxborderw=18:x=(w-text_w)/2:y=h-230,format=yuv420p[${output}]`;
}

function resultVideoUrl(id: string) {
  return `/api/studio/video/${id}.mp4`;
}

async function renderEditedVideo(opts: {
  clipIds: string[];
  format: StudioFormat;
  overlayText?: string;
  musicId?: string;
  trimStart?: number;
  trimEnd?: number;
}) {
  const clipIds = opts.clipIds.slice(0, 12);
  if (clipIds.length === 0) throw new Error("clipIds_required");
  const clips = await Promise.all(clipIds.map(id => uploadedPath(id, "video")));
  const music = opts.musicId ? await uploadedPath(opts.musicId, "audio").catch(() => null) : null;
  const { w, h } = FORMAT_SIZE[opts.format];
  const trimStart = Math.max(0, Number(opts.trimStart) || 0);
  const trimEnd = Math.max(0, Number(opts.trimEnd) || 0);
  const segmentDuration = trimEnd > trimStart ? Math.min(trimEnd - trimStart, 180) : 0;
  const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const outPath = path.join(VIDEO_DIR, `${id}.mp4`);
  const overlayPath = await textFile(opts.overlayText);

  await mkdir(VIDEO_DIR, { recursive: true });
  const args: string[] = [];
  for (const clip of clips) {
    if (trimStart > 0) args.push("-ss", String(trimStart));
    if (segmentDuration > 0) args.push("-t", String(segmentDuration));
    args.push("-i", clip.full);
  }
  if (music) args.push("-i", music.full);

  const filters: string[] = [];
  for (let i = 0; i < clips.length; i++) {
    filters.push(`[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=30,format=yuv420p[v${i}]`);
  }
  if (clips.length === 1) {
    filters.push(drawOverlay("v0", overlayPath, "outv"));
  } else {
    filters.push(`${clips.map((_clip, i) => `[v${i}]`).join("")}concat=n=${clips.length}:v=1:a=0[cat]`);
    filters.push(drawOverlay("cat", overlayPath, "outv"));
  }

  args.push("-filter_complex", filters.join(";"), "-map", "[outv]");
  if (music) args.push("-map", `${clips.length}:a`, "-c:a", "aac", "-shortest");
  args.push("-c:v", "libx264", "-preset", "ultrafast", "-threads", "1", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", outPath);
  await spawnFfmpeg(args, 180_000);

  return {
    ok: true,
    url: resultVideoUrl(id),
    engine: "ffmpeg_edit",
    provider: "local_ffmpeg",
    badge: "montage",
    format: opts.format,
    clips: clips.length,
    withMusic: Boolean(music),
    withText: Boolean(overlayPath),
  };
}

async function renderPhotoVideo(opts: {
  imageIds: string[];
  format: StudioFormat;
  secondsPerPhoto?: number;
  overlayText?: string;
  musicId?: string;
}) {
  const imageIds = opts.imageIds.slice(0, 24);
  if (imageIds.length === 0) throw new Error("imageIds_required");
  const images = await Promise.all(imageIds.map(id => uploadedPath(id, "image")));
  const music = opts.musicId ? await uploadedPath(opts.musicId, "audio").catch(() => null) : null;
  const { w, h } = FORMAT_SIZE[opts.format];
  const seconds = Math.min(Math.max(Number(opts.secondsPerPhoto) || 2.5, 1), 10);
  const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const outPath = path.join(VIDEO_DIR, `${id}.mp4`);
  const overlayPath = await textFile(opts.overlayText);

  await mkdir(VIDEO_DIR, { recursive: true });
  const args: string[] = [];
  for (const image of images) args.push("-loop", "1", "-t", String(seconds), "-i", image.full);
  if (music) args.push("-i", music.full);

  const filters: string[] = [];
  for (let i = 0; i < images.length; i++) {
    filters.push(`[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=30,format=yuv420p[v${i}]`);
  }
  filters.push(`${images.map((_image, i) => `[v${i}]`).join("")}concat=n=${images.length}:v=1:a=0[cat]`);
  filters.push(drawOverlay("cat", overlayPath, "outv"));

  args.push("-filter_complex", filters.join(";"), "-map", "[outv]");
  if (music) args.push("-map", `${images.length}:a`, "-c:a", "aac", "-shortest");
  args.push("-r", "30", "-c:v", "libx264", "-preset", "ultrafast", "-threads", "1", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", outPath);
  await spawnFfmpeg(args, 180_000);

  return {
    ok: true,
    url: resultVideoUrl(id),
    engine: "ffmpeg_photo_video",
    provider: "local_ffmpeg",
    badge: "montage",
    format: opts.format,
    durationSec: Math.round(images.length * seconds),
    photos: images.length,
    withMusic: Boolean(music),
    withText: Boolean(overlayPath),
  };
}

router.post("/studio/generate-video", async (req, res) => {
  const { images, text, secondsPerImage, musicUrl, imageCount } = req.body as {
    images?: string[]; text?: string; secondsPerImage?: number; musicUrl?: string; imageCount?: number;
  };
  try {
    // HOTFIX MINIMAL: Video honesty - refuse premium expectations without provider
    if (!gpuVideoUrl() && text && isPremiumVideoExpectation(text)) {
      return res.status(503).json({
        ok: false,
        error: "Je ne peux pas générer une vraie vidéo IA réaliste sans provider vidéo premium.",
        provider: null,
        premiumRequired: true,
        alternatives: ["Demander un script/storyboard", "Demander des prompts Kling/Runway/Veo", "Fournir des images produit pour un prototype"],
      });
    }
    // ─────────────────────────────────────────────────────────────────────────────

    const sourceImages = Array.isArray(images) && images.length > 0 ? images : autoImages(text, imageCount ?? 4);
    const gpu = await tryGpuVideo(text, sourceImages);
    if (gpu?.url) {
      return res.json({
        ok: true,
        url: gpu.url,
        provider: process.env.PREMIUM_VIDEO_PROVIDER || "gpu_worker",
        engine: "external_gpu_worker",
        degraded: false,
        inputImages: sourceImages.length,
        badge: "premium",
        honesty: "Vidéo générée par worker GPU externe configuré.",
      });
    }
    const result = await generateSlideshowVideo({
      images: sourceImages,
      text,
      secondsPerImage: secondsPerImage ?? 2.5,
      musicUrl,
    });
    // HOTFIX MINIMAL: Add warning for fallback results
    return res.json({
      ok: true,
      ...result,
      provider: sourceImages.length > 0 ? "pollinations_plus_ffmpeg" : "ffmpeg_text",
      imageProvider: sourceImages.length > 0 ? "pollinations" : "none",
      inputImages: sourceImages.length,
      gpuWarning: gpu?.error,
      badge: "fallback",
      premiumAvailable: Boolean(gpuVideoUrl()),
      premiumStatus: gpuVideoUrl() ? "configured" : "missing_config",
      honesty: "Prototype vidéo local / slideshow FFmpeg. Ce rendu n'est PAS adapté pour une publicité TikTok haute conversion.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("requise") ? 400 : 500;
    req.log?.error?.({ err }, "Video generation failed");
    return res.status(status).json({ error: "Génération vidéo échouée", detail: msg });
  }
});

router.post("/studio/upload", async (req, res) => {
  try {
    const boundary = parseBoundary(req.headers["content-type"]);
    if (!boundary) return res.status(400).json({ ok: false, error: "multipart_boundary_required" });
    const buffer = await readRequestBuffer(req);
    const files = extractMultipartFiles(buffer, boundary);
    if (files.length === 0) return res.status(400).json({ ok: false, error: "files_required" });
    await mkdir(UPLOAD_DIR, { recursive: true });

    const uploaded = [];
    for (const file of files.slice(0, 24)) {
      const ext = path.extname(file.filename).toLowerCase();
      const type = EXT_TYPE[ext];
      if (!type) continue;
      const name = `${randomUUID()}${ext}`;
      await writeFile(path.join(UPLOAD_DIR, name), file.data);
      uploaded.push({
        id: name,
        type,
        url: fileUrl(name),
        filename: file.filename,
        mimeType: file.contentType,
        bytes: file.data.length,
        fieldName: file.fieldName,
      });
    }

    if (uploaded.length === 0) return res.status(400).json({ ok: false, error: "no_supported_files", allowed: Object.keys(EXT_TYPE) });
    return res.json({ ok: true, files: uploaded });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg === "upload_too_large" ? 413 : 500;
    req.log?.error?.({ err }, "Studio upload failed");
    return res.status(status).json({ ok: false, error: msg });
  }
});

router.post("/studio/render-edit", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const clipIds = Array.isArray(body.clipIds) ? body.clipIds.filter((x): x is string => typeof x === "string") : [];
    const format = isStudioFormat(body.format) ? body.format : "9:16";
    const result = await renderEditedVideo({
      clipIds,
      format,
      overlayText: typeof body.overlayText === "string" ? body.overlayText : undefined,
      musicId: typeof body.musicId === "string" ? body.musicId : undefined,
      trimStart: typeof body.trimStart === "number" ? body.trimStart : Number(body.trimStart) || 0,
      trimEnd: typeof body.trimEnd === "number" ? body.trimEnd : Number(body.trimEnd) || 0,
    });
    return res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log?.error?.({ err }, "Studio render-edit failed");
    return res.status(msg.endsWith("required") || msg.includes("not_found") ? 400 : 500).json({ ok: false, error: msg });
  }
});

router.post("/studio/render-photo-video", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const imageIds = Array.isArray(body.imageIds) ? body.imageIds.filter((x): x is string => typeof x === "string") : [];
    const format = isStudioFormat(body.format) ? body.format : "9:16";
    const result = await renderPhotoVideo({
      imageIds,
      format,
      secondsPerPhoto: typeof body.secondsPerPhoto === "number" ? body.secondsPerPhoto : Number(body.secondsPerPhoto) || 2.5,
      overlayText: typeof body.overlayText === "string" ? body.overlayText : undefined,
      musicId: typeof body.musicId === "string" ? body.musicId : undefined,
    });
    return res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log?.error?.({ err }, "Studio render-photo-video failed");
    return res.status(msg.endsWith("required") || msg.includes("not_found") ? 400 : 500).json({ ok: false, error: msg });
  }
});

router.post("/studio/premium/:kind", async (req, res) => {
  const kind = req.params.kind === "audio" || req.params.kind === "image" ? req.params.kind : "video";
  const endpoint = premiumUrl(kind);
  if (!endpoint) {
    const label = kind === "video" ? "Premium video provider not configured" : kind === "audio" ? "Premium audio provider not configured" : "Premium image provider not configured";
    return res.status(503).json({ ok: false, missingConfig: true, error: label });
  }
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...req.body, kind, source: "tams-studio-premium" }),
      signal: AbortSignal.timeout(180_000),
    });
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok || data.ok === false) {
      return res.status(response.ok ? 502 : response.status).json({ ok: false, error: String(data.error || data.detail || `premium_http_${response.status}`), result: data });
    }
    const url = typeof data.url === "string" ? data.url : typeof data.artifactUrl === "string" ? data.artifactUrl : undefined;
    if (!url) return res.status(502).json({ ok: false, error: "Premium provider returned ok but no media URL", result: data });
    return res.json({ ok: true, url, engine: `premium_${kind}`, provider: kind === "video" ? process.env.PREMIUM_VIDEO_PROVIDER || "external" : kind === "audio" ? process.env.PREMIUM_AUDIO_PROVIDER || "external" : "external", badge: "premium", result: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ ok: false, error: msg });
  }
});

router.get("/studio/video/status", (_req, res) => {
  const hasGpu = Boolean(gpuVideoUrl());
  return res.json({
    ok: true,
    provider: hasGpu ? process.env.PREMIUM_VIDEO_PROVIDER || "gpu_worker" : "pollinations_plus_ffmpeg",
    level: hasGpu ? "external_gpu_worker" : "free_first_real_mp4",
    premiumEquivalent: hasGpu,
    premiumStatus: hasGpu ? "configured" : "missing_config",
    missingConfigMessage: hasGpu ? null : "Premium non configuré — fallback disponible",
    capabilities: hasGpu ? ["gpu_worker", "fallback_mp4"] : ["text_to_ai_images", "ai_images_to_mp4", "subtitled_overlay", "local_fallback"],
    // HOTFIX MINIMAL: Add prototype name in status
    prototypeName: "Prototype vidéo local / slideshow FFmpeg",
    prototypeWarning: "Ce rendu n'est PAS adapté pour une publicité TikTok haute conversion.",
  });
});

router.get("/studio/video/:file", (req, res) => {
  const file = req.params.file;
  if (!/^[\w.-]+\.mp4$/.test(file)) { res.status(400).json({ error: "Nom invalide" }); return; }
  const full = path.join(VIDEO_DIR, file);
  if (!existsSync(full)) { res.status(404).json({ error: "Vidéo introuvable (expirée ?)" }); return; }
  res.setHeader("Content-Type", "video/mp4");
  res.sendFile(full);
});

router.get("/studio/upload/:file", async (req, res) => {
  const safe = safeUploadFileName(req.params.file);
  if (!safe) return res.status(400).json({ error: "Nom invalide" });
  const full = path.join(UPLOAD_DIR, safe);
  if (!existsSync(full)) return res.status(404).json({ error: "Fichier introuvable" });
  res.setHeader("Content-Type", mimeType(safe));
  return res.sendFile(full);
});

export default router;
