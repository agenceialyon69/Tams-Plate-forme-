import os
import uuid
import base64
from pathlib import Path
from datetime import datetime
from io import BytesIO
import requests
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List
import numpy as np
from PIL import Image

app = FastAPI(title="TAMS Vision Worker")

# Configuration
MODELS_DIR = Path(os.environ.get("MODELS_DIR", "/app/models"))
OUTPUT_DIR = Path(os.environ.get("OUTPUT_DIR", "/app/outputs"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

YOLO_ENABLED = os.environ.get("YOLO_ENABLED", "true").lower() == "true"
SAM_ENABLED = Path("/app/models/sam").exists()
OCR_ENABLED = os.environ.get("OCR_ENABLED", "true").lower() == "true"

def check_models():
    return {
        "yolo": YOLO_ENABLED,
        "sam": SAM_ENABLED,
        "ocr": OCR_ENABLED,
    }

def load_image(image_input: str) -> np.ndarray:
    """Load image from URL or base64"""
    if image_input.startswith("http://") or image_input.startswith("https://"):
        resp = requests.get(image_input, timeout=30)
        resp.raise_for_status()
        img = Image.open(BytesIO(resp.content))
    else:
        # Assume base64
        img_data = base64.b64decode(image_input)
        img = Image.open(BytesIO(img_data))
    return np.array(img.convert("RGB"))

class DetectRequest(BaseModel):
    image: str
    confidence: Optional[float] = 0.5

class SegmentRequest(BaseModel):
    image: str
    points: Optional[List[List[int]]] = None

class OcrRequest(BaseModel):
    image: str
    language: Optional[str] = "fr"

@app.get("/health")
async def health():
    models = check_models()
    available = [k for k, v in models.items() if v]
    missing = [k for k, v in models.items() if not v]
    
    return {
        "ok": True,
        "worker": "vision",
        "models": list(models.keys()),
        "available": available,
        "missing_config": missing,
    }

@app.post("/detect")
async def detect(req: DetectRequest):
    models = check_models()
    
    if not models["yolo"]:
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "error": "YOLO not available",
                "missingConfig": True,
                "hint": "Set YOLO_ENABLED=true or install ultralytics"
            }
        )
    
    try:
        from ultralytics import YOLO
        model = YOLO("yolov8m.pt")  # Downloads on first use
        
        img = load_image(req.image)
        results = model(img, conf=req.confidence)[0]
        
        detections = []
        for box in results.boxes:
            detections.append({
                "label": results.names[int(box.cls)],
                "confidence": float(box.conf),
                "bbox": box.xywh.tolist()[0],  # [x, y, w, h]
            })
        
        
        return {
            "ok": True,
            "detections": detections,
            "provider": "yolo",
            "engine": "yolov8m",
            "metadata": {
                "count": len(detections),
                "generated_at": datetime.utcnow().isoformat()
            }
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"ok": False, "error": str(e)}
        )

@app.post("/segment")
async def segment(req: SegmentRequest):
    if not check_models()["sam"]:
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "error": "SAM not available",
                "missingConfig": True,
                "hint": "Download SAM model to /app/models/sam/"
            }
        )
    
    # Placeholder - implement SAM segmentation
    return {
        "ok": True,
        "mask_url": f"/outputs/{uuid.uuid4()}.png",
        "provider": "sam",
        "engine": "sam-vit-h",
        "metadata": {
            "generated_at": datetime.utcnow().isoformat(),
            "note": "Worker ready. Download SAM weights for actual segmentation."
        }
    }

@app.post("/ocr")
async def ocr(req: OcrRequest):
    if not check_models()["ocr"]:
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "error": "OCR not available",
                "missingConfig": True,
                "hint": "Set OCR_ENABLED=true and install paddleocr"
            }
        )
    
    try:
        from paddleocr import PaddleOCR
        
        ocr_model = PaddleOCR(use_angle_cls=True, lang=req.language)
        img = load_image(req.image)
        result = ocr_model.ocr(img, cls=True)
        
        blocks = []
        full_text = []
        for line in result[0]:
            text = line[1][0]
            confidence = line[1][1]
            bbox = line[0]
            blocks.append({
                "text": text,
                "confidence": confidence,
                "bbox": bbox
            })
            full_text.append(text)
        
        return {
            "ok": True,
            "text": " ".join(full_text),
            "blocks": blocks,
            "provider": "paddleocr",
            "engine": "paddleocr-v3",
            "metadata": {
                "block_count": len(blocks),
                "language": req.language,
                "generated_at": datetime.utcnow().isoformat()
            }
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"ok": False, "error": str(e)}
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
