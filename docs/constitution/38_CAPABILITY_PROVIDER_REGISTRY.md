# 38. Capability & Provider Registry

> TAMS uses a **capability-based architecture** with **free-first provider routing**. This document describes how capabilities are registered, how providers are selected, and how the system maintains honest status reporting.

## Overview

The Capability Registry is the central routing system for all TAMS operations:

```
User Request
     │
     ▼
┌─────────────────┐
│ Intent Detection │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Capability Match │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Provider Select │────▶│ Provider Health │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│ Rate Limit Check │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Execute & Return│
└─────────────────┘
```

## Core Concepts

### Capability

A **capability** is a discrete, well-defined operation that TAMS can perform.

```typescript
interface Capability {
  id: string;              // e.g., "text.generate"
  label: string;           // e.g., "Text Generation"
  description: string;     // Human-readable description
  category: string;        // text | image | audio | video | analysis | automation
  riskLevel: RiskLevel;    // low | medium | high | critical
  requiredPermission: Permission; // none | authenticated | approved | admin
  providers: Provider[];   // Available providers for this capability
  fallbackBehavior: Fallback; // fail | queue | fallback_free
  status: Status;          // available | planned | experimental | disabled
  validationNotes?: string;
}
```

### Provider

A **provider** is an external service or local tool that implements one or more capabilities.

```typescript
interface Provider {
  id: string;              // e.g., "groq"
  name: string;            // e.g., "Groq"
  type: ProviderType;      // free | freemium | paid
  status: ProviderStatus;  // available | planned | rate_limited | disabled
  baseUrl?: string;        // API endpoint
  requiresAuth: boolean;
  authType?: AuthType;     // api_key | oauth | none
  rateLimit?: RateLimit;
  notes?: string;
}
```

## Free-First Strategy

TAMS prioritizes providers in this order:

1. **Local** (Free, Unlimited)
   - FFmpeg, ComfyUI, Whisper, Piper, MusicGen
   - Runs on your hardware, zero cost

2. **Free Tier** (Free, Rate Limited)
   - Groq, Gemini, Pollinations, Hugging Face
   - No cost, but rate limits apply

3. **Freemium** (Free Tier Available)
   - OpenRouter, some Hugging Face models
   - Free tier with paid upgrades

4. **Paid** (Fallback Only)
   - Only used when explicitly requested
   - Never the default

## Provider Registry

### Text Providers

| Provider | Type | Status | Rate Limit | Notes |
|----------|------|--------|------------|-------|
| Groq | Free | ✅ Available | 30/min | Fast inference, free tier |
| Gemini | Freemium | ✅ Available | 60/min | Free tier: 1500/day |
| Hugging Face | Free | ✅ Available | 30/min | Serverless inference |
| OpenRouter | Freemium | ✅ Available | Varies | Pay-per-use |
| Ollama | Free | 🔜 Planned | None | Local LLM |

### Image Providers

| Provider | Type | Status | Notes |
|----------|------|--------|-------|
| Pollinations | Free | ✅ Available | No API key required |
| Hugging Face | Free | ✅ Available | SDXL, Flux models |
| ComfyUI | Free | 🔜 Planned | Local Stable Diffusion |

### Audio Providers

| Provider | Type | Status | Notes |
|----------|------|--------|-------|
| Whisper | Free | 🔜 Planned | Local speech-to-text |
| Piper | Free | 🔜 Planned | Local text-to-speech |
| MusicGen | Free | 🔜 Planned | Local music generation |
| Riffusion | Free | 🔜 Experimental | Image-to-audio |

### Video Providers

| Provider | Type | Status | Notes |
|----------|------|--------|-------|
| FFmpeg | Free | ✅ Available | Video encoding/editing |
| Remotion | Free | 🔜 Planned | Programmatic video |

### Automation Providers

| Provider | Type | Status | Notes |
|----------|------|--------|-------|
| n8n | Free | 🔜 Planned | Workflow automation |

## Capability Registry

### Text Capabilities

| ID | Risk | Permission | Status |
|----|------|------------|--------|
| `text.generate` | Low | Authenticated | ✅ Available |
| `text.analyze` | Low | Authenticated | ✅ Available |
| `text.translate` | Low | Authenticated | ✅ Available |

### Studio Capabilities

| ID | Risk | Permission | Status |
|----|------|------------|--------|
| `studio.brief.generate` | Low | Authenticated | ✅ Available |
| `studio.script.generate` | Low | Authenticated | ✅ Available |
| `studio.storyboard.generate` | Low | Authenticated | ✅ Available |
| `studio.prompt.generate` | Low | Authenticated | ✅ Available |
| `studio.caption.generate` | Low | Authenticated | ✅ Available |
| `studio.document.generate` | Low | Authenticated | ✅ Available |

