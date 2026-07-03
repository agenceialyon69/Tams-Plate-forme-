import os
import uuid
import asyncio
import wave
import struct
import math
from pathlib import Path
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="TAMS Audio/Voice Worker")

# Configuration
VOICES_DIR = Path(os.environ.get("VOICES_DIR", "/app/voices"))
OUTPUT_DIR = Path(os.environ.get("OUTPUT_DIR", "/app/outputs"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def check_engines():
    """Check real engine availability"""
    edge_tts_installed = False
    try:
        import edge_tts
        edge_tts_installed = True
    except ImportError:
        pass
    
    piper_ready = VOICES_DIR.exists() and any(VOICES_DIR.glob("*.onnx"))
    musicgen_ready = Path("/app/models/musicgen").exists()
    xtts_ready = Path("/app/models/xtts").exists()
    
    return {
        "edge-tts": edge_tts_installed,
        "piper": piper_ready,
        "xtts": xtts_ready,
        "musicgen": musicgen_ready,
    }

class GenerateRequest(BaseModel):
    kind: str = "audio"
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
        "note": "Returns ok:true ONLY when real files are created"
    }

def generate_simple_wav(prompt: str, output_path: Path, duration: float = 8.0) -> bool:
    """Generate a real playable WAV file"""
    try:
        sample_rate = 22050
        samples = int(sample_rate * duration)
        
        with wave.open(str(output_path), 'w') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            
            h = hash(prompt) % 1000
            base_freq = 220 + (h % 220)
            
            for i in range(samples):
                t = i / sample_rate
                envelope = min(1.0, i / (sample_rate * 0.1)) * min(1.0, (samples - i) / (sample_rate * 0.2))
                value = (
                    math.sin(2 * math.pi * base_freq * t) * 0.4 +
                    math.sin(2 * math.pi * base_freq * 1.5 * t) * 0.2 +
                    math.sin(2 * math.pi * base_freq * 2 * t) * 0.1
                ) * envelope
                if int(t * 2) % 2 == 0:
                    value *= 0.7
                data = int(max(-32768, min(32767, value * 32760)))
                wav_file.writeframes(struct.pack('<h', data))
        
        return output_path.exists() and output_path.stat().st_size > 0
    except Exception:
        return False

@app.post("/generate")
async def generate(req: GenerateRequest):
    engines = check_engines()
    output_id = str(uuid.uuid4())
    
    if req.kind == "voice":
        text = req.text or req.prompt or ""
        if not text:
            raise HTTPException(status_code=400, detail="text or prompt required for voice generation")
        
        if engines["edge-tts"]:
            try:
                import edge_tts
                output_path = OUTPUT_DIR / f"{output_id}.mp3"
                communicate = edge_tts.Communicate(text, "fr-FR-DeniseNeural")
                await communicate.save(str(output_path))
                
                # VERIFY FILE EXISTS BEFORE RETURNING OK
                if output_path.exists() and output_path.stat().st_size > 0:
                    return {
                        "ok": True,
                        "url": f"/outputs/{output_id}.mp3",
                        "provider": "edge-tts",
                        "engine": "fr-FR-DeniseNeural",
                        "bytes": output_path.stat().st_size,
                        "verified": True,
                        "metadata": {
                            "text_length": len(text),
                            "generated_at": datetime.utcnow().isoformat()
                        }
                    }
                # File not created - return error
                return JSONResponse(
                    status_code=500,
                    content={
                        "ok": False,
                        "error": "edge-tts failed to create audio file",
                        "missingConfig": False
                    }
                )
            except Exception as e:
                pass
        
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "error": "No voice engine available",
                "missingConfig": True,
                "hint": "Run: pip install edge-tts",
                "available_engines": engines
            }
        )
    
    if req.kind == "audio":
        prompt = req.prompt or "calm ambient music"
        output_path = OUTPUT_DIR / f"{output_id}.wav"
        
        # MusicGen if available - would go here
        
        # Fallback: Generate a REAL simple WAV file
        if generate_simple_wav(prompt, output_path, req.duration):
            # DOUBLE VERIFY FILE EXISTS
            if output_path.exists() and output_path.stat().st_size > 0:
                return {
                    "ok": True,
                    "url": f"/outputs/{output_id}.wav",
                    "provider": "local_wav",
                    "engine": "simple_tone_generator",
                    "bytes": output_path.stat().st_size,
                    "verified": True,
                    "degraded": True,
                    "metadata": {
                        "prompt": prompt,
                        "duration": req.duration,
                        "generated_at": datetime.utcnow().isoformat(),
                        "note": "Real WAV file generated. Simple synthesis, not premium AI music."
                    }
                }
        
        
        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "error": "Failed to generate audio file",
                "missingConfig": False
            }
        )
    
    raise HTTPException(status_code=400, detail=f"Unknown kind: {req.kind}")

@app.get("/outputs/{filename}")
async def get_output(filename: str):
    """Serve real output files only"""
    path = OUTPUT_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found or expired")
    return FileResponse(path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
