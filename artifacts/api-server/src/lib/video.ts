import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Moteur VIDÉO partagé (route Studio + outil Chat). Diaporama 9:16 720×1280 via
 * FFmpeg, 100% gratuit. Images pré-réduites une par une → mémoire bornée (anti-OOM
 * Railway). Aucune duplication : route et outil appellent generateSlideshowVideo.
 */

const __dir = dirname(fileURLToPath(import.meta.url));
// Le bundle est aplati dans dist/index.mjs → __dir = dist → ../assets/font.ttf
// (artifacts/api-server/assets/font.ttf, présent dans le dépôt au runtime).
export const FONT_PATH = path.resolve(__dir, "..", "assets", "font.ttf");
export const VIDEO_DIR = path.join(os.tmpdir(), "tams-videos");
const W = 720;
const H = 1280;

export function spawnFfmpeg(args: string[], timeoutMs = 120_000): Promise<void> {
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
  const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`download ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 25_000_000) throw new Error("fichier trop volumineux");
  await writeFile(dest, buf);
}

async function preScale(src: string, dest: string): Promise<void> {
  await spawnFfmpeg(
    ["-y", "-i", src, "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`, "-frames:v", "1", dest],
    30_000,
  );
}

function buildFilter(n: number, textFile: string | null): { filter: string; lastLabel: string } {
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

export interface VideoResult {
  url: string;
  durationSec: number;
  images: number;
  withText: boolean;
  withMusic: boolean;
}

export async function generateSlideshowVideo(opts: {
  images: string[];
  text?: string;
  secondsPerImage?: number;
  musicUrl?: string;
}): Promise<VideoResult> {
  const urls = (opts.images || []).filter((u) => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 8);
  if (urls.length === 0) throw new Error("Au moins une image (URL http/https) est requise.");
  const spi = Math.min(Math.max(Number(opts.secondsPerImage) || 2.5, 1), 6);

  await mkdir(VIDEO_DIR, { recursive: true });
  const work = await mkdtemp(path.join(os.tmpdir(), "tams-vid-"));
  try {
    const scaled: string[] = [];
    for (let i = 0; i < urls.length; i++) {
      const raw = path.join(work, `raw${i}`);
      const small = path.join(work, `s${i}.jpg`);
      try {
        // Tolérant : si UNE image (Pollinations, parfois lente) échoue, on
        // continue avec les autres au lieu de faire échouer toute la vidéo.
        await download(urls[i], raw);
        await preScale(raw, small);
        await rm(raw, { force: true }).catch(() => {});
        scaled.push(small);
      } catch {
        /* image ignorée */
      }
    }
    if (scaled.length === 0) {
      throw new Error("aucune image n'a pu être préparée (génération d'images lente — réessaie)");
    }

    let textFile: string | null = null;
    if (opts.text && opts.text.trim() && existsSync(FONT_PATH)) {
      textFile = path.join(work, "text.txt");
      await writeFile(textFile, opts.text.trim().slice(0, 200));
    }

    let musicPath: string | null = null;
    if (opts.musicUrl && /^https?:\/\//.test(opts.musicUrl)) {
      try { musicPath = path.join(work, "music.audio"); await download(opts.musicUrl, musicPath); }
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
    args.push("-r", "30", "-c:v", "libx264", "-preset", "ultrafast", "-threads", "1", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", outPath);

    await spawnFfmpeg(args);

    return {
      url: `/api/studio/video/${id}.mp4`,
      durationSec: Math.round(scaled.length * spi),
      images: scaled.length,
      withText: !!textFile,
      withMusic: !!musicPath,
    };
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
