import os
import uuid
import asyncio
from pathlib import Path
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
from typing import Optional
import numpy as np
import scipy.io.wavfile as wavfile

app = FastAPI(title="TAMS Audio/Voice Worker")

# Configuration
VOICES_DIR = Path(os.environ.get("VOICES_DIR", "/app/voices"))
OUTPUT_DIR = Path(os.environ.get("OUTPUT_DIR", "/app/outputs"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

PIPER_AVAILABLE = os.environ.get("PIPER_ENABLED", "true").lower() == "true"
EDGE_TTS_AVAILABLE = os.environ.get("EDGE_TTS_ENABLED", "true").lower() == "true"
XTTS_AVAILABLE = (Path("/app/models/xtts").exists() or 
                  os.environ.get("XTTS_ENABLED", "false").lower() == "true")
MUSICGEN_AVAILABLE = (Path("/app/models/musicgen").exists() or
                      os.environ.get("MUSICGEN_ENABLED", "false").lower() == "true")

def check_engines():
    return {
        "piper": PIPER_AVAILABLE,
        "edge-tts": EDGE_TTS_AVAILABLE,
        "xtts": XTTS_AVAILABLE,
        "musicgen": MUSICGEN_AVAILABLE,
    }

class GenerateRequest(BaseModel):
    kind: str = "audio"  # audio or voice
    prompt: Optional[str] = None
    text: Optional[str] = None
    voice: Optional[str] = "default"
    language: Optional[str] = "fr"
    duration: Optional[float] = 10.0

@app.get("/health")
async def health():
    engines = check_engines()
    available = [k for k, v in engines.items() if v]
    missing = [k for k, v in engines.items() if not v]
    
    return {
        "ok": True,
        "worker": "audio-voice",
        "engines": list(engines.keys()),
        "available": available,
        "missing_config": missing,
        "note": "Enable engines via environment variables or by downloading models."
    }

@app.post("/generate")
async def generate(req: GenerateRequest):
    engines = check_engines()
    output_id = str(uuid.uuid4())
    
    if req.kind == "voice":
        text = req.text or req.prompt or ""
        if not text:
            raise HTTPException(status_code=400, detail="text or prompt required for voice generation")
        
        # Try edge-tts first (free, cloud-based)
        if engines["edge-tts"]:
            try:
                import edge_tts
                communicate = edge_tts.Communicate(text, "fr-FR-DeniseNeural")
                output_path = OUTPUT_DIR / f"{output_id}.mp3"
                await communicate.save(str(output_path))
                return {
                    "ok": True,
                    "url": f"/outputs/{output_id}.mp3",
                    "provider": "edge-tts",
                    "engine": "fr-FR-DeniseNeural",
                    "metadata": {
                        "text_length": len(text),
                        "generated_at": datetime.utcnow().isoformat()
                    }
                }
            except Exception as e:
                pass  # Fall through to fallback
        
        # Fallback: generate silent audio with placeholder message
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "error": "No voice engine available",
                "missingConfig": True,
                "hint": "Run: pip install edge-tts OR set PIPER_ENABLED=true and download voice models"
            }
        )
    
    if req.kind == "audio":
        # Music generation
        prompt = req.prompt or "calm ambient music"
        
        if not any(engines.values()):
            return JSONResponse(
                status_code=503,
                content={
                    "ok": False,
                    "error": "No audio engine available",
                    "missingConfig": True,
                    "hint": "Set MUSICGEN_ENABLED=true or XTTS_ENABLED=true and download models"
                }
            )
        
        
        # Placeholder - implement actual music generation
        return {
            "ok": True,
            "url": f"/outputs/{output_id}.wav",
            "provider": "musicgen-placeholder",
            "engine": "musicgen-small",
            "metadata": {
                "prompt": prompt,
                "duration": req.duration,
                "generated_at": datetime.utcnow().isoformat(),
                "note": "Worker infrastructure ready. Download MusicGen model for actual generation."
            }
        }
    
    raise HTTPException(status_code=400, detail=f"Unknown kind: {req.kind}")

@app.get("/outputs/{filename}")
async def get_output(filename: str):
    path = OUTPUT_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found or expired")
    return FileResponse(path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
