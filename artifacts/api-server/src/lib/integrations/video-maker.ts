import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";

const execFileAsync = promisify(execFile);
const FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg";

// First available font used for text overlays (drawtext). Installed in the
// deploy image via nixpacks (fonts-dejavu-core). Text features degrade if none.
const FONT_CANDIDATES = [
  process.env.CAPTION_FONT,
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
].filter((p): p is string => Boolean(p));
const CAPTION_FONT = FONT_CANDIDATES.find((p) => existsSync(p)) ?? null;

/**
 * Free "product video maker": assemble images into a polished vertical video —
 * captions, intro/outro title cards, a persistent brand banner, colour grading,
 * Ken Burns motion, crossfade transitions and background music — using FFmpeg
 * only. No paid service, no GPU, no Internet. Ideal for Shopify / Reels / TikTok.
 */

export interface TitleCard {
  title?: string;
  subtitle?: string;
}

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
  /** Transition between clips. Default "fade". */
  transition?: "none" | "fade" | "dissolve" | "slide" | "circle";
  /** Colour-grading look applied to each photo. Default "none". */
  style?: "none" | "vivid" | "warm" | "cinema" | "bw";
  /** Subtle Ken Burns zoom for a "living" feel. Default false. */
  kenBurns?: boolean;
  /** Opening title card (brand / hook). */
  intro?: TitleCard;
  /** Closing call-to-action card. */
  outro?: TitleCard;
  /** Persistent brand banner shown at the top of every frame. */
  brand?: string;
  /** Optional logo image (base64), overlaid small in the top-right corner. */
  logoBase64?: string;
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

/** Whether text overlays are available (a usable font was found). */
export function captionsAvailable(): boolean {
  return CAPTION_FONT !== null;
}

function clampDim(v: number | undefined, fallback: number): number {
  const n = Number(v) || fallback;
  return Math.min(Math.max(Math.round(n), 256), 1920);
}

/** Strip control characters so overlaid text stays a clean single line. */
function cleanText(s: string, max = 120): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 32;
    out += code < 32 ? " " : ch;
  }
  return out.slice(0, max);
}

interface Visual {
  kind: "image" | "card";
  dur: number;
  path?: string;      // image
  caption?: string;   // image
  title?: string;     // card
  subtitle?: string;  // card
}

