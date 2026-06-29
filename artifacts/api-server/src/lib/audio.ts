import { writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Moteur AUDIO partagé (routes Studio + outils Chat). Musique (MusicGen) et voix
 * (TTS) via l'Inference API Hugging Face — 100% gratuit avec un token HF_TOKEN.
 * Aucune duplication : route et outil appellent generateMusic / generateSpeech.
 */
export const AUDIO_DIR = path.join(os.tmpdir(), "tams-audio");

export interface AudioGenResult {
  ok: boolean;
  url?: string;
  bytes?: number;
  error?: string;
  hint?: string;
  status?: number; // code HTTP suggéré en cas d'échec
}

async function hfAudio(model: string, inputs: string): Promise<AudioGenResult> {
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY;
  if (!token) {
    return { ok: false, status: 503, error: "Audio non configuré", hint: "Ajoute un token Hugging Face GRATUIT dans HF_TOKEN (https://huggingface.co/settings/tokens)." };
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
      const hint = r?.status === 401 ? "Token HF invalide." : r?.status === 503 ? "Modèle en cours de chargement, réessaie dans 30s." : detail;
      return { ok: false, status: 502, error: `Hugging Face ${r?.status ?? "?"}`, hint };
    }
    const ct = r.headers.get("content-type") || "audio/wav";
    const ext = ct.includes("mpeg") ? "mp3" : ct.includes("flac") ? "flac" : ct.includes("ogg") ? "ogg" : "wav";
    const buf = Buffer.from(await r.arrayBuffer());
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await writeFile(path.join(AUDIO_DIR, `${id}.${ext}`), buf);
    return { ok: true, url: `/api/studio/audio/${id}.${ext}`, bytes: buf.length };
  } catch (err) {
    return { ok: false, status: 500, error: "Génération audio échouée", hint: err instanceof Error ? err.message : String(err) };
  }
}

export function generateMusic(prompt: string, model?: string): Promise<AudioGenResult> {
  return hfAudio(model || "facebook/musicgen-small", prompt);
}

export function generateSpeech(text: string, model?: string): Promise<AudioGenResult> {
  return hfAudio(model || "facebook/mms-tts-fra", text);
}
