import { writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Moteur AUDIO partagé (routes Studio + outils Chat).
 *
 * Red Team v1: le Studio doit rester opérationnel même sans fournisseur externe.
 * - Avec HF_TOKEN/HUGGINGFACE_API_KEY: tentative MusicGen/TTS Hugging Face.
 * - Sans token ou en échec provider: fallback WAV local déterministe, téléchargeable.
 *
 * Le fallback n'est pas une musique IA premium. C'est un vrai fichier audio généré côté
 * serveur pour que l'expérience reste fonctionnelle et honnête.
 */
export const AUDIO_DIR = path.join(os.tmpdir(), "tams-audio");

export interface AudioGenResult {
  ok: boolean;
  url?: string;
  bytes?: number;
  error?: string;
  hint?: string;
  status?: number;
  engine?: "huggingface" | "local_wav";
  degraded?: boolean;
}

function hashText(text: string): number {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function wavBuffer(prompt: string, kind: "music" | "speech"): Buffer {
  const sampleRate = 22_050;
  const seconds = kind === "speech" ? 3 : 8;
  const samples = sampleRate * seconds;
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  const hash = hashText(prompt);
  const base = kind === "speech" ? 180 : 220 + (hash % 220);
  const secondary = base * (kind === "speech" ? 1.5 : 1.25);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const beat = kind === "music" ? (Math.sin(2 * Math.PI * 2 * t) > 0.75 ? 0.35 : 0) : 0;
    const envelope = Math.min(1, i / (sampleRate * 0.25)) * Math.min(1, (samples - i) / (sampleRate * 0.4));
    const tone = Math.sin(2 * Math.PI * base * t) * 0.32 + Math.sin(2 * Math.PI * secondary * t) * 0.14 + beat;
    const value = Math.max(-1, Math.min(1, tone * envelope));
    buffer.writeInt16LE(Math.round(value * 32760), 44 + i * 2);
  }
  return buffer;
}

async function localAudio(prompt: string, kind: "music" | "speech", hint?: string): Promise<AudioGenResult> {
  await mkdir(AUDIO_DIR, { recursive: true });
  const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const file = `${id}.wav`;
  const buffer = wavBuffer(prompt, kind);
  await writeFile(path.join(AUDIO_DIR, file), buffer);
  return {
    ok: true,
    url: `/api/studio/audio/${file}`,
    bytes: buffer.length,
    engine: "local_wav",
    degraded: true,
    hint: hint ?? "Fallback local: fichier WAV simple généré sans fournisseur externe.",
  };
}

async function hfAudio(model: string, inputs: string, kind: "music" | "speech"): Promise<AudioGenResult> {
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY;
  if (!token) {
    return localAudio(inputs, kind, "HF_TOKEN absent: audio local généré pour garder le Studio opérationnel.");
  }
  try {
    await mkdir(AUDIO_DIR, { recursive: true });
    let r: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      r = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "x-wait-for-model": "true" },
        body: JSON.stringify({ inputs: inputs.slice(0, 1000) }),
        signal: AbortSignal.timeout(90_000),
      });
      if (r.status !== 503) break;
      await new Promise((res) => setTimeout(res, 4000));
    }
    if (!r || !r.ok) {
      const detail = r ? (await r.text().catch(() => "")).slice(0, 200) : "";
      return localAudio(inputs, kind, `Provider audio indisponible (${r?.status ?? "?"}). Fallback local utilisé. ${detail}`);
    }
    const ct = r.headers.get("content-type") || "audio/wav";
    const ext = ct.includes("mpeg") ? "mp3" : ct.includes("flac") ? "flac" : ct.includes("ogg") ? "ogg" : "wav";
    const buf = Buffer.from(await r.arrayBuffer());
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await writeFile(path.join(AUDIO_DIR, `${id}.${ext}`), buf);
    return { ok: true, url: `/api/studio/audio/${id}.${ext}`, bytes: buf.length, engine: "huggingface", degraded: false };
  } catch (err) {
    return localAudio(inputs, kind, err instanceof Error ? err.message : String(err));
  }
}

export function generateMusic(prompt: string, model?: string): Promise<AudioGenResult> {
  return hfAudio(model || "facebook/musicgen-small", prompt, "music");
}

export function generateSpeech(text: string, model?: string): Promise<AudioGenResult> {
  return hfAudio(model || "facebook/mms-tts-fra", text, "speech");
}
