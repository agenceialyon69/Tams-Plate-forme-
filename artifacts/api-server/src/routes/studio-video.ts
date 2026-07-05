/**
 * Studio Video Editing Routes
 * Montage vidéo, Photos → Vidéo, Templates
 *
 * ADDITIVE - Does not replace existing studio.ts or studio-generate.ts
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { assetsTable } from "@workspace/db";
import { logActivity } from "../lib/activity";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const execAsync = promisify(exec);

const router = Router();

// ─── Configuration ───────────────────────────────────────────────────────────

const UPLOAD_DIR = process.env.STUDIO_UPLOAD_DIR || "/tmp/tams-studio-uploads";
const OUTPUT_DIR = process.env.STUDIO_OUTPUT_DIR || "/tmp/tams-studio-output";

// Ensure directories exist
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

// Premium provider configuration
const PREMIUM_CONFIG = {
  video: process.env.STUDIO_GPU_VIDEO_URL || null,
  audio: process.env.STUDIO_GPU_AUDIO_URL || null,
  image: process.env.STUDIO_GPU_IMAGE_URL || null,
  comfyui: process.env.COMFYUI_URL || null,
};

// ─── Utility Functions ───────────────────────────────────────────────────────

async function checkFFmpeg(): Promise<{ available: boolean; version?: string }> {
  try {
    const { stdout } = await execAsync("ffmpeg -version", { timeout: 5000 });
    const version = stdout.split("\n")[0];
    return { available: true, version };
  } catch {
    return { available: false };
  }
}

function getProviderStatus(type: "video" | "audio" | "image"): {
  provider: string | null;
  configured: boolean;
  fallback: boolean;
} {
  const urls: Record<string, string | null> = {
    video: PREMIUM_CONFIG.video,
    audio: PREMIUM_CONFIG.audio,
    image: PREMIUM_CONFIG.image,
  };

  const configured = !!urls[type];
  return {
    provider: configured ? "premium" : null,
    configured,
    fallback: true, // FFmpeg always available as fallback
  };
}

// ─── Status Endpoints ─────────────────────────────────────────────────────────
router.get("/studio/config", async (_req, res) => {
  try {
    const ffmpeg = await checkFFmpeg();

    return res.json({
      ffmpeg: ffmpeg.available,
      ffmpegVersion: ffmpeg.version,
      uploadDir: UPLOAD_DIR,
      outputDir: OUTPUT_DIR,
      premium: {
        video: {
          configured: !!PREMIUM_CONFIG.video,
          url: PREMIUM_CONFIG.video ? "[CONFIGURED]" : null,
          fallback: "ffmpeg",
        },
        audio: {
          configured: !!PREMIUM_CONFIG.audio,
          url: PREMIUM_CONFIG.audio ? "[CONFIGURED]" : null,
          fallback: "ffmpeg",
        },
        image: {
          configured: !!PREMIUM_CONFIG.image,
          url: PREMIUM_CONFIG.image ? "[CONFIGURED]" : null,
          fallback: "pollinations",
        },
        comfyui: {
          configured: !!PREMIUM_CONFIG.comfyui,
          url: PREMIUM_CONFIG.comfyui ? "[CONFIGURED]" : null,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to check config" });
  }
});

router.get("/studio/provider-status", async (_req, res) => {
  const providers = {
    "pollinations-image": { status: "enabled", free: true, type: "image" },
    "pollinations-text": { status: "enabled", free: true, type: "text" },
    "ffmpeg-video": { status: (await checkFFmpeg()).available ? "enabled" : "missing_config", free: true, type: "video" },
    "ffmpeg-audio": { status: (await checkFFmpeg()).available ? "enabled" : "missing_config", free: true, type: "audio" },
    "premium-video": { status: PREMIUM_CONFIG.video ? "enabled" : "missing_config", free: false, type: "video" },
    "premium-audio": { status: PREMIUM_CONFIG.audio ? "enabled" : "missing_config", free: false, type: "audio" },
    "comfyui": { status: PREMIUM_CONFIG.comfyui ? "enabled" : "missing_config", free: true, type: "image" },
  };

  return res.json({ providers });
});

// ─── Video Montage Endpoints ──────────────────────────────────────────────────

interface RenderEditRequest {
  clips: Array<{
    file: string;
    startTime?: number;
    endTime?: number;
  }>;
  outputFormat: "9:16" | "1:1" | "16:9";
  outputDuration?: number;
  textOverlay?: string;
  audioFile?: string;
}

router.post("/studio/render-edit", async (req, res) => {
  try {
    const { clips, outputFormat, textOverlay, audioFile } = req.body as RenderEditRequest;

    if (!clips || clips.length === 0) {
      return res.status(400).json({ error: "clips array is required" });
    }

    const ffmpegCheck = await checkFFmpeg();
    if (!ffmpegCheck.available) {
      return res.status(503).json({
        error: "FFmpeg non disponible",
        ok: false,
        fallback: true,
        message: "Installez FFmpeg pour le montage vidéo",
      });
    }

    // Generate output filename
    const outputId = Date.now().toString(36);
    const outputFile = join(OUTPUT_DIR, `montage_${outputId}.mp4`);

    // Build FFmpeg command
    const { width, height } = getFormatDimensions(outputFormat);

    // Create input file list for concat
    const fileList = join(OUTPUT_DIR, `concat_${outputId}.txt`);
    let fileContent = "";

    for (const clip of clips) {
      const filePath = join(UPLOAD_DIR, clip.file);
      if (existsSync(filePath)) {
        fileContent += `file '${filePath}'\n`;
      }
    }

    writeFileSync(fileList, fileContent);

    // Build FFmpeg command
    let cmd = `ffmpeg -f concat -safe 0 -i "${fileList}" -vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2"`;

    if (textOverlay) {
      cmd += ` -vf "drawtext=text='${encodeURIComponent(textOverlay)}':fontsize=24:fontcolor=white:box=1:boxcolor=black@0.5:x=(w-text_w)/2:y=h-60"`;
    }

    if (audioFile) {
      const audioPath = join(UPLOAD_DIR, audioFile);
      if (existsSync(audioPath)) {
        cmd += ` -i "${audioPath}" -map 0:v -map 1:a -shortest`;
      }
    }

    cmd += ` -c:v libx264 -preset fast -crf 23 -c:a aac "${outputFile}"`;

    // Execute
    const { stdout, stderr } = await execAsync(cmd, { timeout: 60000 });

    // Cleanup
    try {
      unlinkSync(fileList);
    } catch {}

    // Create asset record
    const [asset] = await db.insert(assetsTable).values({
      name: `Montage_${outputId}`,
      type: "video",
      url: `/api/studio/output/${outputId}.mp4`,
      mimeType: "video/mp4",
      tags: ["montage", "generated", "ffmpeg"],
    }).returning();

    await logActivity("video_edit", "Montage vidéo", `${clips.length} clips`, asset?.id);

    return res.json({
      ok: true,
      outputUrl: `/api/studio/output/montage_${outputId}.mp4`,
      assetId: asset?.id,
      duration: await getVideoDuration(outputFile),
      format: outputFormat,
      engine: "ffmpeg",
      fallback: true,
    });
  } catch (err) {
    req.log.error({ err }, "Error rendering video edit");
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Erreur de montage",
      ok: false,
      fallback: true,
    });
  }
});

// ─── Photos to Video Endpoint ─────────────────────────────────────────────────

interface PhotoVideoRequest {
  photos: string[];
  durationPerPhoto?: number; // in seconds
  transition?: "fade" | "slide" | "none";
  textOverlay?: string;
  audioFile?: string;
  outputFormat?: "9:16" | "1:1" | "16:9";
}

router.post("/studio/render-photo-video", async (req, res) => {
  try {
    const {
      photos,
      durationPerPhoto = 3,
      transition = "fade",
      textOverlay,
      audioFile,
      outputFormat = "9:16",
    } = req.body as PhotoVideoRequest;

    if (!photos || photos.length === 0) {
      return res.status(400).json({ error: "photos array is required" });
    }

    const ffmpegCheck = await checkFFmpeg();
    if (!ffmpegCheck.available) {
      return res.status(503).json({
        error: "FFmpeg non disponible",
        ok: false,
        fallback: true,
      });
    }

    const outputId = Date.now().toString(36);
    const outputFile = join(OUTPUT_DIR, `photo_video_${outputId}.mp4`);
    const { width, height } = getFormatDimensions(outputFormat);

    // Build FFmpeg command for slideshow
    const inputPhotos = photos.map((p, i) => {
      const path = join(UPLOAD_DIR, p);
      return existsSync(path) ? path : null;
    }).filter(Boolean);

    if (inputPhotos.length === 0) {
      return res.status(400).json({ error: "No valid photos found" });
    }

    // Create input file list
    const fileList = join(OUTPUT_DIR, `photos_${outputId}.txt`);
    let fileContent = "";

    for (const photo of inputPhotos) {
      fileContent += `file '${photo}'\nduration ${durationPerPhoto}\n`;
    }
    // Add last photo again without duration (ffmpeg requirement)
    fileContent += `file '${inputPhotos[inputPhotos.length - 1]}'\n`;

    writeFileSync(fileList, fileContent);

    // Build command
    let cmd = `ffmpeg -f concat -safe 0 -i "${fileList}" -vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2"`;

    if (transition === "fade") {
      cmd = `ffmpeg -f concat -safe 0 -i "${fileList}" -vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fade=t=in:st=0:d=0.5,fade=t=out:st=${durationPerPhoto * inputPhotos.length - 0.5}:d=0.5"`;
    }

    if (audioFile) {
      const audioPath = join(UPLOAD_DIR, audioFile);
      if (existsSync(audioPath)) {
        cmd += ` -i "${audioPath}" -map 0:v -map 1:a -shortest`;
      }
    }

    cmd += ` -c:v libx264 -preset fast -crf 23 -c:a aac "${outputFile}"`;

    await execAsync(cmd, { timeout: 120000 });

    // Cleanup
    try {
      unlinkSync(fileList);
    } catch {}

    // Create asset record
    const [asset] = await db.insert(assetsTable).values({
      name: `Slideshow_${outputId}`,
      type: "video",
      url: `/api/studio/output/photo_video_${outputId}.mp4`,
      mimeType: "video/mp4",
      tags: ["slideshow", "photos", "generated", "ffmpeg"],
    }).returning();

    await logActivity("photo_video", "Photo video", `${inputPhotos.length} photos`, asset?.id);

    return res.json({
      ok: true,
      outputUrl: `/api/studio/output/photo_video_${outputId}.mp4`,
      assetId: asset?.id,
      photosCount: inputPhotos.length,
      duration: inputPhotos.length * durationPerPhoto,
      format: outputFormat,
      engine: "ffmpeg",
      fallback: true,
    });
  } catch (err) {
    req.log.error({ err }, "Error rendering photo video");
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Erreur de création vidéo",
      ok: false,
    });
  }
});

// ─── Video IA (Premium with honest fallback) ───────────────────────────────────

interface VideoIARequest {
  prompt: string;
  format: "9:16" | "1:1" | "16:9";
  duration: number;
  style: "naturel" | "UGC" | "premium" | "e-commerce" | "sport";
  objective: "vendre" | "présenter" | "story" | "pub_tiktok";
  images?: string[]; // Product images for video generation
}

// Keywords that indicate premium/realistic video expectations
const PREMIUM_KEYWORDS = [
  "tiktok naturel", "tik tok naturel", "ugc naturel", "naturel ugc",
  "vidéo naturelle", "video naturelle", "réaliste", "realiste",
  "authentique", "premium", "haute qualité", "haute qualite",
  "professionnel", "qualité pub", "qualite pub", "publicité",
  "pub tiktok", "pub tik tok", "vrai tiktok", "vrai tik tok",
  "naturellement", "lifestyle", " réel", " real",
];

function detectPremiumExpectation(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return PREMIUM_KEYWORDS.some(kw => lower.includes(kw));
}

router.post("/studio/generate-video", async (req, res) => {
  try {
    const { prompt, format, duration, style, objective, images } = req.body as VideoIARequest;

    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

    // Check if user expects premium/realistic video without premium provider
    const expectsPremium = detectPremiumExpectation(prompt);

    if (!PREMIUM_CONFIG.video && expectsPremium) {
      return res.status(503).json({
        ok: false,
        premium: false,
        configured: false,
        fallback: false,
        error: "Provider vidéo premium non configuré",
        message: "Je ne peux pas générer une vraie vidéo TikTok naturelle sans provider vidéo premium. Je peux seulement préparer un script, storyboard, prompts Kling/Runway/Veo, ou créer un prototype local FFmpeg.",
        alternatives: [
          "Demander un script ou storyboard",
          "Demander des prompts pour Kling/Runway/Veo",
          "Fournir des images produit pour un prototype",
        ],
      });
    }

    // Check if premium provider is configured
    if (PREMIUM_CONFIG.video) {
      // Premium generation would go here
      return res.json({
        ok: false,
        premium: true,
        configured: true,
        message: "Premium video provider configuré mais génération non implémentée",
        provider: PREMIUM_CONFIG.video,
      });
    }

    // Fallback: Check if we should even proceed
    // Require images for any meaningful video generation
    const hasImages = images && images.length > 0;

    if (!hasImages) {
      // No images provided - refuse to generate black/text video
      return res.status(400).json({
        ok: false,
        premium: false,
        configured: false,
        fallback: false,
        error: "Images produit requises",
        message: "Je ne peux pas générer une vidéo significative sans images produit. Veuillez fournir des images ou demander un script/storyboard à la place.",
        alternatives: [
          "Fournir des images produit (JPG, PNG)",
          "Demander un script vidéo structuré",
          "Demander un storyboard détaillé",
          "Demander des prompts pour générateurs vidéo IA (Kling/Runway/Veo)",
        ],
      });
    }

    // Fallback: Generate video from provided images
    const ffmpegCheck = await checkFFmpeg();
    if (!ffmpegCheck.available) {
      return res.status(503).json({
        ok: false,
        error: "FFmpeg non disponible",
        premium: false,
        configured: false,
        fallback: false,
        message: "Premium video provider non configuré. FFmpeg non disponible pour fallback.",
      });
    }

    // Create a slideshow from images (NOT text video)
    const outputId = Date.now().toString(36);
    const outputFile = join(OUTPUT_DIR, `video_slideshow_${outputId}.mp4`);
    const { width, height } = getFormatDimensions(format);
    const videoDuration = Math.min(duration || 15, 60);

    // Build concat file from images
    const fileList = join(OUTPUT_DIR, `slideshow_${outputId}.txt`);
    let fileContent = "";
    const perImageDuration = videoDuration / images.length;

    for (const img of images) {
      const imgPath = join(UPLOAD_DIR, img);
      if (existsSync(imgPath)) {
        fileContent += `file '${imgPath}'\nduration ${perImageDuration}\n`;
      }
    }

    if (!fileContent) {
      return res.status(400).json({
        ok: false,
        error: "Aucune image valide trouvée",
        message: "Les images fournies n'ont pas été trouvées dans le système de stockage temporaire.",
      });
    }

    // Add last image again (ffmpeg concat requirement)
    const lastValidImage = images.filter(img => existsSync(join(UPLOAD_DIR, img))).pop();
    if (lastValidImage) {
      fileContent += `file '${join(UPLOAD_DIR, lastValidImage)}'\n`;
    }

    writeFileSync(fileList, fileContent);

    // Build FFmpeg command for slideshow
    const cmd = `ffmpeg -f concat -safe 0 -i "${fileList}" -vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p" -c:v libx264 -preset fast -crf 23 -t ${videoDuration} "${outputFile}"`;

    await execAsync(cmd, { timeout: 60000 });

    // Cleanup
    try { unlinkSync(fileList); } catch {}

    // Warning about prototype nature
    const warningMessage = "ATTENTION: Ce rendu est un prototype local (slideshow FFmpeg). Ce n'est PAS adapté pour une publicité TikTok haute conversion. Pour une vraie vidéo IA générée, configurez un provider premium (Kling/Runway/Veo).";

    return res.json({
      ok: true,
      outputUrl: `/api/studio/output/video_slideshow_${outputId}.mp4`,
      prompt,
      duration: videoDuration,
      format,
      style,
      objective,
      imagesUsed: images.length,
      engine: "ffmpeg-slideshow",
      fallback: true,
      premium: false,
      prototype: true,
      warning: warningMessage,
      message: `Slideshow créé à partir de ${images.length} images. ${warningMessage}`,
    });
  } catch (err) {
    req.log.error({ err }, "Error generating video IA");
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Erreur génération vidéo",
      fallback: true,
    });
  }
});

// ─── Audio IA (Premium with honest fallback) ────────────────────────────────────

interface AudioIARequest {
  prompt: string;
  type: "musique" | "voix_off" | "ambiance" | "effet_sonore";
  duration: number;
}

router.post("/studio/generate-audio", async (req, res) => {
  try {
    const { prompt, type, duration } = req.body as AudioIARequest;

    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

    // Check if premium provider is configured
    if (PREMIUM_CONFIG.audio) {
      return res.json({
        ok: false,
        premium: true,
        configured: true,
        message: "Premium audio provider configuré mais génération non implémentée",
        provider: PREMIUM_CONFIG.audio,
      });
    }

    // Fallback: Generate silent audio track
    const ffmpegCheck = await checkFFmpeg();
    if (!ffmpegCheck.available) {
      return res.status(503).json({
        ok: false,
        error: "Audio IA non disponible",
        premium: false,
        configured: false,
        fallback: false,
        message: "Premium audio provider non configuré. FFmpeg non disponible pour fallback.",
      });
    }

    // Fallback: Create a silent audio file (placeholder)
    const outputId = Date.now().toString(36);
    const outputFile = join(OUTPUT_DIR, `audio_ia_${outputId}.mp3`);

    // Generate a simple tone or ambient sound
    const cmd = `ffmpeg -f lavfi -i "sine=frequency=440:duration=${Math.min(duration, 180)}" -c:a libmp3lame -q:a 4 "${outputFile}"`;

    await execAsync(cmd, { timeout: 30000 });

    return res.json({
      ok: true,
      outputUrl: `/api/studio/output/audio_ia_${outputId}.mp3`,
      prompt,
      type,
      duration: Math.min(duration, 180),
      engine: "ffmpeg-fallback",
      fallback: true,
      premium: false,
      message: "Audio placeholder généré (tone 440Hz). Pour une vraie génération IA, configurez un premium provider.",
    });
  } catch (err) {
    req.log.error({ err }, "Error generating audio IA");
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Erreur génération audio",
    });
  }
});

// ─── Templates ─────────────────────────────────────────────────────────────────

interface Template {
  id: string;
  name: string;
  category: string;
  description: string;
  preset: {
    format: "9:16" | "1:1" | "16:9";
    duration: number;
    style: string;
    promptTemplate: string;
    textOverlay?: string;
  };
}

const TEMPLATES: Template[] = [
  {
    id: "tiktok-product",
    name: "TikTok Produit",
    category: "e-commerce",
    description: "Présentation produit 15s format vertical",
    preset: {
      format: "9:16",
      duration: 15,
      style: "UGC",
      promptTemplate: "Showcase produit {produit} avec effet avant/après, musique trendy",
    },
  },
  {
    id: "ugc-naturel",
    name: "UGC Naturel",
    category: "social",
    description: "Contenu authentique style utilisateur",
    preset: {
      format: "9:16",
      duration: 30,
      style: "UGC",
      promptTemplate: "Témoignage naturel sur {produit}, cadrage main, lumière naturelle",
    },
  },
  {
    id: "activewear-femme",
    name: "Activewear Femme",
    category: "fashion",
    description: "Sportswear féminin dynamique",
    preset: {
      format: "9:16",
      duration: 30,
      style: "sport",
      promptTemplate: "Femme active portant {produit}, mouvement gym/yoga, énergie positive",
    },
  },
  {
    id: "shopify-promo",
    name: "Promo Shopify",
    category: "e-commerce",
    description: "Promotion prix/countdown",
    preset: {
      format: "1:1",
      duration: 15,
      style: "e-commerce",
      promptTemplate: "Animation promotion {rabais}% sur {produit}, call-to-action urgent",
      textOverlay: "-{rabais}% | LIMITED TIME",
    },
  },
  {
    id: "avant-apres",
    name: "Avant / Après",
    category: "transformation",
    description: "Transformation visuelle",
    preset: {
      format: "1:1",
      duration: 15,
      style: "naturel",
      promptTemplate: "Split screen avant/après {transformation}, révélation dramatique",
    },
  },
  {
    id: "demo-produit",
    name: "Démo Produit",
    category: "tutorial",
    description: "Démonstration fonctionnalité",
    preset: {
      format: "16:9",
      duration: 60,
      style: "premium",
      promptTemplate: "Démonstration {fonctionnalite} du produit {produit}, étapes claires",
    },
  },
  {
    id: "storytelling-marque",
    name: "Storytelling Marque",
    category: "brand",
    description: "Histoire de marque émotionnelle",
    preset: {
      format: "16:9",
      duration: 90,
      style: "premium",
      promptTemplate: "Storytelling émotionnel sur {marque}, values, mission, impact",
    },
  },
];

router.get("/studio/templates", (_req, res) => {
  return res.json({ templates: TEMPLATES });
});

router.get("/studio/templates/:id", (req, res) => {
  const template = TEMPLATES.find(t => t.id === req.params.id);
  if (!template) {
    return res.status(404).json({ error: "Template not found" });
  }
  return res.json(template);
});

// ─── Output Serving ───────────────────────────────────────────────────────────

router.get("/studio/output/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = join(OUTPUT_DIR, filename);

  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  // Determine content type
  const ext = extname(filename);
  const contentTypes: Record<string, string> = {
    ".mp4": "video/mp4",
    ".mp3": "audio/mpeg",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
  };

  res.setHeader("Content-Type", contentTypes[ext] || "application/octet-stream");
  res.sendFile(filePath);
});

// ─── Helper Functions ─────────────────────────────────────────────────────────

function getFormatDimensions(format: "9:16" | "1:1" | "16:9"): { width: number; height: number } {
  switch (format) {
    case "9:16": return { width: 720, height: 1280 };
    case "1:1": return { width: 1080, height: 1080 };
    case "16:9": return { width: 1920, height: 1080 };
    default: return { width: 1080, height: 1080 };
  }
}

async function getVideoDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, { timeout: 5000 });
    return parseFloat(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

export default router;
