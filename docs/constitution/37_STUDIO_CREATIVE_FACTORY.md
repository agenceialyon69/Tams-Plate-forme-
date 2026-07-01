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
3. **Audio**: Whisper (local), Piper TTS (local), Edge TTS — **planned**
4. **Video**: FFmpeg (local), Remotion (planned)
5. **Music**: MusicGen (local GPU), Riffusion (experimental) — **planned, requires local GPU**

## Available Capabilities

### Text & Documents
| Capability | Status | Provider |
|------------|--------|----------|
| `studio.analyze` | Available | Groq/Gemini |
| `studio.generate` | Available | Groq/Gemini |
| `studio.brief.generate` | Available | Groq/Gemini |
| `studio.script.generate` | Available | Groq/Gemini |
| `studio.storyboard.generate` | Available | Groq/Gemini |
| `studio.prompt.generate` | Available | Groq/Gemini |
| `studio.caption.generate` | Available | Groq/Gemini |
| `studio.document.generate` | Available | Groq/Gemini |
| `studio.video.edit.plan` | Available | Groq/Gemini (plan only) |
| `studio.music.plan` | Available | Groq/Gemini (plan only) |
| `studio.export.social` | Available | Groq/Gemini |

### Images
| Capability | Status | Provider |
|------------|--------|----------|
| `image.generate` | Available | Pollinations (free), Hugging Face, ComfyUI (local) |
| `image.analyze` | Available | Gemini, Hugging Face |

### Audio
| Capability | Status | Provider |
|------------|--------|----------|
| `voice.transcribe` | Planned | Whisper (local) |
| `audio.synthesize` | Planned | Piper TTS (local), Edge TTS |
| `audio.music.generate` | Planned | MusicGen (local GPU) |

### Video
| Capability | Status | Provider |
|------------|--------|----------|
| `video.edit` | Available | FFmpeg (local/Railway) |
| `video.generate` | Planned | Remotion (React-based) |

## What Studio Does NOT Claim

**TAMS never claims to generate:**
- Full video content (Remotion is planned, not connected)
- AI music (MusicGen requires local GPU setup — not available on Railway)
- Real-time audio synthesis (Piper not yet connected)

**Honest limitations are always displayed when a capability is unavailable.**

## Studio Orchestrator

The `StudioOrchestrator` (`artifacts/api-server/src/lib/studio/studio-orchestrator.ts`) transforms a creative request into a structured production plan:

### Input
```typescript
{
  objective: string;         // e.g., "TikTok video for KORE activewear"
  targetPlatform?: string;   // "tiktok" | "instagram" | "youtube" | ...
  project?: string;
  format?: string;
  tone?: string;
  constraints?: string[];
  availableCapabilities?: string[];
}
```

### Output
```typescript
{
  creativeBrief: string;
  scriptPlan: string;
  storyboardPlan: string;
  assetPlan: string;
  requiredCapabilities: string[];
  recommendedProviders: string[];
  productionSteps: string[];
  validationChecklist: string[];
  exportTargets: string[];
  missingCapabilities: string[];
  honestLimitations: string[];
}
```

### Supported Cases
1. "Create a natural TikTok video for KORE activewear" → brief + storyboard + FFmpeg plan + export targets
2. "Generate professional drill music" → plan + MusicGen planned marker + honest GPU limitation
3. "Make a short montage with subtitles" → timeline + FFmpeg/Remotion planned steps
4. "Prepare a marketing campaign for Claire" → multi-asset brief + delivery plan
5. "Create a professional document" → document structure + Groq/Gemini generation

## Architecture

```
+-----------------------------------------------------------------+
|                       TAMS STUDIO                              |
+-----------------------------------------------------------------+
|  Studio Orchestrator  (lib/studio/studio-orchestrator.ts)      |
|  Studio Router        (/api/studio/*)                          |
|  Studio Generate      (/api/studio-generate/*)                 |
|  Studio Video         (/api/studio-video/*)                    |
|  Studio Music         (/api/studio-music/*)                    |
|  Capability Registry  (/api/registry/*)                        |
+-----------------------------------------------------------------+
|                    CAPABILITY ROUTER                           |
|  Intent Detection -> Capability Match -> Provider Select       |
+-----------------------------------------------------------------+
|                    PROVIDER LAYER                              |
|  Free Tier: Groq, Gemini, Pollinations, Hugging Face           |
|  Local:     FFmpeg (available), ComfyUI, Whisper (planned)     |
|  Paid:      OpenRouter (fallback only)                         |
+-----------------------------------------------------------------+
```

## API Endpoints

### Studio Orchestrator
```
POST /api/studio/orchestrate
Body: { objective, targetPlatform?, project?, format?, tone?, constraints? }
Response: StudioPlan (see Output above)
```

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

### Capability Registry
```
GET /api/registry/capabilities
GET /api/registry/capabilities/:id
GET /api/registry/providers
GET /api/registry/providers/:id
GET /api/registry/status
POST /api/registry/providers/:id/check
```

## Red Team Rules

1. **Never** claim video generation if Remotion is not connected
2. **Never** claim music generation if MusicGen is not connected
3. **Always** show honest status in `/api/registry/status`
4. **Always** expose limitations in API responses
5. **Block** high-risk capabilities without approval
6. **Never** mark a planned provider as `available`

## Roadmap

### Phase 1 (Current)
- Text generation via Groq/Gemini
- Document generation
- Script generation
- Prompt engineering
- Image generation via Pollinations
- FFmpeg video editing
- Capability Registry
- Studio Orchestrator (plan generation)

### Phase 2 (Planned)
- Local Whisper for transcription
- Local Piper / Edge TTS
- ComfyUI integration for local image generation
- Remotion for programmatic video

### Phase 3 (Experimental)
- MusicGen for music generation (local GPU required)
- Riffusion for experimental audio
- n8n for workflow automation

---

*See also: [38_CAPABILITY_PROVIDER_REGISTRY.md](./38_CAPABILITY_PROVIDER_REGISTRY.md)*
