# TAMS GPU Workers

External GPU workers for premium media generation.

## Architecture

```
TAMS API Server (Railway)
        │
        ├── STUDIO_GPU_VIDEO_URL ──► gpu-video worker
        ├── STUDIO_GPU_AUDIO_URL ──► audio-voice worker
        ├── STUDIO_GPU_VOICE_URL ──► audio-voice worker
        ├── STUDIO_GPU_VISION_URL ──► vision worker
        ├── STUDIO_GPU_GENERAL_URL ──► any worker (fallback)
        ├── COMFYUI_BASE_URL ──► ComfyUI server
        └── N8N_WEBHOOK_URL ──► n8n workflow automation
```

## Free-First Fallbacks (No Workers Required)

TAMS works without any GPU worker:
- **Video**: Pollinations AI images + FFmpeg slideshow (free)
- **Audio**: HuggingFace MusicGen (free tier) or local WAV fallback
- **Image**: Pollinations Flux (free, no API key)
- **Voice**: HuggingFace TTS (free tier) or local WAV fallback

## Deployment

Each worker is a separate Docker container that can be deployed to:
- RunPod
- Vast.ai
- Lambda Labs
- Your own GPU server

## Required Response Format

All workers must respond with:
```json
{
  "ok": true,
  "url": "https://...result-file...",
  "provider": "comfyui|animatediff|piper|edge-tts|yolo|sam",
  "engine": "model-name",
  "metadata": {}
}
```

On error:
```json
{
  "ok": false,
  "error": "description",
  "missingConfig": true
}
```

## Environment Variables

| Variable | Purpose | Example |
|----------|---------|----------|
| STUDIO_GPU_VIDEO_URL | Video generation worker | http://gpu-video:8000/generate |
| STUDIO_GPU_AUDIO_URL | Music generation worker | http://audio-worker:8000/generate |
| STUDIO_GPU_VOICE_URL | Voice synthesis worker | http://voice-worker:8000/generate |
| STUDIO_GPU_VISION_URL | Vision (detect/segment/OCR) worker | http://vision-worker:8000 |
| STUDIO_GPU_GENERAL_URL | Generic fallback worker | http://general-gpu:8000/generate |
| COMFYUI_BASE_URL | ComfyUI API server | http://comfyui:8188 |
| N8N_WEBHOOK_URL | n8n automation webhook | https://n8n.example.com/webhook/xxx |
| HF_TOKEN | HuggingFace API token | hf_xxx |
| HUGGINGFACE_API_KEY | Alternative HF token | hf_xxx |
