# GPU Video Worker

Premium video generation with ComfyUI, AnimateDiff, LTX, Hunyuan.

## Endpoints

### GET /health
```json
{"ok": true, "models": ["comfyui", "animatediff", "ltx", "hunyuan"]}
```

### POST /generate
```json
{
  "kind": "video",
  "prompt": "A woman doing yoga in nature",
  "images": ["https://...optional-source-image"],
  "model": "animatediff|ltx|hunyuan|comfyui"
}
```

Response:
```json
{
  "ok": true,
  "url": "https://...video.mp4",
  "provider": "animatediff",
  "engine": "animatediff_v3",
  "metadata": {"duration": 4, "fps": 24, "resolution": "720x1280"}
}
```

## Models

### ComfyUI
Best for: Custom workflows, image-to-video
Setup:
1. Deploy ComfyUI server
2. Set COMFYUI_BASE_URL in TAMS
3. Place workflow JSON files in workflows/

### AnimateDiff
Best for: Animated images, motion graphics
- Model size: ~5GB
- GPU: 8GB+ VRAM recommended
- Output: 4s 24fps videos

### LTX Video
Best for: Long-form video (up to 10s)
- Model size: ~10GB
- GPU: 16GB+ VRAM
- Output: High quality 720p-1080p

### Hunyuan Video
Best for: Realistic human motion
- Model size: ~15GB
- GPU: 24GB+ VRAM
- Output: Photorealistic video

## Docker

```bash
docker build -t tams-gpu-video .
docker run -gpus all -p 8000:8000 tams-gpu-video
```
