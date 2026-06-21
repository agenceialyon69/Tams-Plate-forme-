import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, readFile, unlink } from "node:fs/promises";

const execFileAsync = promisify(execFile);
const FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg";

/**
 * Free "product video maker": assemble a set of images into a short vertical
 * slideshow video with a subtle Ken Burns (zoom) motion, using FFmpeg only —
 * no paid text-to-video service, no GPU. Ideal for Shopify / Reels / TikTok.
 */

export interface SlideshowOptions {
  width?: number;
  height?: number;
  /** Seconds each image is shown. */
  secondsPerImage?: number;
  fps?: number;
  /** Optional background music (base64). Trimmed to the video length, faded out. */
  musicBase64?: string;
}

function clampDim(v: number | undefined, fallback: number): number {
  const n = Number(v) || fallback;
  return Math.min(Math.max(Math.round(n), 256), 1920);
}

/** Build a slideshow mp4 (base64) from base64-encoded images. */
export async function makeSlideshow(
  imagesBase64: string[],
  opts: SlideshowOptions = {}
): Promise<{ videoBase64: string; mimeType: string; durationSec: number }> {
  const images = imagesBase64.filter((s) => typeof s === "string" && s.length > 0).slice(0, 8);
  if (images.length === 0) throw new Error("NO_IMAGES");

  const width = clampDim(opts.width, 1080);
  const height = clampDim(opts.height, 1920);
  const dur = Math.min(Math.max(opts.secondsPerImage ?? 2.5, 1), 8);
  const fps = Math.min(Math.max(opts.fps ?? 30, 12), 60);

  const id = randomUUID();
  const cleanup: string[] = [];
  const inputPaths: string[] = [];

  try {
    for (let i = 0; i < images.length; i++) {
      const raw = images[i].includes(",") ? images[i].split(",").pop()! : images[i];
      const p = join(tmpdir(), `tams-vid-${id}-${i}.img`);
      await writeFile(p, Buffer.from(raw, "base64"));
      cleanup.push(p);
      inputPaths.push(p);
    }
    const outputPath = join(tmpdir(), `tams-vid-${id}.mp4`);
    cleanup.push(outputPath);

    const totalSec = dur * inputPaths.length;

    // Inputs: each image looped for `dur` seconds.
    const inputArgs: string[] = [];
    for (const p of inputPaths) {
      inputArgs.push("-loop", "1", "-t", String(dur), "-i", p);
    }

    // Optional background music as an extra input (trimmed + faded to length).
    let musicIndex = -1;
    if (opts.musicBase64) {
      const raw = opts.musicBase64.includes(",") ? opts.musicBase64.split(",").pop()! : opts.musicBase64;
      const musicPath = join(tmpdir(), `tams-vid-${id}-music`);
      await writeFile(musicPath, Buffer.from(raw, "base64"));
      cleanup.push(musicPath);
      musicIndex = inputPaths.length;
      inputArgs.push("-i", musicPath);
    }

    // Per-image: cover-crop to the target frame, normalise to fps, then concat.
    // (Each input is bounded to `dur` seconds via -loop/-t below.)
    const segments = inputPaths
      .map(
        (_, i) =>
          `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
          `crop=${width}:${height},setsar=1,fps=${fps},format=yuv420p[v${i}]`
      )
      .join(";");
    const concatInputs = inputPaths.map((_, i) => `[v${i}]`).join("");
    let filter = `${segments};${concatInputs}concat=n=${inputPaths.length}:v=1:a=0[outv]`;

    const mapArgs = ["-map", "[outv]"];
    const audioArgs: string[] = [];
    if (musicIndex >= 0) {
      const fadeStart = Math.max(totalSec - 1.5, 0);
      filter += `;[${musicIndex}:a]afade=t=out:st=${fadeStart}:d=1.5,atrim=0:${totalSec}[outa]`;
      mapArgs.push("-map", "[outa]");
      audioArgs.push("-c:a", "aac", "-b:a", "192k", "-shortest");
    }

    await execFileAsync(
      FFMPEG_BIN,
      [
        "-y",
        ...inputArgs,
        "-filter_complex", filter,
        ...mapArgs,
        "-r", String(fps),
        "-pix_fmt", "yuv420p",
        ...audioArgs,
        "-movflags", "+faststart",
        outputPath,
      ],
      { timeout: 300_000, maxBuffer: 1024 * 1024 * 16 }
    );

    const video = await readFile(outputPath);
    return {
      videoBase64: video.toString("base64"),
      mimeType: "video/mp4",
      durationSec: Math.round(dur * inputPaths.length),
    };
  } finally {
    await Promise.all(cleanup.map((p) => unlink(p).catch(() => {/* best effort */})));
  }
}
