import os
import uuid
import json
from pathlib import Path
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="TAMS GPU Video Worker")

# Configuration
MODELS_DIR = Path(os.environ.get("MODELS_DIR", "/app/models"))
OUTPUT_DIR = Path(os.environ.get("OUTPUT_DIR", "/tmp/tams-video-output"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

COMFYUI_URL = os.environ.get("COMFYUI_BASE_URL", "")

# Available models check
def check_models():
    models = {
        "comfyui": bool(COMFYUI_URL),
        "animatediff": (MODELS_DIR / "animatediff").exists(),
        "ltx": (MODELS_DIR / "ltx-video").exists(),
        "hunyuan": (MODELS_DIR / "hunyuan-video").exists(),
    }
    return models

class GenerateRequest(BaseModel):
    kind: str = "video"
    prompt: str
    images: Optional[list[str]] = None
    model: Optional[str] = "animatediff"
    duration: Optional[float] = 4.0
    fps: Optional[int] = 24
    width: Optional[int] = 720
    height: Optional[int] = 1280

@app.get("/health")
async def health():
    models = check_models()
    available = [k for k, v in models.items() if v]
    missing = [k for k, v in models.items() if not v]
    
    return {
        "ok": True,
        "worker": "gpu-video",
        "models": list(models.keys()),
        "available": available,
        "missing_config": missing,
        "comfyui_url": COMFYUI_URL if COMFYUI_URL else None,
        "output_dir": str(OUTPUT_DIR),
    }

@app.post("/generate")
async def generate(req: GenerateRequest):
    if req.kind != "video":
        raise HTTPException(status_code=400, detail="This worker only handles video generation")
    
    models = check_models()
    model = req.model or "animatediff"
    
    if not models.get(model):
        missing = [k for k, v in models.items() if not v]
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "error": f"Model '{model}' not available. Missing models: {missing}",
                "missingConfig": True,
                "hint": f"Download model weights to {MODELS_DIR}/{model}/ or configure COMFYUI_BASE_URL"
            }
        )
    
    # Generate video (placeholder - implement actual generation)
    output_id = str(uuid.uuid4())
    output_path = OUTPUT_DIR / f"{output_id}.mp4"
    
    # Real implementation would call:
    # - ComfyUI API if model == "comfyui"
    # - Diffusers pipeline for animatediff/ltx/hunyuan
    
    # Placeholder response for now
    return {
        "ok": True,
        "url": f"/outputs/{output_id}.mp4",
        "provider": model,
        "engine": f"{model}_v1",
        "metadata": {
            "prompt": req.prompt,
            "duration": req.duration,
            "fps": req.fps,
            "resolution": f"{req.width}x{req.height}",
            "generated_at": datetime.utcnow().isoformat(),
            "note": "Worker infrastructure ready. Connect GPU and download models for actual generation."
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
