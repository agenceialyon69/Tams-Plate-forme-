# TAMS Free-First Provider Architecture

## Decision

TAMS must become an operational AI platform, not a collection of disconnected features.

The production rule is:

```text
provider principal -> free fallback -> honest missing_config
```

A provider is not considered operational because an environment variable exists. It is operational only when the capability is visible in `/api/system/readiness`, is routed by the backend, and passes a real production scenario.

## P0 providers to use first

| Domain | Primary | Fallback | Railway variables |
| --- | --- | --- | --- |
| LLM / reasoning | Gemini | Groq, OpenRouter, Hugging Face | `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `HF_TOKEN` |
| Fast chat / realtime | Groq | Gemini, OpenRouter | `GROQ_API_KEY` |
| Image generation | Gemini Image / Hugging Face | Pollinations | `GEMINI_API_KEY`, `HF_TOKEN` |
| Studio media backbone | FFmpeg | honest error | Nixpacks FFmpeg runtime |
| Voice STT/TTS | Groq Whisper / Groq TTS / Gemini TTS | local audio fallback where available | `GROQ_API_KEY`, `GEMINI_API_KEY` |
| Memory / RAG | PostgreSQL + pgvector | keyword/history fallback | `DATABASE_URL` |
| DevOps truth | GitHub + Railway | manual/read-only | `GITHUB_TOKEN`, Railway metadata |

## P1 providers to add after Studio/release stability

| Domain | Provider | Role | Variables |
| --- | --- | --- | --- |
| Web search | Tavily | agentic search/extract/crawl | `TAVILY_API_KEY` |
| Web extraction | Firecrawl | scrape/crawl/browser data layer | `FIRECRAWL_API_KEY` |
| AI observability | Langfuse | traces, prompts, cost, latency | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` |
| Workflow automation | n8n | async execution, webhooks | `N8N_WEBHOOK_URL`, `N8N_API_URL`, `N8N_API_KEY` |

## P2 providers only after P0/P1 are stable

| Domain | Provider | Constraint |
| --- | --- | --- |
| Premium image/video | ComfyUI worker | must be external GPU worker, never main Railway service |
| Premium media API | Runware | low-cost test lane, not core free-first platform |
| AI Gateway | Cloudflare AI Gateway or LiteLLM | useful when traffic/cost/tracing need central control |
| Durable media | Cloudflare R2 / S3 | needed when generated media must survive beyond `/tmp` |
| Advanced vector DB | Qdrant | only when pgvector becomes too limited |

## Operational rules

1. Do not add new features until `/studio` and `/api/system/readiness` are stable in production.
2. Do not merge duplicate Studio/media implementations.
3. Do not run Ollama, ComfyUI, Hunyuan, LTX Video, AnimateDiff or other heavy GPU workloads inside the main Railway service.
4. Do not call a module PASS because the build passed.
5. Do not show a premium success if the premium provider is not configured.
6. Every provider must be represented in the provider registry with status `configured`, `missing_config`, `free_builtin`, or `local_runtime`.
7. The platform verdict is PASS only when core capabilities pass production scenarios.

## Required production checks

- `GET /api/version` returns the deployed Railway commit SHA.
- `GET /api/system/readiness` returns provider registry and capability readiness.
- `/studio` loads the additive UI in production.
- Studio FFmpeg fallback generates a playable MP4.
- Image generation returns a real image URL or clear error.
- Voice/STT/TTS routes use Groq/Gemini when configured or return clear `missing_config`.
- Memory reports DB and pgvector status without exposing secrets.
- Web research is WARN until Tavily/Firecrawl are configured.
- Observability is WARN until Langfuse/AI Gateway is configured.

## Why this order

The current bottleneck is not lack of tools. The bottleneck is operational truth:

```text
GitHub main -> Railway SHA -> readiness endpoint -> real mobile/browser scenario
```

Only after that chain is reliable should TAMS add heavier providers or premium media lanes.
