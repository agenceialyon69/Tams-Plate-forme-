import { Router, type IRouter } from "express";
import { TranscribeAudioBody } from "@workspace/api-zod";
import { transcribeAudio } from "../lib/ai";

const router: IRouter = Router();

router.post("/ai/transcribe", async (req, res): Promise<void> => {
  const parsed = TranscribeAudioBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const transcript = await transcribeAudio(parsed.data.audioBase64, parsed.data.mimeType ?? "audio/webm");
  res.json({ transcript, language: "fr" });
});

export default router;
