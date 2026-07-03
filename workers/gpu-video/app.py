import os
import uuid
import json
from pathlib import Path
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="TAMS GPU Video Worker")

# Configuration
MODELS_DIR = Path(os.environ.get("MODELS_DIR", "/app/models"))
OUTPUT_DIR = Path(os.environ.get("OUTPUT_DIR", "/tmp/tams-video-output"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

COMFYUI_URL = os.environ.get("COMFYUI_BASE_URL", "")

def check_models():
    """Check real model availability - not just env vars"""
    models = {
        "comfyui": bool(COMFYUI_URL),
        "animatediff": (MODELS_DIR / "animatediff").exists(),
        "ltx": (MODELS_DIR / "ltx-video").exists(),
        "hunyuan": (MODELS_DIR / "hunyuan-video").exists(),
    }
    return models

def comfyui_healthcheck() -> bool:
    """Actually verify ComfyUI is reachable and responding"""
    if not COMFYUI_URL:
        return False
    try:
        import requests
        resp = requests.get(f"{COMFYUI_URL}/system_stats", timeout=5)
        return resp.status_code == 200
    except:
        return False

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
    
    # ComfyUI verified healthcheck
    comfyui_verified = comfyui_healthcheck() if models["comfyui"] else False
    
    return {
        "ok": True,
        "worker": "gpu-video",
        "models": list(models.keys()),
        "available": available,
        "missing_config": missing,
        "comfyui_url": COMFYUI_URL if COMFYUI_URL else None,
        "comfyui_verified": comfyui_verified,
        "output_dir": str(OUTPUT_DIR),
        "note": "Workers return ok:true ONLY when real files are generated."
    }

@app.post("/generate")
async def generate(req: GenerateRequest):
    if req.kind != "video":
        raise HTTPException(status_code=400, detail="This worker only handles video generation")
    
    models = check_models()
    model = req.model or "animatediff"
    
    # Check if any real engine is available
    has_comfyui = models.get("comfyui") and comfyui_healthcheck()
    has_local_model = models.get(model, False)
    
    if not has_comfyui and not has_local_model:
        missing = [k for k, v in models.items() if not v]
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "error": "No real GPU video engine configured and verified",
                "missingConfig": True,
                "requiredEnv": "COMFYUI_BASE_URL (with running ComfyUI) or MODELS_DIR with model weights",
                "missing": missing,
                "hint": f"Either deploy a ComfyUI server or download model weights to {MODELS_DIR}/{model}/"
            }
        )
    
    output_id = str(uuid.uuid4())
    output_path = OUTPUT_DIR / f"{output_id}.mp4"
    
    # Try ComfyUI first if available
    if has_comfyui:
        try:
            import requests
            # Submit workflow to ComfyUI
            workflow = {
                "prompt": req.prompt,
                "width": req.width,
                "height": req.height,
                "frames": int(req.duration * req.fps),
            }
            resp = requests.post(
                f"{COMFYUI_URL}/prompt",
                json=workflow,
                timeout=120
            )
            if resp.status_code != 200:
                return JSONResponse(
                    status_code=502,
                    content={
                        "ok": False,
                        "error": f"ComfyUI error: {resp.status_code}",
                        "detail": resp.text[:200]
                    }
                )
            # Would need to poll for result and download video
            return JSONResponse(
                status_code=501,
                content={
                    "ok": False,
                    "error": "ComfyUI reachable but full workflow not implemented",
                    "missingConfig": True,
                    "hint": "ComfyUI /prompt endpoint responded, video download logic needed",
                    "comfyui_reachable": True
                }
            )
        except Exception as e:
            return JSONResponse(
                status_code=502,
                content={
                    "ok": False,
                    "error": f"ComfyUI connection failed: {str(e)}",
                    "missingConfig": True
                }
            )
    
    # Try local model if available
    try:
        import torch
        if has_local_model and torch.cuda.is_available():
            # Real implementation would load and run the model here
            pass
    except ImportError:
        pass
    
    # NO REAL VIDEO GENERATED - return failure, NOT a placeholder URL
    return JSONResponse(
        status_code=503,
        content={
            "ok": False,
            "error": "No functional video generation engine available",
            "missingConfig": True,
            "requiredEnv": "COMFYUI_BASE_URL or GPU with model weights",
            "note": "This worker returns ok:true ONLY when a real video file is created"
        }
    )

@app.get("/outputs/{filename}")
async def get_output(filename: str):
    """Serve real output files only if they exist"""
    path = OUTPUT_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found or expired")
    return FileResponse(path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
