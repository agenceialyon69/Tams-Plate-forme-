import { Router } from "express";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const router = Router();

const __serverDir = dirname(fileURLToPath(import.meta.url));
// Police embarquée dans le dépôt (présente au runtime) → l'overlay texte marche
// toujours, quel que soit l'environnement.
const FONT_PATH = path.resolve(__serverDir, "..", "assets", "font.ttf");
const VIDEO_DIR = path.join(os.tmpdir(), "tams-videos");

function ffmpegFilter(n: number, textFile: string | null): { filter: string; lastLabel: string } {
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    parts.push(
      `[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,format=yuv420p[v${i}]`,
    );
  }
  parts.push(`${Array.from({ length: n }, (_, i) => `[v${i}]`).join("")}concat=n=${n}:v=1:a=0[cat]`);
  let lastLabel = "cat";
  if (textFile) {
    // textfile PROPRE À CETTE REQUÊTE (pas de fichier partagé → pas de course
    // entre générations concurrentes). textfile = aucun échappement à gérer.
    parts.push(
      `[cat]drawtext=fontfile=${FONT_PATH}:textfile=${textFile}:` +
        `fontcolor=white:fontsize=64:line_spacing=10:box=1:boxcolor=black@0.55:boxborderw=24:` +
        `x=(w-text_w)/2:y=h-340[outv]`,
    );
    lastLabel = "outv";
  }
  return { filter: parts.join(";"), lastLabel };
}

async function download(url: string, dest: string): Promise<void> {
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`download ${r.status} ${url.slice(0, 80)}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 25_000_000) throw new Error("fichier trop volumineux");
  await writeFile(dest, buf);
}

/**
 * Génération VIDÉO réelle (Pilier Studio) — 100 % GRATUITE via FFmpeg.
 * Slideshow vertical 9:16 (1080×1920, TikTok/Reels/Shorts) à partir d'images
 * (produits Shopify, images générées, uploads), avec texte optionnel et piste
 * audio optionnelle. Aucune API payante. Testé localement (ffmpeg 6.x).
 *
 * Body: { images: string[], text?: string, secondsPerImage?: number, musicUrl?: string }
 */
router.post("/studio/generate-video", async (req, res) => {
  const { images, text, secondsPerImage, musicUrl } = req.body as {
    images?: string[]; text?: string; secondsPerImage?: number; musicUrl?: string;
  };

  const urls = (Array.isArray(images) ? images : [])
    .filter((u) => typeof u === "string" && /^https?:\/\//.test(u))
    .slice(0, 8);
  if (urls.length === 0) {
    return res.status(400).json({ error: "Au moins une image (URL http/https) est requise." });
  }
  const spi = Math.min(Math.max(Number(secondsPerImage) || 2.5, 1), 6);

  await mkdir(VIDEO_DIR, { recursive: true });
  const work = await mkdtemp(path.join(os.tmpdir(), "tams-vid-"));

  try {
    // Télécharge les images
    const imgPaths: string[] = [];
    for (let i = 0; i < urls.length; i++) {
      const p = path.join(work, `img${i}.img`);
      await download(urls[i], p);
      imgPaths.push(p);
    }

    // Texte optionnel (via textfile propre à la requête, pas d'échappement)
    let textFile: string | null = null;
    if (text && text.trim() && existsSync(FONT_PATH)) {
      textFile = path.join(work, "text.txt");
      await writeFile(textFile, text.trim().slice(0, 200));
    }

    // Musique optionnelle
    let musicPath: string | null = null;
    if (musicUrl && /^https?:\/\//.test(musicUrl)) {
      try {
        musicPath = path.join(work, "music.audio");
        await download(musicUrl, musicPath);
      } catch {
        musicPath = null; // best-effort : la vidéo se fait sans musique
      }
    }

    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const outPath = path.join(VIDEO_DIR, `${id}.mp4`);

    // Construit les arguments ffmpeg (tableau = pas de shell = pas d'injection)
    const args: string[] = [];
    for (const p of imgPaths) args.push("-loop", "1", "-t", String(spi), "-i", p);
    if (musicPath) args.push("-i", musicPath);

    const { filter, lastLabel } = ffmpegFilter(imgPaths.length, textFile);
    args.push("-filter_complex", filter, "-map", `[${lastLabel}]`);
    if (musicPath) args.push("-map", `${imgPaths.length}:a`, "-c:a", "aac", "-shortest");
    args.push(
      "-r", "30", "-c:v", "libx264", "-preset", "veryfast",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", outPath,
    );

    await runFfmpeg(args);

    return res.json({
      ok: true,
      url: `/api/studio/video/${id}.mp4`,
      durationSec: Math.round(imgPaths.length * spi),
      images: imgPaths.length,
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

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); if (stderr.length > 4000) stderr = stderr.slice(-4000); });
    const timer = setTimeout(() => { proc.kill("SIGKILL"); reject(new Error("ffmpeg timeout (120s)")); }, 120_000);
    proc.on("error", (e) => { clearTimeout(timer); reject(new Error(`ffmpeg introuvable: ${e.message}`)); });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg code ${code}: ${stderr.slice(-400)}`));
    });
  });
}

// Sert la vidéo générée (téléchargement / lecture).
router.get("/studio/video/:file", (req, res) => {
  const file = req.params.file;
  if (!/^[\w.-]+\.mp4$/.test(file)) {
    res.status(400).json({ error: "Nom de fichier invalide" });
    return;
  }
  const full = path.join(VIDEO_DIR, file);
  if (!existsSync(full)) {
    res.status(404).json({ error: "Vidéo introuvable (peut-être expirée après redéploiement)" });
    return;
  }
  res.setHeader("Content-Type", "video/mp4");
  res.sendFile(full);
});

export default router;
