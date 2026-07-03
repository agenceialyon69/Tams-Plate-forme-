# TAMS Free-First Provider Architecture

## Current decision: zero-budget personal phase

TAMS must first become an operational personal AI platform before any paid provider, multi-tenant mode, customer onboarding, or premium media infrastructure is considered.

Current operating mode:

```text
TAMS_OPERATING_MODE=free_personal
TAMS_ALLOW_PAID_PROVIDERS=false
```

This means:

- no paid provider is required today;
- no premium model is required today;
- no multi-tenant architecture is required today;
- no GPU worker is required today;
- no external paid observability/search workflow is required today;
- every unavailable premium capability must return `missing_config`, not fake success.

The production rule remains:

```text
free-first provider -> free/local fallback -> honest missing_config
```

A provider is not considered operational because an environment variable exists. It is operational only when the capability is visible in `/api/system/readiness`, is routed by the backend, and passes a real production scenario.

## P0 providers to use first — zero-budget compatible

| Domain | Primary | Fallback | Railway variables |
| --- | --- | --- | --- |
| LLM / reasoning | Gemini Flash-class | Groq, OpenRouter free models, Hugging Face free quota | `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `HF_TOKEN` |
| Fast chat / realtime | Groq free tier | Gemini Flash, OpenRouter free models | `GROQ_API_KEY` |
| Image generation | Gemini/Hugging Face if already available | Pollinations free fallback | `GEMINI_API_KEY`, `HF_TOKEN` |
| Studio media backbone | FFmpeg | honest error | Nixpacks FFmpeg runtime |
| Voice STT/TTS | Groq/Gemini/HF free-first if configured | clear `missing_config` or local fallback | `GROQ_API_KEY`, `GEMINI_API_KEY`, `HF_TOKEN` |
| Memory / RAG | PostgreSQL + pgvector | keyword/history fallback | `DATABASE_URL` |
| DevOps truth | GitHub + Railway | manual/read-only | `GITHUB_TOKEN`, Railway metadata |

## P1 providers — optional later, not required now

These providers may have free tiers, but they are not required for the current personal validation phase.

| Domain | Provider | Role | Variables |
| --- | --- | --- | --- |
| Web search | Tavily | agentic search/extract/crawl | `TAVILY_API_KEY` |
| Web extraction | Firecrawl | scrape/crawl/browser data layer | `FIRECRAWL_API_KEY` |
| AI observability | Langfuse | traces, prompts, cost, latency | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` |
| Workflow automation | n8n self-host | async execution, webhooks | `N8N_WEBHOOK_URL`, `N8N_API_URL`, `N8N_API_KEY` |

Rule: do not block PASS/WARN assessment of the personal platform because these are absent. They can be added after P0 is stable and only if they remain free or acceptable within the user's budget.

## P2 providers — deferred paid/scale phase

| Domain | Provider | Constraint |
| --- | --- | --- |
| Premium image/video | ComfyUI worker | external GPU worker only; not inside main Railway service |
| Premium media API | Runware / Fal / Replicate | only after budget is chosen |
| AI Gateway | Cloudflare AI Gateway or LiteLLM | useful later when traffic/cost/tracing need central control |
| Durable media | Cloudflare R2 / S3 | needed later when generated media must survive beyond `/tmp` |
| Advanced vector DB | Qdrant | only when pgvector becomes too limited |

These must stay `missing_config` or deferred in `free_personal` mode.

## Operational rules

1. Do not add new features until `/studio` and `/api/system/readiness` are stable in production.
2. Do not merge duplicate Studio/media implementations.
3. Do not run Ollama, ComfyUI, Hunyuan, LTX Video, AnimateDiff or other heavy GPU workloads inside the main Railway service.
4. Do not call a module PASS because the build passed.
5. Do not show a premium success if the premium provider is not configured.
6. Every provider must be represented in the provider registry with status `configured`, `missing_config`, `free_builtin`, or `local_runtime`.
7. The platform verdict is PASS only when core capabilities pass production scenarios.
8. In `free_personal` mode, paid providers and premium media are deferred by design.
9. Multi-tenant mode is forbidden until the personal product is validated and a budget is selected.

## Required production checks

- `GET /api/version` returns the deployed Railway commit SHA.
- `GET /api/system/readiness` returns provider registry and capability readiness.
- `/studio` loads the additive UI in production.
- Studio FFmpeg fallback generates a playable MP4.
- Image generation returns a real image URL or clear error.
- Voice/STT/TTS routes use free-first Groq/Gemini/HF when configured or return clear `missing_config`.
- Memory reports DB and pgvector status without exposing secrets.
- Web research remains WARN/optional until Tavily/Firecrawl are configured.
- Observability remains WARN/optional until Langfuse/AI Gateway is configured.

## Upgrade path after personal validation

Only after the user is satisfied with the personal platform:

```text
free_personal -> paid_controlled -> multi_tenant
```

### paid_controlled requirements

- monthly budget chosen;
- provider spend caps configured;
- premium providers explicitly allowed with `TAMS_ALLOW_PAID_PROVIDERS=true`;
- logs/readiness show exactly which paid capability is being used.

### multi_tenant requirements

- authentication/tenant isolation;
- quotas per tenant;
- billing or internal cost control;
- storage/data retention policy;
- provider abuse protection;
- admin dashboard;
- audit logs.

## Why this order

The current bottleneck is not lack of tools. The bottleneck is operational truth:

```text
GitHub main -> Railway SHA -> readiness endpoint -> real mobile/browser scenario
```

Only after that chain is reliable should TAMS add paid providers, heavier workers, premium media lanes, or multi-tenant functionality.
