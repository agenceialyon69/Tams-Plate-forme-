import { Router } from "express";

const router = Router();

function has(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

router.get("/studio/providers/status", (_req, res) => {
  const hf = has(process.env.HF_TOKEN) || has(process.env.HUGGINGFACE_API_KEY);
  const gpuVideoBridge = has(process.env.COMFYUI_VIDEO_WEBHOOK_URL) || has(process.env.COMFYUI_URL);
  const n8n = has(process.env.N8N_WEBHOOK_URL);
  const db = has(process.env.DATABASE_URL);

  return res.json({
    ok: true,
    level: "free_first",
    honestLimit: "This is not a native Kling Runway Suno equivalent. Premium level requires external providers or GPU workers.",
    providers: [
      { id: "pollinations", group: "image", status: "connected", role: "free prompt to image" },
      { id: "ffmpeg", group: "video", status: "runtime_required", role: "real MP4 assembly" },
      { id: "gpu_video_bridge", group: "video", status: gpuVideoBridge ? "connected" : "missing_config", role: "external ComfyUI or video model worker" },
      { id: "musicgen", group: "music", status: hf ? "connected" : "fallback_local", role: "free first music generation" },
      { id: "audiogen", group: "audio", status: hf ? "configurable" : "missing_config", role: "free first audio generation" },
      { id: "riffusion", group: "music", status: hf ? "experimental" : "missing_config", role: "experimental music loop" },
      { id: "tts", group: "voice", status: hf ? "connected" : "fallback_local", role: "voice file generation" },
      { id: "local_tts_runtime", group: "voice", status: "requires_runtime", role: "Piper or Edge TTS style local runtime" },
      { id: "vision_stack", group: "vision", status: "requires_runtime", role: "OpenCV YOLO MediaPipe SAM OCR style tools" },
      { id: "postgres", group: "memory", status: db ? "connected" : "missing_config", role: "database memory" },
      { id: "pgvector", group: "memory", status: db ? "available_if_extension_enabled" : "missing_config", role: "vector memory" },
      { id: "n8n", group: "workflow", status: n8n ? "connected" : "missing_config", role: "workflow automation" },
      { id: "github_ci", group: "development", status: "connected", role: "PR and CI workflow" },
      { id: "railway", group: "deployment", status: "external_verify_required", role: "production deployment" }
    ]
  });
});

export default router;
