# 38. Capability & Provider Registry

> TAMS uses a **capability-based architecture** with **free-first provider routing**. This document describes how capabilities are registered, how providers are selected, and how the system maintains honest status reporting.

## Overview

The Capability Registry is the central routing system for all TAMS operations:

```
User Request
     |
     v
+-------------------+
| Intent Detection  |
+--------+----------+
         |
         v
+-------------------+
| Capability Match  |
+--------+----------+
         |
         v
+-------------------+     +-------------------+
| Provider Select   |---->| Provider Health   |
+--------+----------+     +-------------------+
         |
         v
+-------------------+
| Rate Limit Check  |
+--------+----------+
         |
         v
+-------------------+
| Execute & Return  |
+-------------------+
```

## Core Concepts

### Capability

A **capability** is a discrete, well-defined operation that TAMS can perform.

```typescript
interface Capability {
  id: string;              // e.g., "text.generate"
  label: string;           // e.g., "Text Generation"
  description: string;
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
| Groq | Free | Available | 30/min | Fast inference, free tier |
| Gemini | Freemium | Available | 60/min | Free tier: 1500/day |
| Hugging Face | Free | Available | 30/min | Serverless inference |
| OpenRouter | Freemium | Available | Varies | Pay-per-use |
| Ollama | Free | Planned | None | Local LLM |

### Image Providers

| Provider | Type | Status | Notes |
|----------|------|--------|-------|
| Pollinations | Free | Available | No API key required |
| Hugging Face | Free | Available | SDXL, Flux models |
| ComfyUI | Free | Planned | Local Stable Diffusion, requires GPU |

### Audio Providers

| Provider | Type | Status | Notes |
|----------|------|--------|-------|
| Whisper | Free | Planned | Local speech-to-text |
| Piper | Free | Planned | Local text-to-speech |
| Edge TTS | Free | Planned | Microsoft Edge TTS, no API key |
| MusicGen | Free | Planned | Local music generation, requires GPU |
| Riffusion | Free | Experimental | Image-to-audio |

### Video Providers

| Provider | Type | Status | Notes |
|----------|------|--------|-------|
| FFmpeg | Free | Available | Video encoding/editing — in Railway/Nixpacks |
| Remotion | Free | Planned | Programmatic video |

### Automation / Infra Providers

| Provider | Type | Status | Notes |
|----------|------|--------|-------|
| n8n | Free | Planned | Workflow automation, self-hosted |
| Railway | Freemium | Available | Deployment platform |
| GitHub | Free | Available | Repo audit/validate (read-only) |

## Capability Registry (Full List)

| ID | Category | Risk | Permission | Status |
|----|----------|------|------------|--------|
| `text.generate` | text | low | authenticated | Available |
| `text.analyze` | text | low | authenticated | Available |
| `text.translate` | text | low | authenticated | Available |
| `studio.analyze` | analysis | low | authenticated | Available |
| `studio.generate` | text | low | authenticated | Available |
| `studio.brief.generate` | text | low | authenticated | Available |
| `studio.script.generate` | text | low | authenticated | Available |
| `studio.storyboard.generate` | text | low | authenticated | Available |
| `studio.prompt.generate` | text | low | authenticated | Available |
| `studio.caption.generate` | text | low | authenticated | Available |
| `studio.document.generate` | text | low | authenticated | Available |
| `studio.video.edit.plan` | video | low | authenticated | Available |
| `studio.music.plan` | audio | low | authenticated | Available |
| `studio.export.social` | text | low | authenticated | Available |
| `image.generate` | image | medium | authenticated | Available |
| `image.analyze` | image | low | authenticated | Available |
| `voice.transcribe` | audio | low | authenticated | Planned |
| `audio.synthesize` | audio | low | authenticated | Planned |
| `audio.music.generate` | audio | medium | approved | Planned |
| `video.edit` | video | medium | authenticated | Available |
| `video.generate` | video | high | approved | Planned |
| `repo.audit` | analysis | low | authenticated | Available |
| `repo.validate` | analysis | low | authenticated | Available |
| `repo.patch` | analysis | high | approved | Available |
| `memory.query` | analysis | low | authenticated | Available |
| `deploy.check` | analysis | low | authenticated | Available |
| `observe.health` | analysis | low | none | Available |
| `search.web` | text | low | authenticated | Planned |
| `automation.workflow` | automation | medium | approved | Planned |

## Risk Levels

| Level | Description | Chat Runtime Default |
|-------|-------------|---------------------|
| low | Read-only operations, text generation | Allowed (read_only mode) |
| medium | Image/video generation, audio | Requires authentication, logged |
| high | Video gen, file patches, multi-file changes | Requires explicit approval |
| critical | DB migrations, deploys, system config | Admin only, never from Chat |

## Chat Runtime Safety Rules

- Chat Runtime default mode: **read_only**
- Only `low` risk capabilities permitted without explicit approval
- `ENABLE_UNSAFE_RUNTIME_ACTIONS=false` always (hardcoded default)
- Destructive capabilities (`repo.patch`, `video.generate`, `automation.workflow`) never triggered from normal chat
- Backend refuses requests without valid Bearer token
- Session ownership verified before any runtime call

## Fallback Behavior

1. **fallback_free**: Try next free provider in order
2. **queue**: Add to queue, retry later
3. **fail**: Return error immediately with clear message

## API Endpoints

```
GET  /api/registry/capabilities          - List all capabilities
GET  /api/registry/capabilities/:id      - Get one capability
GET  /api/registry/providers             - List all providers
GET  /api/registry/providers/:id         - Get one provider
GET  /api/registry/status                - Full registry status
POST /api/registry/providers/:id/check   - Live provider health check
```

## Red Team Rules

1. **Honest Status**: Never mark `available` when actually `planned`
2. **Real Provider Check**: `available` requires proof of working config or local tool
3. **No Fake Content**: Never return placeholder video/music claiming it is real
4. **Clear Limitations**: Every response must expose what is NOT available
5. **Audit Trail**: Log all provider selections and fallbacks
6. **No Secret Leakage**: Provider API keys never returned in registry responses

## Security Model

| Level | Description |
|-------|-------------|
| `none` | Public — health checks, registry status |
| `authenticated` | Logged-in user — most operations |
| `approved` | Explicit approval — high-risk ops |
| `admin` | Admin only — system changes |

---

*See also: [37_STUDIO_CREATIVE_FACTORY.md](./37_STUDIO_CREATIVE_FACTORY.md)*
