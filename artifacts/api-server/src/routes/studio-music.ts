import { Router } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { generateMusic, generateSpeech, AUDIO_DIR } from "../lib/audio";

const router = Router();

/**
 * MUSIQUE free-first.
 *
 * Red Team:
 * - Avec HF_TOKEN/HUGGINGFACE_API_KEY: tentative MusicGen.
 * - Sans token ou si le provider échoue: fallback WAV local réel.
 * - Ce n'est pas Suno, mais ce n'est pas une fausse carte.
 */
router.post("/studio/generate-music", async (req, res) => {
  const { prompt } = req.body as { prompt?: string };
  if (!prompt || !prompt.trim()) return res.status(400).json({ error: "prompt requis (décris la musique)" });
  const r = await generateMusic(prompt.trim());
  if (!r.ok) return res.status(r.status ?? 500).json({ error: r.error, hint: r.hint, engine: r.engine, degraded: r.degraded });
  return res.json({
    ok: true,
    url: r.url,
    bytes: r.bytes,
    engine: r.engine,
    degraded: r.degraded,
    hint: r.hint,
    provider: r.engine === "huggingface" ? "huggingface_musicgen" : "local_wav",
    honesty: r.degraded ? "Fallback local: audio réel mais pas niveau Suno." : "Audio généré via provider free-first.",
  });
});

/**
 * VOIX free-first.
 * Body: { text: string }
 */
router.post("/studio/tts", async (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text || !text.trim()) return res.status(400).json({ error: "text requis" });
  const r = await generateSpeech(text.trim());
  if (!r.ok) return res.status(r.status ?? 500).json({ error: r.error, hint: r.hint, engine: r.engine, degraded: r.degraded });
  return res.json({
    ok: true,
    url: r.url,
    bytes: r.bytes,
    engine: r.engine,
    degraded: r.degraded,
    hint: r.hint,
    provider: r.engine === "huggingface" ? "huggingface_tts" : "local_wav",
    honesty: r.degraded ? "Fallback local: voix/audio réel mais pas niveau ElevenLabs/OpenAI TTS." : "Voix générée via provider free-first.",
  });
});

router.get("/studio/audio/status", (_req, res) => {
  const hasHf = Boolean(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY);
  return res.json({
    ok: true,
    musicProvider: hasHf ? "huggingface_musicgen" : "local_wav_fallback",
    voiceProvider: hasHf ? "huggingface_tts" : "local_wav_fallback",
    premiumEquivalent: false,
    capabilities: ["music_file", "voice_file", "audio_player", "local_fallback"],
    missingForSunoLevel: ["song_structure", "sung_vocals", "lyrics_alignment", "mixing_mastering", "consistent_voice_identity"],
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
