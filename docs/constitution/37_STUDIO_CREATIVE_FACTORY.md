# 37. Studio Creative Factory

> TAMS Studio is a **Creative Factory** designed around the **free-first** principle. It never pretends to generate video or music unless a real provider is connected.

## Vision

Studio provides a unified interface for creative content generation:
- Documents (reports, proposals, presentations)
- Scripts (video, podcast, audio)
- Prompts (prompt engineering and optimization)
- Captions (social media content)
- Images (via free providers)
- Video editing (via FFmpeg)
- Music (planned, local GPU required)

## Core Principle: Free-First

**TAMS Studio prioritizes free and local providers over paid SaaS:**

1. **Text Generation**: Groq, Gemini (free tiers) → Hugging Face → OpenRouter
2. **Image Generation**: Pollinations.ai (free, no API key) → Hugging Face → ComfyUI (local)
3. **Audio**: Whisper (local), Piper TTS (local) — **planned**
4. **Video**: FFmpeg (local), Remotion (planned)
5. **Music**: MusicGen (local GPU), Riffusion (experimental) — **planned**

## Available Capabilities

### Text & Documents
| Capability | Status | Provider |
|------------|--------|----------|
| `studio.brief.generate` | ✅ Available | Groq/Gemini |
| `studio.script.generate` | ✅ Available | Groq/Gemini |
| `studio.storyboard.generate` | ✅ Available | Groq/Gemini |
| `studio.prompt.generate` | ✅ Available | Groq/Gemini |
| `studio.caption.generate` | ✅ Available | Groq/Gemini |
| `studio.document.generate` | ✅ Available | Groq/Gemini |

### Images
| Capability | Status | Provider |
|------------|--------|----------|
| `image.generate` | ✅ Available | Pollinations (free), Hugging Face, ComfyUI (local) |
| `image.analyze` | ✅ Available | Gemini, Hugging Face |

### Audio
| Capability | Status | Provider |
|------------|--------|----------|
| `audio.transcribe` | 🔜 Planned | Whisper (local) |
| `audio.synthesize` | 🔜 Planned | Piper TTS (local) |
| `audio.music.generate` | 🔜 Planned | MusicGen (local GPU) |

### Video
| Capability | Status | Provider |
|------------|--------|----------|
| `video.edit` | ✅ Available | FFmpeg (local) |
| `video.generate` | 🔜 Planned | Remotion (React-based) |

## What Studio Does NOT Claim

**TAMS never claims to generate:**
- Full video content (Remotion is planned, not connected)
- AI music (MusicGen requires local GPU setup)
- Real-time audio synthesis (Piper not yet connected)

**Honest limitations are always displayed when a capability is unavailable.**

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    TAMS STUDIO                              │
├──────────────────────────────────────────────────────────────┤
│  Studio Router        (/api/studio/*)                       │
│  Studio Generate      (/api/studio-generate/*)              │
│  Studio Video         (/api/studio-video/*)                 │
│  Studio Music         (/api/studio-music/*)                 │
│  Capability Registry  (/api/registry/*)                     │
├──────────────────────────────────────────────────────────────┤
│                    CAPABILITY ROUTER                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Intent Detection → Capability Match → Provider Select  ││
│  └─────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────┤
│                    PROVIDER LAYER                           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Free Tier: Groq, Gemini, Pollinations, Hugging Face    ││
│  │  Local:     FFmpeg, ComfyUI, Whisper, Piper (planned)    ││
│  │  Paid:      OpenRouter (fallback only)                   ││
│  └─────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

## API Endpoints

### Document Generation
```
POST /api/studio/generate-document
Body: { type, title, context, tone, length }
Response: { content, type, title }
```

### Script Generation
```
POST /api/studio/generate-script
Body: { mediaType: "video"|"audio"|"podcast", prompt }
Response: { script, suggestions }
```

### Prompt Optimization
```
POST /api/studio/optimize-prompt
Body: { prompt, targetModel? }
Response: { optimized, improvements, suggestions }
```

### Image Generation Status
```
GET /api/studio/image-generation/status
Response: { available, reason, endpoints }
```

### Capability Registry
```
GET /api/registry/capabilities
GET /api/registry/capabilities/:id
GET /api/registry/providers
GET /api/registry/providers/:id
GET /api/registry/status
POST /api/registry/providers/:id/check
```

## Provider Requirements

### Free Tier (No Setup)
- **Pollinations.ai**: No API key required
- **Groq**: API key (free tier)
- **Gemini**: API key (60 req/min free)

### Local (Self-Hosted)
- **FFmpeg**: Must be installed on server
- **ComfyUI**: Local GPU, running on port 8188
- **Whisper**: Local GPU, running on port 8080
- **Piper**: Local, running on port 10200
- **MusicGen**: Local GPU required

### Paid (Fallback Only)
- **OpenRouter**: API key, pay-per-use

## Red Team Rules

1. **Never** claim video generation if Remotion is not connected
2. **Never** claim music generation if MusicGen is not connected
3. **Always** show honest status in `/api/registry/status`
4. **Always** expose limitations in API responses
5. **Block** high-risk capabilities without approval

## Roadmap

### Phase 1 (Current)
- ✅ Text generation via Groq/Gemini
- ✅ Document generation
- ✅ Script generation
- ✅ Prompt engineering
- ✅ Image generation via Pollinations
- ✅ FFmpeg video editing
- ✅ Capability Registry

### Phase 2 (Planned)
- 🔜 Local Whisper for transcription
- 🔜 Local Piper for TTS
- 🔜 ComfyUI integration for local image generation
- 🔜 Remotion for programmatic video

### Phase 3 (Experimental)
- 🔜 MusicGen for music generation
- 🔜 Riffusion for experimental audio
- 🔜 n8n for workflow automation

## Notes

- Studio is designed to work offline-first wherever possible
- Local providers (FFmpeg, ComfyUI, Whisper, Piper) offer zero-cost, unlimited usage
- Free tier providers (Groq, Gemini, Pollinations) have rate limits but no cost
- Paid providers are **fallback only**, never default

---

*See also: [38_CAPABILITY_PROVIDER_REGISTRY.md](./38_CAPABILITY_PROVIDER_REGISTRY.md)*