### Image Capabilities

| ID | Risk | Permission | Status |
|----|------|------------|--------|
| `image.generate` | Medium | Authenticated | ✅ Available |
| `image.analyze` | Low | Authenticated | ✅ Available |

### Audio Capabilities

| ID | Risk | Permission | Status |
|----|------|------------|--------|
| `audio.transcribe` | Low | Authenticated | 🔜 Planned |
| `audio.synthesize` | Low | Authenticated | 🔜 Planned |
| `audio.music.generate` | Medium | Approved | 🔜 Planned |

### Video Capabilities

| ID | Risk | Permission | Status |
|----|------|------------|--------|
| `video.edit` | Medium | Authenticated | ✅ Available |
| `video.generate` | High | Approved | 🔜 Planned |

### Analysis Capabilities

| ID | Risk | Permission | Status |
|----|------|------------|--------|
| `repo.audit` | Low | Authenticated | ✅ Available |
| `repo.validate` | Low | Authenticated | ✅ Available |
| `memory.query` | Low | Authenticated | ✅ Available |
| `deploy.check` | Low | Authenticated | ✅ Available |
| `observe.health` | Low | None | ✅ Available |

## Risk Levels

### Low Risk
- Read-only operations
- Text generation
- Analysis and queries
- Auto-approved for authenticated users

### Medium Risk
- Image generation
- Video editing
- Audio synthesis
- Requires authentication, logged

### High Risk
- Video generation
- Music generation
- Multiple file modifications
- Requires explicit approval

### Critical Risk
- Database migrations
- Deployment actions
- System configuration changes
- Requires admin approval

## Fallback Behavior

When a provider fails or is rate limited:

1. **fallback_free**: Try next free provider
2. **queue**: Add to queue, retry later
3. **fail**: Return error immediately

```typescript
// Example: text.generate fallback chain
Groq (free) → Gemini (free) → Hugging Face (free) → OpenRouter (paid, last resort)
```

## API Endpoints

### List Capabilities
```
GET /api/registry/capabilities
Response: {
  capabilities: Capability[],
  total: number,
  available: number,
  planned: number,
  experimental: number
}
```

### Get Capability
```
GET /api/registry/capabilities/:id
Response: Capability
```

### List Providers
```
GET /api/registry/providers
Response: {
  providers: Provider[],
  total: number,
  available: number,
  planned: number,
  free: number
}
```

### Get Provider
```
GET /api/registry/providers/:id
Response: Provider
```

### Registry Status
```
GET /api/registry/status
Response: {
  strategy: "free-first",
  providers: { total, free, freemium, paid, available, planned },
  capabilities: { total, available, planned },
  freeProvidersAvailable: string[],
  limitations: string[]
}
```

### Provider Health Check
```
POST /api/registry/providers/:id/check
Response: {
  provider: string,
  status: "healthy" | "unhealthy" | "unreachable" | "no_url",
  httpStatus?: number,
  error?: string
}
```

## Red Team Rules

1. **Honest Status**: Never claim a capability is available when it's planned
2. **Real Provider Check**: Only show "available" if provider is actually connected
3. **No Fake Content**: Never generate placeholder images/videos/music
4. **Clear Limitations**: Always show what's NOT available
5. **Audit Trail**: Log all provider selections and fallbacks

## Security Model

### Permission Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| `none` | Public access | Health checks, status |
| `authenticated` | Logged-in user | Most operations |
| `approved` | Explicit approval | High-risk operations |
| `admin` | Admin only | System changes |

### Rate Limiting

Each provider has rate limits:
- Enforced at provider level
- Tracked per user
- Returns 429 when exceeded

## Roadmap

### Phase 1 (Current)
- ✅ Capability Registry API
- ✅ Provider Registry API
- ✅ Free tier providers (Groq, Gemini, Pollinations)
- ✅ Local FFmpeg

### Phase 2 (Planned)
- 🔜 Local Whisper
- 🔜 Local Piper
- 🔜 ComfyUI integration
- 🔜 Remotion integration

### Phase 3 (Experimental)
- 🔜 MusicGen
- 🔜 Riffusion
- 🔜 n8n workflows

---

*See also: [37_STUDIO_CREATIVE_FACTORY.md](./37_STUDIO_CREATIVE_FACTORY.md)*
