import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";

const execFileAsync = promisify(execFile);
const FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg";

// First available font used for on-image captions (drawtext). Installed in the
// deploy image via nixpacks (fonts-dejavu-core). Captions are skipped if none.
const FONT_CANDIDATES = [
  process.env.CAPTION_FONT,
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
].filter((p): p is string => Boolean(p));
const CAPTION_FONT = FONT_CANDIDATES.find((p) => existsSync(p)) ?? null;

/**
 * Free "product video maker": assemble images into a short vertical slideshow
 * video — optional per-image text captions (product name/price/CTA) and
 * background music — using FFmpeg only. No paid service, no GPU, no Internet.
 * Ideal for Shopify / Reels / TikTok.
 */

export interface SlideshowOptions {
  width?: number;
  height?: number;
  /** Seconds each image is shown. */
  secondsPerImage?: number;
  fps?: number;
  /** Optional background music (base64). Trimmed to the video length, faded out. */
  musicBase64?: string;
  /** Optional caption per image (overlaid, lower third). Index-aligned. */
  captions?: string[];
  /** Transition between photos. Default "fade". */
  transition?: "none" | "fade" | "dissolve" | "slide" | "circle";
  /** Colour-grading look applied to each photo. Default "none". */
  style?: "none" | "vivid" | "warm" | "cinema" | "bw";
  /** Subtle Ken Burns zoom for a "living" feel. Default false. */
  kenBurns?: boolean;
}

// UI transition → ffmpeg xfade transition name.
const XFADE: Record<string, string> = {
  fade: "fade",
  dissolve: "dissolve",
  slide: "slideleft",
  circle: "circleopen",
};

// Colour-grading looks (applied per photo, before the caption so text stays crisp).
const STYLE_FILTER: Record<string, string> = {
  vivid: "eq=saturation=1.35:contrast=1.08",
  warm: "colorbalance=rs=0.06:gs=0.02:bs=-0.06,eq=saturation=1.12",
  cinema: "eq=contrast=1.12:saturation=1.0:gamma=0.95,vignette=PI/5",
  bw: "hue=s=0,eq=contrast=1.08",
};

/** Whether on-image text captions are available (a usable font was found). */
export function captionsAvailable(): boolean {
  return CAPTION_FONT !== null;
}

function clampDim(v: number | undefined, fallback: number): number {
  const n = Number(v) || fallback;
  return Math.min(Math.max(Math.round(n), 256), 1920);
}

/** Strip control characters so a caption stays a clean single line. */
function cleanCaption(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 32;
    out += code < 32 ? " " : ch;
  }
  return out.slice(0, 120);
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

    const n = inputPaths.length;
    // Crossfade transition between photos (xfade). 0 when "none" or single image.
    const xfadeName = opts.transition && opts.transition !== "none" ? XFADE[opts.transition] : null;
    const T = xfadeName && n >= 2 ? Math.min(0.7, dur * 0.4) : 0;
    // With xfade, consecutive clips overlap by T, shortening the total.
    const videoSec = T > 0 ? n * dur - (n - 1) * T : n * dur;

    const styleFilter = opts.style && opts.style !== "none" ? STYLE_FILTER[opts.style] : "";
    // d=1 (one output frame per input frame) → smooth zoom with NO frame blow-up.
    const kenBurns = opts.kenBurns
      ? `,zoompan=z='min(zoom+0.0008,1.12)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps}`
      : "";

    // Per-image: cover-crop to the target frame, normalise to fps, optional
    // colour grade + Ken Burns + caption overlay. Each input is bounded to
    // `dur` seconds via -loop/-t.
    const fontSize = Math.round(width / 16);
    const segments: string[] = [];
    for (let i = 0; i < n; i++) {
      let drawtext = "";
      const caption = opts.captions?.[i]?.trim();
      if (caption && CAPTION_FONT) {
        // Use textfile= so caption content needs no filtergraph escaping.
        const capPath = join(tmpdir(), `tams-vid-${id}-cap-${i}.txt`);
        await writeFile(capPath, cleanCaption(caption));
        cleanup.push(capPath);
        drawtext =
          `,drawtext=fontfile='${CAPTION_FONT}':textfile='${capPath}':` +
          `fontcolor=white:fontsize=${fontSize}:box=1:boxcolor=black@0.5:boxborderw=22:` +
          `x=(w-text_w)/2:y=h-h/4-text_h/2`;
      }
      segments.push(
        `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
          `crop=${width}:${height},setsar=1,fps=${fps}` +
          (styleFilter ? `,${styleFilter}` : "") +
          kenBurns +
          `,format=yuv420p${drawtext}[v${i}]`
      );
    }

    let filter: string;
    if (T > 0) {
      // Chain xfades: each join overlaps by T at offset i*(dur - T).
      const links: string[] = [];
      let prev = "[v0]";
      for (let i = 1; i < n; i++) {
        const out = i === n - 1 ? "[outv]" : `[x${i}]`;
        const offset = (i * (dur - T)).toFixed(3);
        links.push(`${prev}[v${i}]xfade=transition=${xfadeName}:duration=${T}:offset=${offset}${out}`);
        prev = out;
      }
      filter = `${segments.join(";")};${links.join(";")}`;
    } else {
      const concatInputs = inputPaths.map((_, i) => `[v${i}]`).join("");
      filter = `${segments.join(";")};${concatInputs}concat=n=${n}:v=1:a=0[outv]`;
    }

    const mapArgs = ["-map", "[outv]"];
    const audioArgs: string[] = [];
    if (musicIndex >= 0) {
      const fadeStart = Math.max(videoSec - 1.5, 0);
      filter += `;[${musicIndex}:a]afade=t=out:st=${fadeStart}:d=1.5,atrim=0:${videoSec}[outa]`;
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
      durationSec: Math.round(videoSec),
    };
  } finally {
    await Promise.all(cleanup.map((p) => unlink(p).catch(() => {/* best effort */})));
  }
}
