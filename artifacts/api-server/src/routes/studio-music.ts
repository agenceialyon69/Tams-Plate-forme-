import { Router } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { generateMusic, generateSpeech, AUDIO_DIR } from "../lib/audio";

const router = Router();

/**
 * MUSIQUE (MusicGen) — gratuite via Hugging Face (HF_TOKEN). Voir lib/audio.ts
 * (moteur partagé avec l'outil Chat generate_music).
 * Body: { prompt: string }
 */
router.post("/studio/generate-music", async (req, res) => {
  const { prompt } = req.body as { prompt?: string };
  if (!prompt || !prompt.trim()) return res.status(400).json({ error: "prompt requis (décris la musique)" });
  const r = await generateMusic(prompt.trim());
  if (!r.ok) return res.status(r.status ?? 500).json({ error: r.error, hint: r.hint });
  return res.json({ ok: true, url: r.url, bytes: r.bytes });
});

/**
 * VOIX (TTS) — gratuite via Hugging Face (HF_TOKEN). Voix off des vidéos.
 * Body: { text: string }
 */
router.post("/studio/tts", async (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text || !text.trim()) return res.status(400).json({ error: "text requis" });
  const r = await generateSpeech(text.trim());
  if (!r.ok) return res.status(r.status ?? 500).json({ error: r.error, hint: r.hint });
  return res.json({ ok: true, url: r.url, bytes: r.bytes });
});

// Sert l'audio généré (lecture / téléchargement / piste vidéo).
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
