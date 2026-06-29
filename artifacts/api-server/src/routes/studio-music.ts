import { Router } from "express";
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const router = Router();

const AUDIO_DIR = path.join(os.tmpdir(), "tams-audio");

/**
 * Génération MUSIQUE réelle — gratuite via l'Inference API Hugging Face
 * (MusicGen de Meta). Nécessite un token HF gratuit : variable d'env HF_TOKEN.
 * Aucune API payante. À partir d'une description, renvoie un fichier audio
 * exploitable (Studio, et comme piste musicale des vidéos).
 *
 * Body: { prompt: string, model?: string }
 */
router.post("/studio/generate-music", async (req, res) => {
  const { prompt, model } = req.body as { prompt?: string; model?: string };
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: "prompt requis (décris la musique souhaitée)" });
  }

  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY;
  if (!token) {
    return res.status(503).json({
      error: "Génération musique non configurée",
      hint: "Ajoute un token Hugging Face GRATUIT dans la variable d'env HF_TOKEN (https://huggingface.co/settings/tokens).",
    });
  }

  const hfModel = model || "facebook/musicgen-small";

  try {
    await mkdir(AUDIO_DIR, { recursive: true });

    // L'API HF peut renvoyer 503 "model loading" au premier appel (cold start) :
    // on attend et on retente (x-wait-for-model demande à HF d'attendre).
    let r: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      r = await fetch(`https://api-inference.huggingface.co/models/${hfModel}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "x-wait-for-model": "true",
        },
        body: JSON.stringify({ inputs: prompt.trim() }),
        signal: AbortSignal.timeout(90_000),
      });
      if (r.status !== 503) break;
      await new Promise((res2) => setTimeout(res2, 4000));
    }

    if (!r || !r.ok) {
      const detail = r ? (await r.text().catch(() => "")).slice(0, 300) : "";
      const hint = r?.status === 401 ? "Token HF invalide." : r?.status === 503 ? "Modèle en cours de chargement, réessaie dans 30s." : undefined;
      return res.status(502).json({ error: `Hugging Face ${r?.status ?? "?"}`, hint, detail });
    }

    const ct = r.headers.get("content-type") || "audio/wav";
    const ext = ct.includes("mpeg") ? "mp3" : ct.includes("flac") ? "flac" : ct.includes("ogg") ? "ogg" : "wav";
    const buf = Buffer.from(await r.arrayBuffer());
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await writeFile(path.join(AUDIO_DIR, `${id}.${ext}`), buf);

    return res.json({ ok: true, url: `/api/studio/audio/${id}.${ext}`, model: hfModel, bytes: buf.length });
  } catch (err) {
    req.log?.error?.({ err }, "Music generation failed");
    return res.status(500).json({ error: "Génération musique échouée", detail: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * VOIX (TTS) — gratuite via Hugging Face (HF_TOKEN). Transforme un texte en
 * voix (voix off des vidéos). Aucune API payante.
 * Body: { text: string, model?: string }
 */
router.post("/studio/tts", async (req, res) => {
  const { text, model } = req.body as { text?: string; model?: string };
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "text requis" });
  }
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY;
  if (!token) {
    return res.status(503).json({
      error: "Voix non configurée",
      hint: "Ajoute un token Hugging Face GRATUIT dans HF_TOKEN.",
    });
  }
  const hfModel = model || "facebook/mms-tts-fra";
  try {
    await mkdir(AUDIO_DIR, { recursive: true });
    let r: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      r = await fetch(`https://api-inference.huggingface.co/models/${hfModel}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "x-wait-for-model": "true" },
        body: JSON.stringify({ inputs: text.trim().slice(0, 1000) }),
        signal: AbortSignal.timeout(60_000),
      });
      if (r.status !== 503) break;
      await new Promise((res2) => setTimeout(res2, 4000));
    }
    if (!r || !r.ok) {
      const detail = r ? (await r.text().catch(() => "")).slice(0, 200) : "";
      return res.status(502).json({ error: `Hugging Face ${r?.status ?? "?"}`, detail });
    }
    const ct = r.headers.get("content-type") || "audio/wav";
    const ext = ct.includes("mpeg") ? "mp3" : ct.includes("flac") ? "flac" : ct.includes("ogg") ? "ogg" : "wav";
    const buf = Buffer.from(await r.arrayBuffer());
    const id = `tts-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await writeFile(path.join(AUDIO_DIR, `${id}.${ext}`), buf);
    return res.json({ ok: true, url: `/api/studio/audio/${id}.${ext}`, model: hfModel, bytes: buf.length });
  } catch (err) {
    req.log?.error?.({ err }, "TTS failed");
    return res.status(500).json({ error: "Voix échouée", detail: err instanceof Error ? err.message : String(err) });
  }
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
