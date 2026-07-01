import { writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const TRANSCRIPTION_TMP_DIR = path.join(os.tmpdir(), "tams-transcription");

export interface TranscriptionResult {
  ok: boolean;
  text?: string;
  error?: string;
  hint?: string;
  status?: number;
}

async function downloadAudio(url: string): Promise<Buffer> {
  if (!/^https?:\/\//.test(url)) throw new Error("audioUrl doit être une URL http/https");
  const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`download audio ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 50_000_000) throw new Error("fichier audio trop volumineux");
  await mkdir(TRANSCRIPTION_TMP_DIR, { recursive: true });
  await writeFile(path.join(TRANSCRIPTION_TMP_DIR, `${Date.now()}.audio`), buffer).catch(() => {});
  return buffer;
}

export async function transcribeAudioUrl(audioUrl: string, model?: string): Promise<TranscriptionResult> {
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY;
  if (!token) {
    return {
      ok: false,
      status: 503,
      error: "Transcription non configurée",
      hint: "Ajoute un token Hugging Face dans HF_TOKEN ou HUGGINGFACE_API_KEY.",
    };
  }

  try {
    const audio = await downloadAudio(audioUrl);
    const selectedModel = model || process.env.HF_ASR_MODEL || "openai/whisper-small";
    let response: Response | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(`https://api-inference.huggingface.co/models/${selectedModel}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
          "x-wait-for-model": "true",
        },
        body: audio as any,
        signal: AbortSignal.timeout(120_000),
      });
      if (response.status !== 503) break;
      await new Promise(resolve => setTimeout(resolve, 4000));
    }

    if (!response || !response.ok) {
      const detail = response ? (await response.text().catch(() => "")).slice(0, 300) : "";
      return {
        ok: false,
        status: response?.status === 401 ? 401 : 502,
        error: `Hugging Face ASR ${response?.status ?? "?"}`,
        hint: response?.status === 401 ? "Token HF invalide." : detail || "Modèle indisponible ou audio non supporté.",
      };
    }

    const data: unknown = await response.json().catch(async () => ({ text: await response.text() }));
    const text = typeof data === "object" && data !== null && "text" in data && typeof (data as { text?: unknown }).text === "string"
      ? (data as { text: string }).text
      : typeof data === "string"
        ? data
        : JSON.stringify(data);
    if (!text.trim()) return { ok: false, status: 502, error: "Transcription vide", hint: "Le provider n’a retourné aucun texte." };
    return { ok: true, text };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: "Transcription échouée",
      hint: err instanceof Error ? err.message : String(err),
    };
  }
}
