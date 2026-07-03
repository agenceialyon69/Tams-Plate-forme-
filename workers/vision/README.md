# Vision Worker

Object detection, segmentation, and OCR.

## Endpoints

### GET /health
```json
{"ok": true, "models": ["yolo", "sam", "ocr"]}
```

### POST /detect
Object detection with YOLO
```json
{
  "image": "https://...image-url or base64",
  "confidence": 0.5
}
```

Response:
```json
{
  "ok": true,
  "detections": [
    {"label": "person", "confidence": 0.95, "bbox": [x, y, w, h]}
  ],
  "provider": "yolo",
  "engine": "yolov8m"
}
```

### POST /segment
Image segmentation with SAM
```json
{
  "image": "https://...image-url",
  "points": [[x, y], ...]  // optional prompts
}
```

Response:
```json
{
  "ok": true,
  "mask_url": "https://...mask.png",
  "provider": "sam",
  "engine": "sam-vit-h"
}
```

### POST /ocr
Text extraction
```json
{
  "image": "https://...image-url"
}
```

Response:
```json
{
  "ok": true,
  "text": "Extracted text",
  "blocks": [{"text": "...", "bbox": [...], "confidence": 0.9}],
  "provider": "paddleocr",
  "engine": "paddleocr-v3"
}
```

## Models

### YOLO
Best for: Object detection, tracking
- Models: yolov8n (fastest) to yolov8x (most accurate)
- CPU works, GPU faster
- ~6MB to ~200MB per model

### SAM (Segment Anything)
Best for: Segmentation, background removal
- Model sizes: vit-b (91MB), vit-l (358MB), vit-h (2.4GB)
- GPU recommended

### PaddleOCR / Tesseract
Best for: Text extraction
- CPU works well
- Multilingual support

## Docker

```bash
docker build -t tams-vision .
docker run -gpus all -p 8000:8000 tams-vision
```
