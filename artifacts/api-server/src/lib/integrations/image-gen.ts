import { logger } from "../logger";

/**
 * Text-to-image generation (modular, free providers).
 *
 * Goal: generate visuals from a prompt for free. Two providers:
 *  - pollinations : keyless, free, no account (default) — image.pollinations.ai
 *  - huggingface  : free token, higher quality (FLUX/SDXL) — HUGGINGFACE_API_KEY
 *
 * Selection via IMAGE_PROVIDER ("auto" by default: huggingface when a key is
 * set, otherwise pollinations). Disable everything with ENABLE_IMAGE_GENERATION=false.
 *
 * NOTE: generation calls an external host. On a restricted network policy the
 * call fails with a clear message — the host must be allow-listed for egress.
 */

export interface ImageOptions {
  width?: number;
  height?: number;
  seed?: number;
}

export interface GeneratedImage {
  imageBase64: string;
  mimeType: string;
  provider: string;
}

function enabled(): boolean {
  return (process.env.ENABLE_IMAGE_GENERATION ?? "true").toLowerCase() !== "false";
}

function clampDim(v: number | undefined, fallback: number): number {
  const n = Number(v) || fallback;
  return Math.min(Math.max(Math.round(n), 64), 1536);
}

/** Providers usable right now (pollinations is always usable — keyless). */
export function imageProviders(): string[] {
  if (!enabled()) return [];
  const list = ["pollinations"];
  if (process.env.HUGGINGFACE_API_KEY) list.unshift("huggingface");
  return list;
}

export function isImageGenAvailable(): boolean {
  return imageProviders().length > 0;
}

async function generatePollinations(prompt: string, opts: ImageOptions): Promise<GeneratedImage> {
  const width = clampDim(opts.width, 1024);
  const height = clampDim(opts.height, 1024);
  const model = process.env.POLLINATIONS_MODEL || "flux";
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    model,
    nologo: "true",
  });
  if (opts.seed !== undefined) params.set("seed", String(opts.seed));
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`Pollinations ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    imageBase64: buf.toString("base64"),
    mimeType: res.headers.get("content-type") || "image/jpeg",
    provider: "pollinations",
  };
}

async function generateHuggingface(prompt: string, opts: ImageOptions): Promise<GeneratedImage> {
  const model = process.env.HUGGINGFACE_IMAGE_MODEL || "black-forest-labs/FLUX.1-schnell";
  const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "image/png",
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: { width: clampDim(opts.width, 1024), height: clampDim(opts.height, 1024) },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`HuggingFace ${res.status}: ${detail.slice(0, 160)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    imageBase64: buf.toString("base64"),
    mimeType: res.headers.get("content-type") || "image/png",
    provider: "huggingface",
  };
}

/** Generate an image from a prompt via the first working free provider. */
export async function generateImage(prompt: string, opts: ImageOptions = {}): Promise<GeneratedImage> {
  if (!enabled()) throw new Error("Image generation is disabled");
  const safePrompt = prompt.slice(0, 1000).trim();
  if (!safePrompt) throw new Error("Empty prompt");

  const pref = (process.env.IMAGE_PROVIDER || "auto").toLowerCase().trim();
  const order =
    pref === "pollinations"
      ? ["pollinations"]
      : pref === "huggingface"
      ? ["huggingface", "pollinations"]
      : imageProviders(); // auto

  let lastErr: unknown = null;
  for (const provider of order) {
    try {
      if (provider === "huggingface" && process.env.HUGGINGFACE_API_KEY) {
        return await generateHuggingface(safePrompt, opts);
      }
      if (provider === "pollinations") {
        return await generatePollinations(safePrompt, opts);
      }
    } catch (err) {
      lastErr = err;
      logger.warn({ err, provider }, "Image provider failed, trying next");
    }
  }
  throw lastErr ?? new Error("No image provider available");
}
