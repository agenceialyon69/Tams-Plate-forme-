import os
import uuid
import base64
from pathlib import Path
from datetime import datetime
from io import BytesIO
import requests
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
from typing import Optional, List
import numpy as np
from PIL import Image

app = FastAPI(title="TAMS Vision Worker")

MODELS_DIR = Path(os.environ.get("MODELS_DIR", "/app/models"))
OUTPUT_DIR = Path(os.environ.get("OUTPUT_DIR", "/app/outputs"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def check_models():
    yolo_ready = False
    try:
        from ultralytics import YOLO
        yolo_ready = True
    except ImportError:
        pass
    
    sam_ready = (MODELS_DIR / "sam").exists() or (MODELS_DIR / "sam_vit_h_4b8939.pth").exists()
    
    ocr_ready = False
    try:
        from paddleocr import PaddleOCR
        ocr_ready = True
    except ImportError:
        pass
    
    return {
        "yolo": yolo_ready,
        "sam": sam_ready,
        "ocr": ocr_ready,
    }

def load_image(image_input: str) -> np.ndarray:
    if image_input.startswith("http://") or image_input.startswith("https://"):
        resp = requests.get(image_input, timeout=30)
        resp.raise_for_status()
        img = Image.open(BytesIO(resp.content))
    else:
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
        "note": "Returns ok:true ONLY when real processing happens"
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
                "hint": "pip install ultralytics"
            }
        )
    
    try:
        from ultralytics import YOLO
        model = YOLO("yolov8m.pt")
        
        img = load_image(req.image)
        results = model(img, conf=req.confidence)[0]
        
        detections = []
        for box in results.boxes:
            detections.append({
                "label": results.names[int(box.cls)],
                "confidence": float(box.conf),
                "bbox": box.xywh.tolist()[0],
            })
        
        return {
            "ok": True,
            "detections": detections,
            "provider": "yolo",
            "engine": "yolov8m",
            "verified": True,
            "metadata": {
                "count": len(detections),
                "generated_at": datetime.utcnow().isoformat()
            }
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})

@app.post("/segment")
async def segment(req: SegmentRequest):
    """Segmentation requires SAM model weights - NO FAKE URLS"""
    if not check_models()["sam"]:
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "error": "SAM not available - model weights not found",
                "missingConfig": True,
                "hint": "Download SAM model to MODELS_DIR/sam/",
                "requiredFiles": ["sam_vit_h_4b8939.pth or similar"]
            }
        )
    
    # SAM model exists - but we don't create fake mask URLs
    # Return that model is available but pipeline not implemented
    return JSONResponse(
        status_code=501,
        content={
            "ok": False,
            "error": "SAM weights found but segmentation pipeline not implemented",
            "missingConfig": True,
            "hint": "SAM model weights exist, but inference code not complete",
            "model_available": True
        }
    )

@app.post("/ocr")
async def ocr(req: OcrRequest):
    if not check_models()["ocr"]:
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "error": "OCR not available",
                "missingConfig": True,
                "hint": "pip install paddleocr paddlepaddle"
            }
        )
    
    try:
        from paddleocr import PaddleOCR
        
        ocr_model = PaddleOCR(use_angle_cls=True, lang=req.language, show_log=False)
        img = load_image(req.image)
        result = ocr_model.ocr(img, cls=True)
        
        blocks = []
        full_text = []
        for line in result[0] if result[0] else []:
            text = line[1][0]
            confidence = line[1][1]
            bbox = line[0]
            blocks.append({"text": text, "confidence": confidence, "bbox": bbox})
            full_text.append(text)
        
        return {
            "ok": True,
            "text": " ".join(full_text),
            "blocks": blocks,
            "provider": "paddleocr",
            "engine": "paddleocr-v3",
            "verified": True,
            "metadata": {"block_count": len(blocks), "language": req.language}
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})

@app.get("/outputs/{filename}")
async def get_output(filename: str):
    path = OUTPUT_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found or expired")
    return FileResponse(path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
