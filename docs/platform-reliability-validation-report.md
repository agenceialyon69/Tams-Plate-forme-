# TAMS — Platform Reliability Validation Report

## Scope

- Repository: `agenceialyon69/Tams-Plate-forme-`
- Branch: `fix/chat-video-reliability`
- Base: `main`
- Constraint: targeted reliability hotfix only; no redesign and no merge to `main`.

## Root cause

The disappearing Chat turn came from transient-only rendering in `artifacts/tams/src/pages/chat.tsx`:

1. The user message lived only in `pendingUser`.
2. The assistant video result lived only in `streamingContent`.
3. The unconditional `finally` cleared `pendingUser` and disabled streaming.
4. The streaming bubble was rendered only while `isStreaming` was true.
5. A server refetch returning an empty history could therefore replace the UI with an empty conversation.

This was a frontend durability bug. Provider, database, JSON, HTTP and timeout failures exposed it, but they were not required to cause message loss.

## Files changed

- `artifacts/tams/src/pages/chat.tsx`
  - durable local user and assistant messages;
  - local/server history reconciliation without allowing an empty refetch to erase local turns;
  - 45-second abort timeout;
  - complete handling for fetch errors, non-2xx responses, invalid JSON, empty streams and aborts;
  - durable success responses for Studio, Development Runtime and SSE;
  - deterministic TikTok video fallback with hook, script, shot list, captions, CTA and an honest no-file limitation.
- `tests/e2e/tams-core.spec.ts`
  - browser regression test with Kernel and stream failures mocked;
  - asserts the exact user request remains visible;
  - asserts a structured assistant fallback appears;
  - asserts no uncaught React page error.
- `.github/workflows/ci.yml`
  - invariants protecting local message durability and empty-response handling.
- `docs/platform-reliability-validation-report.md`
  - this validation record.

## Validation matrix

| Validation | Status | Evidence |
|---|---:|---|
| User message survives API failure | PASS by implementation + E2E assertion added | Local user turn is appended before the first fetch and never cleared in `finally`. |
| Assistant error is visible | PASS by implementation + E2E assertion added | All caught failures append a durable assistant fallback. |
| Empty server refetch cannot erase local history | PASS by implementation | `displayedMessages` reconciles server data with unresolved local messages. |
| Fetch / JSON / timeout / non-200 / empty response handling | PASS by implementation | Global catch, explicit HTTP checks, JSON failures routed to catch, 45 s abort, empty SSE rejection. |
| TikTok video plan | PASS by implementation | Hook, script, shot list, captions and CTA are returned on backend failure. |
| Honest video limitation | PASS by implementation | Explicitly says real generation is not connected and no video file was generated. |
| Chat → Kernel → Studio routing | PASS by source audit | `/api/kernel/route-intent` routes video intent to `/api/studio/orchestrate`; failure falls back safely. |
| Studio route mounted and JSON response | PASS by source audit | `studioOrchestrateRouter` is mounted and returns a structured JSON plan. |
| Capability Action Bus mounted | PASS by source audit | Action routers are mounted in `routes/index.ts`. |
| Dev Agent / CI Operator / VIS routes preserved | PASS by source audit | Existing route mounts and CI smoke assertions were not modified or removed. |
| Typecheck | PENDING CI |
| Frontend production build | PENDING CI |
| API production build | PENDING CI |
| Runtime unit tests | PENDING CI |
| Runtime scenario | PENDING CI |
| Mission 2 scenarios | PENDING CI |
| API smoke tests | PENDING CI |
| Playwright E2E execution | NOT YET VALIDATED; regression test added, browser workflow requires explicit dispatch |

## Product state

### Chat

The active user turn is now optimistic and durable. It is reconciled with server history only after an equivalent persisted message appears. Errors produce a readable assistant message instead of an empty conversation.

### TikTok video request

When Studio succeeds, Chat shows the generated production plan and keeps it visible. If Kernel, Studio, the conversation backend, a provider or the network fails, Chat returns a deterministic production-ready fallback containing the requested creative sections and an honest limitation.

### Studio

The orchestrator endpoint remains mounted at `POST /api/studio/orchestrate` and returns JSON. No Studio page refactor was made.

### Capabilities

The capability registry and Action Bus routes remain mounted. No capability execution semantics were broadened.

### Dev Agent and VIS

The Dev Agent core, validation, CI operator, scheduler, workflows, and `/api/system/validate` route mounts remain present. The hotfix does not alter their permissions or execution paths.

## Remaining risks

- Durable fallback messages are in browser memory until the backend persists an equivalent turn; a full page reload during a backend/database outage cannot restore unsaved local messages.
- The real video file generator is still unavailable unless an external provider is configured and connected.
- The Playwright test must be executed through the sandbox workflow or another environment with Chromium before browser validation can be marked PASS.
- Production auth and provider credentials are environment-dependent and are not exposed or inferred by this report.
