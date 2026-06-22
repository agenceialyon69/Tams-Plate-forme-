import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";

const execFileAsync = promisify(execFile);
const FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg";

const FONT_CANDIDATES = [
  process.env.CAPTION_FONT,
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
  "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
].filter((p): p is string => Boolean(p));
const CAPTION_FONT = FONT_CANDIDATES.find((p) => existsSync(p)) ?? null;

/**
 * World-class free product video maker — 100% FFmpeg, no paid service,
 * no GPU, no Internet required. Rival-quality output for Shopify / Reels / TikTok.
 *
 * Features: 15 transitions · 10 color grades · 5 Ken Burns modes · text shadow/box
 * · caption position · speed presets · audio fade-in/out · intro/outro title cards
 * · brand banner · logo overlay · libx264 fast encode.
 */

export interface TitleCard {
  title?: string;
  subtitle?: string;
}

export type TransitionType =
  | "none" | "fade" | "dissolve" | "slide" | "circle"
  | "wipeleft" | "wiperight" | "wipeup" | "wipedown"
  | "pixelize" | "radial" | "fadeblack" | "fadewhite"
  | "zoomin" | "squeezeh" | "squeezev";

export type StyleType =
  | "none" | "vivid" | "warm" | "cinema" | "bw"
  | "golden" | "cool" | "matte" | "vintage" | "neon";

export type KenBurnsMode =
  | "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "diagonal" | "random";

export type CaptionPosition = "top" | "center" | "bottom";

export interface SlideshowOptions {
  width?: number;
  height?: number;
  /** Seconds each image is shown. */
  secondsPerImage?: number;
  fps?: number;
  /** Optional background music (base64). Trimmed to the video length. */
  musicBase64?: string;
  /** Optional caption per image (overlaid). Index-aligned. */
  captions?: string[];
  /** Where captions appear. Default "bottom". */
  captionPosition?: CaptionPosition;
  /** Transition between clips. Default "fade". */
  transition?: TransitionType;
  /** Transition duration in seconds. Default 0.6. */
  transitionDuration?: number;
  /** Colour-grading look. Default "none". */
  style?: StyleType;
  /** Subtle Ken Burns motion. Default false. */
  kenBurns?: boolean;
  /** Ken Burns variation. Default "zoom-in". */
  kenBurnsMode?: KenBurnsMode;
  /** Opening title card. */
  intro?: TitleCard;
  /** Closing call-to-action card. */
  outro?: TitleCard;
  /** Persistent brand banner at the top of every frame. */
  brand?: string;
  /** Optional logo image (base64), overlaid top-right. */
  logoBase64?: string;
  /** Caption text rendering style. Default "box". */
  subtitleStyle?: "box" | "shadow" | "clean";
  /** Overall speed preset (affects per-image duration). Default "normal". */
  speed?: "slow" | "normal" | "fast";
}

// UI transition → ffmpeg xfade transition name
const XFADE: Record<string, string> = {
  fade: "fade",
  dissolve: "dissolve",
  slide: "slideleft",
  circle: "circleopen",
  wipeleft: "wipeleft",
  wiperight: "wiperight",
  wipeup: "wipeup",
  wipedown: "wipedown",
  pixelize: "pixelize",
  radial: "radial",
  fadeblack: "fadeblack",
  fadewhite: "fadewhite",
  zoomin: "zoomin",
  squeezeh: "squeezeh",
  squeezev: "squeezev",
};

// Colour-grading looks (applied before captions so text stays crisp)
const STYLE_FILTER: Record<string, string> = {
  vivid:   "eq=saturation=1.40:contrast=1.08:brightness=0.02",
  warm:    "colorbalance=rs=0.08:gs=0.02:bs=-0.08,eq=saturation=1.15:brightness=0.01",
  cinema:  "eq=contrast=1.15:saturation=0.95:gamma=0.92,vignette=PI/4",
  bw:      "hue=s=0,eq=contrast=1.10:brightness=0.02",
  golden:  "curves=r='0/0 0.5/0.6 1/1':g='0/0 0.5/0.5 1/0.95':b='0/0 0.5/0.4 1/0.85',eq=saturation=1.20",
  cool:    "colorbalance=rs=-0.08:gs=0.02:bs=0.12,eq=saturation=1.10:contrast=1.05",
  matte:   "eq=contrast=0.90:saturation=0.85:brightness=0.03,vignette=PI/6",
  vintage: "curves=r='0/0.05 0.5/0.55 1/0.95':g='0/0.02 0.5/0.48 1/0.92':b='0/0.05 0.5/0.45 1/0.85',eq=saturation=0.90",
  neon:    "eq=saturation=1.80:contrast=1.12:brightness=-0.05,colorbalance=rs=0.06:bs=0.08",
};

