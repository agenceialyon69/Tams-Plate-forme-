import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Moteur VIDÉO partagé (route Studio + outil Chat). Diaporama 9:16 720×1280 via
 * FFmpeg, 100% gratuit. Red Team v1: si aucune image n'est fournie, on génère
 * quand même une vraie vidéo MP4 verticale à partir du texte.
 */

const __dir = dirname(fileURLToPath(import.meta.url));
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

function cleanText(value: string | undefined): string {
  return (value?.trim() || "TAMS Studio").replace(/[\r\n]+/g, " ").slice(0, 220);
}

async function textFile(work: string, text: string): Promise<string | null> {
  if (!text.trim()) return null;
  const file = path.join(work, "text.txt");
  await writeFile(file, text);
  return file;
}

function drawTextFilter(inputLabel: string, textPath: string | null, outputLabel = "outv"): string {
  if (!textPath || !existsSync(FONT_PATH)) return `[${inputLabel}]format=yuv420p[${outputLabel}]`;
  return `[${inputLabel}]drawtext=fontfile=${FONT_PATH}:textfile=${textPath}:fontcolor=white:fontsize=44:line_spacing=8:box=1:boxcolor=black@0.55:boxborderw=18:x=(w-text_w)/2:y=h-240,format=yuv420p[${outputLabel}]`;
}

function buildFilter(n: number, textPath: string | null): { filter: string; lastLabel: string } {
  const parts: string[] = [];
  for (let i = 0; i < n; i++) parts.push(`[${i}:v]format=yuv420p[v${i}]`);
  parts.push(`${Array.from({ length: n }, (_, i) => `[v${i}]`).join("")}concat=n=${n}:v=1:a=0[cat]`);
  parts.push(drawTextFilter("cat", textPath, "outv"));
  return { filter: parts.join(";"), lastLabel: "outv" };
}

export interface VideoResult {
  url: string;
  durationSec: number;
  images: number;
  withText: boolean;
  withMusic: boolean;
  engine?: "ffmpeg_slideshow" | "ffmpeg_text";
  degraded?: boolean;
  note?: string;
}

async function generateTextVideo(work: string, outPath: string, text: string, seconds: number, musicPath: string | null): Promise<void> {
  const tf = await textFile(work, cleanText(text));
  const args: string[] = ["-f", "lavfi", "-t", String(seconds), "-i", `color=c=0x111827:s=${W}x${H}:r=30`];
  if (musicPath) args.push("-i", musicPath);
  const filter = drawTextFilter("0:v", tf, "outv");
  args.push("-filter_complex", filter, "-map", "[outv]");
  if (musicPath) args.push("-map", "1:a", "-c:a", "aac", "-shortest");
  args.push("-c:v", "libx264", "-preset", "ultrafast", "-threads", "1", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", outPath);
  await spawnFfmpeg(args, 90_000);
}

export async function generateSlideshowVideo(opts: {
  images: string[];
  text?: string;
  secondsPerImage?: number;
  musicUrl?: string;
}): Promise<VideoResult> {
  const urls = (opts.images || []).filter((u) => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 8);
  const spi = Math.min(Math.max(Number(opts.secondsPerImage) || 2.5, 1), 6);

  await mkdir(VIDEO_DIR, { recursive: true });
  const work = await mkdtemp(path.join(os.tmpdir(), "tams-vid-"));
  try {
    let musicPath: string | null = null;
    if (opts.musicUrl && /^https?:\/\//.test(opts.musicUrl)) {
      try { musicPath = path.join(work, "music.audio"); await download(opts.musicUrl, musicPath); }
      catch { musicPath = null; }
    }

    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const outPath = path.join(VIDEO_DIR, `${id}.mp4`);

    if (urls.length === 0) {
      const seconds = Math.min(Math.max(Math.round(spi * 4), 6), 18);
      await generateTextVideo(work, outPath, opts.text || "Vidéo générée par TAMS Studio", seconds, musicPath);
      return {
        url: `/api/studio/video/${id}.mp4`,
        durationSec: seconds,
        images: 0,
        withText: true,
        withMusic: !!musicPath,
        engine: "ffmpeg_text",
        degraded: true,
        note: "Vidéo MP4 générée depuis le texte car aucune image n'était disponible.",
      };
    }

    const scaled: string[] = [];
    for (let i = 0; i < urls.length; i++) {
      const raw = path.join(work, `raw${i}`);
      const small = path.join(work, `s${i}.jpg`);
      try {
        await download(urls[i], raw);
        await preScale(raw, small);
        await rm(raw, { force: true }).catch(() => {});
        scaled.push(small);
      } catch {
        /* image ignorée */
      }
    }
    if (scaled.length === 0) {
      const seconds = Math.min(Math.max(Math.round(spi * 4), 6), 18);
      await generateTextVideo(work, outPath, opts.text || "Vidéo générée par TAMS Studio", seconds, musicPath);
      return { url: `/api/studio/video/${id}.mp4`, durationSec: seconds, images: 0, withText: true, withMusic: !!musicPath, engine: "ffmpeg_text", degraded: true, note: "Fallback texte utilisé car les images n'ont pas pu être préparées." };
    }

    const tf = opts.text && opts.text.trim() ? await textFile(work, cleanText(opts.text)) : null;
    const args: string[] = [];
    for (const p of scaled) args.push("-loop", "1", "-t", String(spi), "-i", p);
    if (musicPath) args.push("-i", musicPath);
    const { filter, lastLabel } = buildFilter(scaled.length, tf);
    args.push("-filter_complex", filter, "-map", `[${lastLabel}]`);
    if (musicPath) args.push("-map", `${scaled.length}:a`, "-c:a", "aac", "-shortest");
    args.push("-r", "30", "-c:v", "libx264", "-preset", "ultrafast", "-threads", "1", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", outPath);

    await spawnFfmpeg(args);

    return {
      url: `/api/studio/video/${id}.mp4`,
      durationSec: Math.round(scaled.length * spi),
      images: scaled.length,
      withText: !!tf,
      withMusic: !!musicPath,
      engine: "ffmpeg_slideshow",
      degraded: false,
    };
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