/** Build a polished slideshow mp4 (base64) from base64-encoded images. */
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
  const hasFont = CAPTION_FONT !== null;

  const id = randomUUID();
  const cleanup: string[] = [];

  /** Write text to a temp file for drawtext `textfile=` (no escaping needed). */
  async function textFile(tag: string, text: string, max = 120): Promise<string> {
    const p = join(tmpdir(), `tams-vid-${id}-${tag}.txt`);
    await writeFile(p, cleanText(text, max));
    cleanup.push(p);
    return p;
  }

  try {
    // --- Build the ordered list of visuals (intro card, photos, outro card) ---
    const visuals: Visual[] = [];
    if (hasFont && (opts.intro?.title || opts.intro?.subtitle)) {
      visuals.push({ kind: "card", dur: 2.2, title: opts.intro.title, subtitle: opts.intro.subtitle });
    }
    for (let i = 0; i < images.length; i++) {
      const raw = images[i].includes(",") ? images[i].split(",").pop()! : images[i];
      const p = join(tmpdir(), `tams-vid-${id}-img-${i}`);
      await writeFile(p, Buffer.from(raw, "base64"));
      cleanup.push(p);
      visuals.push({ kind: "image", dur, path: p, caption: opts.captions?.[i]?.trim() || undefined });
    }
    if (hasFont && (opts.outro?.title || opts.outro?.subtitle)) {
      visuals.push({ kind: "card", dur: 2.8, title: opts.outro.title, subtitle: opts.outro.subtitle });
    }

    const outputPath = join(tmpdir(), `tams-vid-${id}.mp4`);
    cleanup.push(outputPath);

    // --- Inputs (one per visual, then music) ---
    const inputArgs: string[] = [];
    for (const v of visuals) {
      if (v.kind === "image") {
        inputArgs.push("-loop", "1", "-t", String(v.dur), "-i", v.path!);
      } else {
        inputArgs.push("-f", "lavfi", "-t", String(v.dur), "-i", `color=c=0x14141a:s=${width}x${height}:r=${fps}`);
      }
    }
    let musicIndex = -1;
    if (opts.musicBase64) {
      const raw = opts.musicBase64.includes(",") ? opts.musicBase64.split(",").pop()! : opts.musicBase64;
      const musicPath = join(tmpdir(), `tams-vid-${id}-music`);
      await writeFile(musicPath, Buffer.from(raw, "base64"));
      cleanup.push(musicPath);
      musicIndex = visuals.length;
      inputArgs.push("-i", musicPath);
    }
    let logoIndex = -1;
    if (opts.logoBase64) {
      const raw = opts.logoBase64.includes(",") ? opts.logoBase64.split(",").pop()! : opts.logoBase64;
      const logoPath = join(tmpdir(), `tams-vid-${id}-logo`);
      await writeFile(logoPath, Buffer.from(raw, "base64"));
      cleanup.push(logoPath);
      logoIndex = visuals.length + (musicIndex >= 0 ? 1 : 0);
      inputArgs.push("-i", logoPath);
    }

    const K = visuals.length;
    const minDur = Math.min(...visuals.map((v) => v.dur));
    const xfadeName = opts.transition && opts.transition !== "none" ? XFADE[opts.transition] : null;
    const T = xfadeName && K >= 2 ? Math.min(0.6, minDur * 0.4) : 0;

    const styleFilter = opts.style && opts.style !== "none" ? STYLE_FILTER[opts.style] : "";
    const kenBurns = opts.kenBurns
      ? `,zoompan=z='min(zoom+0.0008,1.12)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps}`
      : "";
    const capSize = Math.round(width / 16);
    const titleSize = Math.round(width / 9);
    const subSize = Math.round(width / 22);

    // --- Per-visual segments ---
    const segments: string[] = [];
    for (let i = 0; i < K; i++) {
      const v = visuals[i];
      if (v.kind === "image") {
        let drawtext = "";
        if (v.caption && hasFont) {
          const capPath = await textFile(`cap-${i}`, v.caption);
          drawtext =
            `,drawtext=fontfile='${CAPTION_FONT}':textfile='${capPath}':` +
            `fontcolor=white:fontsize=${capSize}:box=1:boxcolor=black@0.5:boxborderw=22:` +
            `x=(w-text_w)/2:y=h-h/4-text_h/2`;
        }
        segments.push(
          `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
            `crop=${width}:${height},setsar=1,fps=${fps}` +
            (styleFilter ? `,${styleFilter}` : "") +
            kenBurns +
            `,format=yuv420p${drawtext}[v${i}]`
        );
      } else {
        let draw = "";
        if (v.title) {
          const p = await textFile(`title-${i}`, v.title, 80);
          draw += `,drawtext=fontfile='${CAPTION_FONT}':textfile='${p}':fontcolor=white:fontsize=${titleSize}:x=(w-text_w)/2:y=(h-text_h)/2-${Math.round(height / 14)}`;
        }
        if (v.subtitle) {
          const p = await textFile(`sub-${i}`, v.subtitle, 100);
          draw += `,drawtext=fontfile='${CAPTION_FONT}':textfile='${p}':fontcolor=white@0.85:fontsize=${subSize}:x=(w-text_w)/2:y=h/2+${Math.round(height / 28)}`;
        }
        segments.push(`[${i}:v]setsar=1,fps=${fps},format=yuv420p${draw}[v${i}]`);
      }
    }

    // --- Compose: crossfade chain (variable durations) or concat ---
    // The base composite goes to [vbase]; brand banner then logo are applied
    // after, each step renaming the "current" label until the final [outv].
    const brand = opts.brand?.trim();
    const useBrand = Boolean(brand && hasFont);
    const useLogo = logoIndex >= 0;
    const needsPost = useBrand || useLogo;
    const composeOut = needsPost ? "[vbase]" : "[outv]";

    let filter: string;
    let videoSec: number;
    if (T > 0 && K >= 2) {
      const links: string[] = [];
      let prev = "[v0]";
      let acc = visuals[0].dur;
      for (let i = 1; i < K; i++) {
        const out = i === K - 1 ? composeOut : `[x${i}]`;
        links.push(`${prev}[v${i}]xfade=transition=${xfadeName}:duration=${T}:offset=${(acc - T).toFixed(3)}${out}`);
        prev = out;
        acc = acc + visuals[i].dur - T;
      }
      filter = `${segments.join(";")};${links.join(";")}`;
      videoSec = acc;
    } else if (K === 1) {
      filter = `${segments.join(";")};[v0]null${composeOut}`;
      videoSec = visuals[0].dur;
    } else {
      const concatInputs = visuals.map((_, i) => `[v${i}]`).join("");
      filter = `${segments.join(";")};${concatInputs}concat=n=${K}:v=1:a=0${composeOut}`;
      videoSec = visuals.reduce((s, v) => s + v.dur, 0);
    }

    // --- Post-compositing: brand banner, then logo overlay ---
    let cur = "[vbase]";
    if (useBrand) {
      const bp = await textFile("brand", brand!, 60);
      const next = useLogo ? "[vbrand]" : "[outv]";
      filter +=
        `;${cur}drawtext=fontfile='${CAPTION_FONT}':textfile='${bp}':fontcolor=white@0.92:` +
        `fontsize=${Math.round(width / 26)}:x=(w-text_w)/2:y=${Math.round(height / 22)}:` +
        `box=1:boxcolor=black@0.35:boxborderw=14${next}`;
      cur = next;
    }
    if (useLogo) {
      const pad = Math.round(width / 28);
      filter +=
        `;[${logoIndex}:v]scale=${Math.round(width / 5)}:-1[lg];` +
        `${cur}[lg]overlay=W-w-${pad}:${pad}[outv]`;
    }

    // --- Audio ---
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
