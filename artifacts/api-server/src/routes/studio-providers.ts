import { Router } from "express";

const router = Router();

function has(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function env(name: string) {
  return has(process.env[name]);
}

router.get("/studio/providers/status", (_req, res) => {
  const hf = env("HF_TOKEN") || env("HUGGINGFACE_API_KEY");
  const gpuVideo = env("STUDIO_GPU_VIDEO_URL") || env("STUDIO_GPU_GENERAL_URL") || env("COMFYUI_BASE_URL");
  const gpuAudio = env("STUDIO_GPU_AUDIO_URL") || env("STUDIO_GPU_GENERAL_URL");
  const gpuImage = env("STUDIO_GPU_IMAGE_URL") || env("STUDIO_GPU_GENERAL_URL") || env("COMFYUI_BASE_URL");
  const n8n = env("N8N_WEBHOOK_URL");
  const db = env("DATABASE_URL");

  return res.json({
    ok: true,
    level: "free_first_additive",
    honestLimit: "Free-first fallback stays available. Premium requires explicit external provider URLs; missing config is reported instead of fake success.",
    premiumEnvironment: {
      video: {
        configured: gpuVideo,
        requiredAnyOf: ["STUDIO_GPU_VIDEO_URL", "STUDIO_GPU_GENERAL_URL", "COMFYUI_BASE_URL"],
        providerVariable: "PREMIUM_VIDEO_PROVIDER",
      },
      audio: {
        configured: gpuAudio,
        requiredAnyOf: ["STUDIO_GPU_AUDIO_URL", "STUDIO_GPU_GENERAL_URL"],
        providerVariable: "PREMIUM_AUDIO_PROVIDER",
      },
      image: {
        configured: gpuImage,
        requiredAnyOf: ["STUDIO_GPU_IMAGE_URL", "STUDIO_GPU_GENERAL_URL", "COMFYUI_BASE_URL"],
      },
    },
    providers: [
      { id: "pollinations", group: "image", status: "connected", role: "free prompt to image" },
      { id: "ffmpeg", group: "video", status: "runtime_required", role: "real MP4 assembly, edits and photo videos" },
      { id: "studio_upload", group: "media", status: "connected", role: "mobile upload for videos, photos and audio" },
      { id: "studio_render_edit", group: "video", status: "connected", role: "POST /api/studio/render-edit" },
      { id: "studio_render_photo_video", group: "video", status: "connected", role: "POST /api/studio/render-photo-video" },
      { id: "premium_video", group: "video", status: gpuVideo ? "configured" : "missing_config", role: "STUDIO_GPU_VIDEO_URL / COMFYUI_BASE_URL / STUDIO_GPU_GENERAL_URL" },
      { id: "premium_audio", group: "audio", status: gpuAudio ? "configured" : "missing_config", role: "STUDIO_GPU_AUDIO_URL / STUDIO_GPU_GENERAL_URL" },
      { id: "premium_image", group: "image", status: gpuImage ? "configured" : "missing_config", role: "STUDIO_GPU_IMAGE_URL / COMFYUI_BASE_URL / STUDIO_GPU_GENERAL_URL" },
      { id: "musicgen", group: "music", status: hf ? "connected" : "fallback_local", role: "free first music generation" },
      { id: "audiogen", group: "audio", status: hf ? "configurable" : "missing_config", role: "free first audio generation" },
      { id: "tts", group: "voice", status: hf ? "connected" : "fallback_local", role: "voice file generation" },
      { id: "postgres", group: "memory", status: db ? "connected" : "missing_config", role: "database memory" },
      { id: "n8n", group: "workflow", status: n8n ? "connected" : "missing_config", role: "workflow automation" },
      { id: "github_ci", group: "development", status: "connected", role: "PR and CI workflow" },
      { id: "railway", group: "deployment", status: "external_verify_required", role: "production deployment" },
    ],
  });
});

export default router;
