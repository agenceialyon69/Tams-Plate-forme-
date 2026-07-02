import { Router } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { generateMusic, generateSpeech, AUDIO_DIR } from "../lib/audio";

const router = Router();

type WorkerResult = { url?: string; error?: string; data?: unknown };

function workerUrl(kind: "audio" | "voice") {
  if (kind === "audio") return process.env.STUDIO_GPU_AUDIO_URL || process.env.STUDIO_GPU_GENERAL_URL || "";
  return process.env.STUDIO_GPU_VOICE_URL || process.env.STUDIO_GPU_GENERAL_URL || "";
}

async function tryWorker(kind: "audio" | "voice", prompt: string): Promise<WorkerResult | null> {
  const endpoint = workerUrl(kind);
  if (!endpoint) return null;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, prompt, source: "tams-studio" }),
      signal: AbortSignal.timeout(120_000),
    });
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) return { error: String(data.error || data.detail || `worker_http_${response.status}`) };
    const url = typeof data.url === "string" ? data.url : typeof data.artifactUrl === "string" ? data.artifactUrl : undefined;
    return url ? { url, data } : { error: "worker_no_url" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

router.post("/studio/generate-music", async (req, res) => {
  const { prompt } = req.body as { prompt?: string };
  if (!prompt || !prompt.trim()) return res.status(400).json({ error: "prompt requis (décris la musique)" });
  const external = await tryWorker("audio", prompt.trim());
  if (external?.url) {
    return res.json({ ok: true, url: external.url, engine: "external_audio_worker", provider: "gpu_audio_worker", degraded: false, honesty: "Audio généré par worker externe configuré." });
  }
  const r = await generateMusic(prompt.trim());
  if (!r.ok) return res.status(r.status ?? 500).json({ error: r.error, hint: r.hint, engine: r.engine, degraded: r.degraded, workerWarning: external?.error });
  return res.json({
    ok: true,
    url: r.url,
    bytes: r.bytes,
    engine: r.engine,
    degraded: r.degraded,
    hint: r.hint,
    workerWarning: external?.error,
    provider: r.engine === "huggingface" ? "huggingface_musicgen" : "local_wav",
    honesty: r.degraded ? "Fallback local: audio réel mais pas niveau musique premium." : "Audio généré via provider free-first.",
  });
});

router.post("/studio/tts", async (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text || !text.trim()) return res.status(400).json({ error: "text requis" });
  const external = await tryWorker("voice", text.trim());
  if (external?.url) {
    return res.json({ ok: true, url: external.url, engine: "external_voice_worker", provider: "gpu_voice_worker", degraded: false, honesty: "Voix générée par worker externe configuré." });
  }
  const r = await generateSpeech(text.trim());
  if (!r.ok) return res.status(r.status ?? 500).json({ error: r.error, hint: r.hint, engine: r.engine, degraded: r.degraded, workerWarning: external?.error });
  return res.json({
    ok: true,
    url: r.url,
    bytes: r.bytes,
    engine: r.engine,
    degraded: r.degraded,
    hint: r.hint,
    workerWarning: external?.error,
    provider: r.engine === "huggingface" ? "huggingface_tts" : "local_wav",
    honesty: r.degraded ? "Fallback local: voix/audio réel mais pas niveau voix premium." : "Voix générée via provider free-first.",
  });
});

router.get("/studio/audio/status", (_req, res) => {
  const hasHf = Boolean(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY);
  const hasAudioWorker = Boolean(workerUrl("audio"));
  const hasVoiceWorker = Boolean(workerUrl("voice"));
  return res.json({
    ok: true,
    musicProvider: hasAudioWorker ? "gpu_audio_worker" : hasHf ? "huggingface_musicgen" : "local_wav_fallback",
    voiceProvider: hasVoiceWorker ? "gpu_voice_worker" : hasHf ? "huggingface_tts" : "local_wav_fallback",
    premiumEquivalent: hasAudioWorker || hasVoiceWorker,
    capabilities: ["music_file", "voice_file", "audio_player", "local_fallback", "external_worker"],
  });
});

router.get("/studio/audio/:file", (req, res) => {
  const file = req.params.file;
  if (!/^[\w.-]+\.(wav|mp3|flac|ogg)$/.test(file)) {
    res.status(400).json({ error: "Nom de fichier invalide" });
    return;
  }
  const full = path.join(AUDIO_DIR, file);
  if (!existsSync(full)) {
    res.status(404).json({ error: "Audio introuvable (peut-être expiré après redéploiement)" });
    return;
  }
  res.sendFile(full);
});

export default router;