export function captionsAvailable(): boolean {
  return CAPTION_FONT !== null;
}

function clampDim(v: number | undefined, fallback: number): number {
  const n = Number(v) || fallback;
  return Math.min(Math.max(Math.round(n), 256), 1920);
}

function cleanText(s: string, max = 120): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 32;
    out += code < 32 ? " " : ch;
  }
  return out.slice(0, max);
}

/**
 * Ken Burns zoom/pan filter with 5 cinematic variations.
 * seed=0 → zoom-in, 1 → zoom-out, 2 → pan-left, 3 → pan-right, 4 → diagonal.
 */
function getKenBurnsFilter(
  mode: KenBurnsMode,
  width: number,
  height: number,
  fps: number,
  seed: number
): string {
  const resolved: Exclude<KenBurnsMode, "random"> =
    mode === "random"
      ? (["zoom-in", "zoom-out", "pan-left", "pan-right", "diagonal"] as const)[seed % 5]
      : mode;

  switch (resolved) {
    case "zoom-out":
      return `,zoompan=z='if(lte(zoom,1.0),1.12,max(1.0,zoom-0.0008))':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps}`;
    case "pan-left":
      return `,zoompan=z=1.08:d=1:x='if(lte(on,1),iw*0.08,max(x-2,0))':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps}`;
    case "pan-right":
      return `,zoompan=z=1.08:d=1:x='if(lte(on,1),0,min(x+2,iw*0.08))':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps}`;
    case "diagonal":
      return `,zoompan=z='min(zoom+0.0006,1.10)':d=1:x='if(lte(on,1),0,min(x+1,iw*0.06))':y='if(lte(on,1),0,min(y+1,ih*0.06))':s=${width}x${height}:fps=${fps}`;
    case "zoom-in":
    default:
      return `,zoompan=z='min(zoom+0.0008,1.12)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps}`;
  }
}

function captionY(pos: CaptionPosition, height: number): string {
  switch (pos) {
    case "top":    return String(Math.round(height / 14));
    case "center": return "(h-text_h)/2";
    case "bottom":
    default:       return `h-h/5-text_h/2`;
  }
}

function drawText(
  fontPath: string,
  textFilePath: string,
  fontSize: number,
  y: string,
  style: "box" | "shadow" | "clean" = "box",
  alpha = "1.0"
): string {
  const base = `fontfile='${fontPath}':textfile='${textFilePath}':fontcolor=white@${alpha}:fontsize=${fontSize}:x=(w-text_w)/2:y=${y}`;
  if (style === "shadow")
    return `drawtext=${base}:shadowcolor=black@0.85:shadowx=2:shadowy=2`;
  if (style === "clean")
    return `drawtext=${base}`;
  // box (default) — semi-transparent pill
  return `drawtext=${base}:box=1:boxcolor=black@0.48:boxborderw=${Math.round(fontSize * 0.55)}`;
}

interface Visual {
  kind: "image" | "card";
  dur: number;
  path?: string;
  caption?: string;
  title?: string;
  subtitle?: string;
  kbSeed?: number;
}

