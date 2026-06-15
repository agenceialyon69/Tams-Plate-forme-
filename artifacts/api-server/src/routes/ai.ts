import { Router, type IRouter } from "express";
import { TranscribeAudioBody } from "@workspace/api-zod";
import { transcribeAudio } from "../lib/ai";

const router: IRouter = Router();

router.post("/ai/transcribe", async (req, res): Promise<void> => {
  const parsed = TranscribeAudioBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  // Cap base64 audio size (~7.5MB decoded) to bound memory and transcription cost.
  if (parsed.data.audioBase64.length > 10_000_000) {
    res.status(413).json({ error: "Audio payload too large" });
    return;
  }

  const transcript = await transcribeAudio(parsed.data.audioBase64, parsed.data.mimeType ?? "audio/webm");
  res.json({ transcript, language: "fr" });
});

export default router;
