import { Router } from "express";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const router = Router();

const __serverDir = dirname(fileURLToPath(import.meta.url));
const FONT_PATH = path.resolve(__serverDir, "..", "assets", "font.ttf");
const VIDEO_DIR = path.join(os.tmpdir(), "tams-videos");

// 720×1280 (9:16) : qualité TikTok/Reels suffisante et BIEN moins gourmand en
// mémoire que 1080×1920 → évite les OOM-kills sur conteneur Railway limité.
const W = 720;
const H = 1280;

function spawnFfmpeg(args: string[], timeoutMs = 120_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); if (stderr.length > 4000) stderr = stderr.slice(-4000); });
    const timer = setTimeout(() => { proc.kill("SIGKILL"); reject(new Error("ffmpeg timeout")); }, timeoutMs);
    proc.on("error", (e) => { clearTimeout(timer); reject(new Error(`ffmpeg introuvable: ${e.message}`)); });
    proc.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else if (signal === "SIGKILL" || code === null) reject(new Error(`ffmpeg tué (mémoire ?) signal=${signal}`));
      else reject(new Error(`ffmpeg code ${code}: ${stderr.slice(-300)}`));
    });
  });
}

async function download(url: string, dest: string): Promise<void> {
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`download ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 25_000_000) throw new Error("fichier trop volumineux");
  await writeFile(dest, buf);
}

// Pré-réduit UNE image à 720×1280 (décodage d'une seule image à la fois →
// mémoire bornée, même si la source est en très haute résolution).
async function preScale(src: string, dest: string): Promise<void> {
  await spawnFfmpeg(
    ["-y", "-i", src, "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`, "-frames:v", "1", dest],
    30_000,
  );
}

function buildFilter(n: number, textFile: string | null): { filter: string; lastLabel: string } {
  // Les images sont DÉJÀ en 720×1280 (pré-réduites) → simple format + concat.
  const parts: string[] = [];
  for (let i = 0; i < n; i++) parts.push(`[${i}:v]format=yuv420p[v${i}]`);
  parts.push(`${Array.from({ length: n }, (_, i) => `[v${i}]`).join("")}concat=n=${n}:v=1:a=0[cat]`);
  let lastLabel = "cat";
  if (textFile) {
    parts.push(
      `[cat]drawtext=fontfile=${FONT_PATH}:textfile=${textFile}:fontcolor=white:fontsize=44:` +
        `line_spacing=8:box=1:boxcolor=black@0.55:boxborderw=18:x=(w-text_w)/2:y=h-220[outv]`,
    );
    lastLabel = "outv";
  }
  return { filter: parts.join(";"), lastLabel };
}

/**
 * Génération VIDÉO 9:16 (TikTok/Reels/Shorts) — 100% gratuite via FFmpeg.
 * Diaporama vertical à partir d'images (produits Shopify, images générées), texte
 * et musique optionnels. Images pré-réduites pour rester dans la mémoire Railway.
 * Body: { images: string[], text?, secondsPerImage?, musicUrl? }
 */
router.post("/studio/generate-video", async (req, res) => {
  const { images, text, secondsPerImage, musicUrl } = req.body as {
    images?: string[]; text?: string; secondsPerImage?: number; musicUrl?: string;
  };
  const urls = (Array.isArray(images) ? images : [])
    .filter((u) => typeof u === "string" && /^https?:\/\//.test(u))
    .slice(0, 8);
  if (urls.length === 0) return res.status(400).json({ error: "Au moins une image (URL http/https) est requise." });
  const spi = Math.min(Math.max(Number(secondsPerImage) || 2.5, 1), 6);

  await mkdir(VIDEO_DIR, { recursive: true });
  const work = await mkdtemp(path.join(os.tmpdir(), "tams-vid-"));

  try {
    // Télécharge puis PRÉ-RÉDUIT chaque image (mémoire bornée, anti-OOM).
    const scaled: string[] = [];
    for (let i = 0; i < urls.length; i++) {
      const raw = path.join(work, `raw${i}`);
      const small = path.join(work, `s${i}.jpg`);
      await download(urls[i], raw);
      await preScale(raw, small);
      await rm(raw, { force: true }).catch(() => {});
      scaled.push(small);
    }

    let textFile: string | null = null;
    if (text && text.trim() && existsSync(FONT_PATH)) {
      textFile = path.join(work, "text.txt");
      await writeFile(textFile, text.trim().slice(0, 200));
    }

    let musicPath: string | null = null;
    if (musicUrl && /^https?:\/\//.test(musicUrl)) {
      try { musicPath = path.join(work, "music.audio"); await download(musicUrl, musicPath); }
      catch { musicPath = null; }
    }

    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const outPath = path.join(VIDEO_DIR, `${id}.mp4`);

    const args: string[] = [];
    for (const p of scaled) args.push("-loop", "1", "-t", String(spi), "-i", p);
    if (musicPath) args.push("-i", musicPath);

    const { filter, lastLabel } = buildFilter(scaled.length, textFile);
    args.push("-filter_complex", filter, "-map", `[${lastLabel}]`);
    if (musicPath) args.push("-map", `${scaled.length}:a`, "-c:a", "aac", "-shortest");
    args.push(
      "-r", "30", "-c:v", "libx264", "-preset", "ultrafast", "-threads", "1",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", outPath,
    );

    await spawnFfmpeg(args);

    return res.json({
      ok: true,
      url: `/api/studio/video/${id}.mp4`,
      durationSec: Math.round(scaled.length * spi),
      images: scaled.length,
      withText: !!textFile,
      withMusic: !!musicPath,
    });
  } catch (err) {
    req.log?.error?.({ err }, "Video generation failed");
    return res.status(500).json({ error: "Génération vidéo échouée", detail: err instanceof Error ? err.message : String(err) });
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
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
