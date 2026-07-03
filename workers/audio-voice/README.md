# Audio/Voice Worker

Premium audio generation and voice synthesis.

## Endpoints

### GET /health
```json
{"ok": true, "engines": ["piper", "edge-tts", "xtts", "musicgen"]}
```

### POST /generate
```json
{
  "kind": "audio|voice",
  "prompt": "Calm ambient music for meditation",
  "text": "Text to synthesize (for voice)"
}
```

Response:
```json
{
  "ok": true,
  "url": "https://...audio.wav",
  "provider": "piper|edge-tts|xtts|musicgen",
  "engine": "model-name",
  "metadata": {"duration": 30, "sample_rate": 22050}
}
```

## Engines

### Piper TTS
Best for: Fast, offline, low-latency voice
- No GPU required (CPU works)
- Multiple languages
- ~100MB per voice model

Setup:
```bash
pip install piper-tts
# Download voices to /app/voices/
```

### Edge-TTS
Best for: Free cloud TTS (Microsoft Edge)
- No local GPU needed
- Many languages and voices
- Internet required

Setup:
```bash
pip install edge-tts
```

### XTTS v2
Best for: Voice cloning, multilingual
- Requires ~4GB VRAM
- Can clone voices from 6s sample
- Supports 17+ languages

### MusicGen
Best for: AI music generation
- Model sizes: small (300MB), medium (1.5GB), large (3.3GB)
- GPU recommended for medium/large

## Docker

```bash
docker build -t tams-audio-voice .
docker run -p 8000:8000 tams-audio-voice
```