/** Build a polished slideshow mp4 (base64) from base64-encoded images. */
export async function makeSlideshow(
  imagesBase64: string[],
  opts: SlideshowOptions = {}
): Promise<{ videoBase64: string; mimeType: string; durationSec: number }> {
  const images = imagesBase64.filter((s) => typeof s === "string" && s.length > 0).slice(0, 8);
  if (images.length === 0) throw new Error("NO_IMAGES");

  const width  = clampDim(opts.width,  1080);
  const height = clampDim(opts.height, 1920);
  const speedMul = opts.speed === "slow" ? 1.4 : opts.speed === "fast" ? 0.7 : 1.0;
  const dur  = Math.min(Math.max((opts.secondsPerImage ?? 2.5) * speedMul, 1), 8);
  const fps  = Math.min(Math.max(opts.fps ?? 30, 12), 60);
  const hasFont      = CAPTION_FONT !== null;
  const capPos       = opts.captionPosition ?? "bottom";
  const subStyle     = opts.subtitleStyle  ?? "box";
  const kbMode: KenBurnsMode = opts.kenBurnsMode ?? "zoom-in";

  const id = randomUUID();
  const cleanup: string[] = [];

  async function textFile(tag: string, text: string, max = 120): Promise<string> {
    const p = join(tmpdir(), `tams-vid-${id}-${tag}.txt`);
    await writeFile(p, cleanText(text, max));
    cleanup.push(p);
    return p;
  }

  try {
    // --- Build ordered visual sequence ---
    const visuals: Visual[] = [];
    if (hasFont && (opts.intro?.title || opts.intro?.subtitle)) {
      visuals.push({ kind: "card", dur: 2.2 * speedMul, title: opts.intro.title, subtitle: opts.intro.subtitle });
    }
    for (let i = 0; i < images.length; i++) {
      const raw = images[i].includes(",") ? images[i].split(",").pop()! : images[i];
      const p = join(tmpdir(), `tams-vid-${id}-img-${i}`);
      await writeFile(p, Buffer.from(raw, "base64"));
      cleanup.push(p);
      visuals.push({ kind: "image", dur, path: p, caption: opts.captions?.[i]?.trim() || undefined, kbSeed: i });
    }
    if (hasFont && (opts.outro?.title || opts.outro?.subtitle)) {
      visuals.push({ kind: "card", dur: 2.8 * speedMul, title: opts.outro.title, subtitle: opts.outro.subtitle });
    }

    const outputPath = join(tmpdir(), `tams-vid-${id}.mp4`);
    cleanup.push(outputPath);

    // --- FFmpeg inputs ---
    const inputArgs: string[] = [];
    for (const v of visuals) {
      if (v.kind === "image") {
        // Extra 0.5s buffer so xfade offset arithmetic is never negative
        inputArgs.push("-loop", "1", "-t", String(v.dur + 0.5), "-i", v.path!);
      } else {
        inputArgs.push("-f", "lavfi", "-t", String(v.dur), "-i", `color=c=0x0d0d12:s=${width}x${height}:r=${fps}`);
      }
    }
    let musicIndex = -1;
    if (opts.musicBase64) {
      const raw = opts.musicBase64.includes(",") ? opts.musicBase64.split(",").pop()! : opts.musicBase64;
      const mp = join(tmpdir(), `tams-vid-${id}-music`);
      await writeFile(mp, Buffer.from(raw, "base64"));
      cleanup.push(mp);
      musicIndex = visuals.length;
      inputArgs.push("-i", mp);
    }
    let logoIndex = -1;
    if (opts.logoBase64) {
      const raw = opts.logoBase64.includes(",") ? opts.logoBase64.split(",").pop()! : opts.logoBase64;
      const lp = join(tmpdir(), `tams-vid-${id}-logo`);
      await writeFile(lp, Buffer.from(raw, "base64"));
      cleanup.push(lp);
      logoIndex = visuals.length + (musicIndex >= 0 ? 1 : 0);
      inputArgs.push("-i", lp);
    }

    const K = visuals.length;
    const transType  = opts.transition ?? "fade";
    const xfadeName  = transType !== "none" ? (XFADE[transType] ?? "fade") : null;
    const minDur     = Math.min(...visuals.map((v) => v.dur));
    const userT      = opts.transitionDuration ?? 0.6;
    const T          = xfadeName && K >= 2 ? Math.min(userT, minDur * 0.45, 1.0) : 0;

    const styleFx  = opts.style && opts.style !== "none" ? STYLE_FILTER[opts.style] : "";
    const capSz    = Math.round(width / 16);
    const titleSz  = Math.round(width / 8);
    const subSz    = Math.round(width / 20);
    const brandSz  = Math.round(width / 26);

    // --- Per-visual filter segments ---
    const segments: string[] = [];
    for (let i = 0; i < K; i++) {
      const v = visuals[i];
      if (v.kind === "image") {
        const kbFx = opts.kenBurns
          ? getKenBurnsFilter(kbMode, width, height, fps, v.kbSeed ?? i)
          : "";
        let captionFx = "";
        if (v.caption && hasFont) {
          const cp = await textFile(`cap-${i}`, v.caption);
          captionFx = `,${drawText(CAPTION_FONT!, cp, capSz, captionY(capPos, height), subStyle)}`;
        }
        segments.push(
          `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
          `crop=${width}:${height},setsar=1,fps=${fps}` +
          (styleFx ? `,${styleFx}` : "") +
          kbFx +
          `,format=yuv420p${captionFx}[v${i}]`
        );
      } else {
        // Title / outro card — dark background already from lavfi input
        let cardFx = "";
        if (v.title) {
          const p = await textFile(`title-${i}`, v.title, 80);
          const y = `(h-text_h)/2-${Math.round(height / 14)}`;
          cardFx += `,${drawText(CAPTION_FONT!, p, titleSz, y, "shadow")}`;
        }
        if (v.subtitle) {
          const p = await textFile(`sub-${i}`, v.subtitle, 100);
          const y = `h/2+${Math.round(height / 28)}`;
          cardFx += `,${drawText(CAPTION_FONT!, p, subSz, y, "shadow", "0.85")}`;
        }
        segments.push(`[${i}:v]setsar=1,fps=${fps},format=yuv420p${cardFx}[v${i}]`);
      }
    }

    // --- Compose: xfade chain or concat ---
    const useBrand = Boolean(opts.brand?.trim() && hasFont);
    const useLogo  = logoIndex >= 0;
    const needsPost = useBrand || useLogo;
    const composeOut = needsPost ? "[vbase]" : "[outv]";

    let filter: string;
    let videoSec: number;

    if (T > 0 && K >= 2) {
      const links: string[] = [];
      let prev = "[v0]";
      let acc = visuals[0].dur;
      for (let i = 1; i < K; i++) {
        const isLast = i === K - 1;
        const out = isLast ? composeOut : `[x${i}]`;
        links.push(`${prev}[v${i}]xfade=transition=${xfadeName}:duration=${T.toFixed(3)}:offset=${(acc - T).toFixed(3)}${out}`);
        prev = out;
        acc = acc + visuals[i].dur - T;
      }
      filter = `${segments.join(";")};${links.join(";")}`;
      videoSec = acc;
    } else if (K === 1) {
      filter = `${segments.join(";")};[v0]null${composeOut}`;
      videoSec = visuals[0].dur;
    } else {
      const concatIn = visuals.map((_, i) => `[v${i}]`).join("");
      filter = `${segments.join(";")};${concatIn}concat=n=${K}:v=1:a=0${composeOut}`;
      videoSec = visuals.reduce((s, v) => s + v.dur, 0);
    }

    // --- Post-compositing: brand banner, then logo ---
    let cur = "[vbase]";
    if (useBrand) {
      const bp = await textFile("brand", opts.brand!.trim(), 60);
      const next = useLogo ? "[vbrand]" : "[outv]";
      filter += `;${cur}${drawText(CAPTION_FONT!, bp, brandSz, String(Math.round(height / 22)), "shadow", "0.92")}${next}`;
      cur = next;
    }
    if (useLogo) {
      const pad      = Math.round(width / 28);
      const logoSize = Math.round(width / 5);
      filter += `;[${logoIndex}:v]scale=${logoSize}:-1[lg];${cur}[lg]overlay=W-w-${pad}:${pad}[outv]`;
    }

    // --- Audio ---
    const mapArgs: string[] = ["-map", "[outv]"];
    const audioArgs: string[] = [];
    if (musicIndex >= 0) {
      const fadeStart = Math.max(videoSec - 2.0, 0);
      filter += `;[${musicIndex}:a]afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeStart}:d=2.0,atrim=0:${videoSec}[outa]`;
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
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "22",
        "-pix_fmt", "yuv420p",
        ...audioArgs,
        "-movflags", "+faststart",
        outputPath,
      ],
      { timeout: 300_000, maxBuffer: 1024 * 1024 * 32 }
    );

    const video = await readFile(outputPath);
    return {
      videoBase64: video.toString("base64"),
      mimeType: "video/mp4",
      durationSec: Math.round(videoSec),
    };
  } finally {
    await Promise.all(cleanup.map((p) => unlink(p).catch(() => {})));
  }
}
