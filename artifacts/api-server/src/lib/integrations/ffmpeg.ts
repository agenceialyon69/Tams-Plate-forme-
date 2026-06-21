import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "../logger";

const execFileAsync = promisify(execFile);

/**
 * FFmpeg integration (modular, feature-flagged by availability).
 *
 * FFmpeg is a free, local, account-less video/audio toolkit — the open
 * alternative to tools like CapCut for programmatic editing. There is no API
 * key: the integration is "enabled" when the `ffmpeg`/`ffprobe` binaries are
 * present in the runtime image (installed via nixpacks for the Railway deploy).
 *
 * All calls shell out with an argument array (never a shell string), so user
 * input cannot be interpreted as shell syntax.
 */

const FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE_BIN = process.env.FFPROBE_PATH || "ffprobe";

let availabilityCache: { available: boolean; version: string | null } | null = null;

/** Whether ffmpeg/ffprobe are usable in this environment (cached). */
export async function ffmpegStatus(): Promise<{ available: boolean; version: string | null }> {
  if (availabilityCache) return availabilityCache;
  try {
    const { stdout } = await execFileAsync(FFMPEG_BIN, ["-version"], { timeout: 5_000 });
    const version = stdout.split("\n")[0]?.replace(/^ffmpeg version\s*/i, "").trim() || null;
    availabilityCache = { available: true, version };
  } catch {
    availabilityCache = { available: false, version: null };
  }
  return availabilityCache;
}

export async function isFfmpegAvailable(): Promise<boolean> {
  return (await ffmpegStatus()).available;
}

export interface MediaMetadata {
  durationSec: number | null;
  formatName: string | null;
  sizeBytes: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  width: number | null;
  height: number | null;
}

/** Probe a media file's metadata with ffprobe (duration, format, streams). */
export async function probeMedia(inputPath: string): Promise<MediaMetadata> {
  const { stdout } = await execFileAsync(
    FFPROBE_BIN,
    [
      "-v", "error",
      "-show_entries", "format=duration,format_name,size:stream=codec_type,width,height",
      "-of", "json",
      inputPath,
    ],
    { timeout: 30_000 }
  );
  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string; format_name?: string; size?: string };
    streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
  };
  const streams = parsed.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  return {
    durationSec: parsed.format?.duration ? Number(parsed.format.duration) : null,
    formatName: parsed.format?.format_name ?? null,
    sizeBytes: parsed.format?.size ? Number(parsed.format.size) : null,
    hasVideo: Boolean(video),
    hasAudio: streams.some((s) => s.codec_type === "audio"),
    width: video?.width ?? null,
    height: video?.height ?? null,
  };
}

/**
 * Extract the audio track from a video to a standalone file (default mp3).
 * Useful to chain a video memo into the existing Whisper transcription.
 */
export async function extractAudio(inputPath: string, outputPath: string): Promise<void> {
  await execFileAsync(
    FFMPEG_BIN,
    ["-y", "-i", inputPath, "-vn", "-acodec", "libmp3lame", "-q:a", "4", outputPath],
    { timeout: 300_000 }
  );
}

/** Trim a media file to [startSec, startSec+durationSec] without re-encoding. */
export async function trimMedia(
  inputPath: string,
  outputPath: string,
  startSec: number,
  durationSec: number
): Promise<void> {
  await execFileAsync(
    FFMPEG_BIN,
    [
      "-y",
      "-ss", String(Math.max(0, startSec)),
      "-i", inputPath,
      "-t", String(Math.max(0, durationSec)),
      "-c", "copy",
      outputPath,
    ],
    { timeout: 300_000 }
  );
}

// Best-effort warm-up so the status endpoint answers instantly later.
ffmpegStatus().then((s) => {
  if (s.available) logger.info({ version: s.version }, "FFmpeg available");
  else logger.info("FFmpeg not installed — video tools disabled");
});
