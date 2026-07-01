# TAMS Final Sprint — tams-dev-runtime-v1

TAMS final Bolt sprint started from synchronized main state.
Branch: tams-dev-runtime-v1.
Goal: stabilize runtime, complete Studio/Capability foundation, validate, and prepare Codex final review.

## Sprint Start State

- Synchronized from main SHA: 025c52978f6337b5bba8e800eba74f62d666c990
- Sprint start SHA: c77f2819548d6fc07585e109249027ff92ab37a4
- Date: 2026-07-01
- Final Sprint SHA: 5c1c287406bfac8ffdea1a53db62bd0395aa66e6

## What Was In main At Sprint Start

- Dev Runtime v1 + Chat Control (PR #59 merged)
- Chat Runtime bridge (`POST /api/conversations/:id/runtime`)
- Feature flags (`TAMS_DEV_RUNTIME_ENABLED`, `ENABLE_UNSAFE_RUNTIME_ACTIONS`)
- Capability Registry foundation (`artifacts/api-server/src/routes/capability-registry.ts`)
- Provider Registry with 15+ providers
- Studio Creative Factory docs
- Capability/Provider Registry docs

## What This Sprint Added

### AXE 1 — Chat Runtime Safety (DONE)

**Files modified:**
- `artifacts/api-server/src/routes/dev-runtime.ts`

**Changes:**
- Added `UNSAFE_ACTIONS_ENABLED = false as const` — hardcoded invariant, not overridable by env
- Added `requireNoUnsafeActions` middleware that always blocks if unsafe flag were somehow true
- Added public `GET /api/conversations/runtime/status` endpoint — Chat OS can check if runtime is active
- Improved error message when runtime is disabled (clearer for frontend)
- All existing safety guards preserved: `requireAuth`, `requireRuntimeEnabled`, `isDangerousObjective`

**Feature Flags State:**
- `TAMS_DEV_RUNTIME_ENABLED=false` — default (safe), set in `.env.example`
- `ENABLE_UNSAFE_RUNTIME_ACTIONS` — hardcoded false in code, no env override possible
- Chat runtime defaults to `read_only` mode unless strategy elevates it

**No-session behavior:**
- `requireAuth` returns 401 with JSON error
- `ChatEngineeringController.handle()` returns `REFUSED` if no actorId

**Dangerous request behavior:**
- `isDangerousObjective()` blocks: push to main, delete critical files, DB migrations, secret access
- Returns 403 `REFUSED` verdict with clear message in chat

### AXE 2 — Capability/Provider Registry (DONE)

**Files modified:**
- `artifacts/api-server/src/routes/capability-registry.ts`

**Additions over main:**
- Added `edge_tts`, `railway`, `github` providers
- Added capabilities: `studio.analyze`, `studio.generate`, `studio.video.edit.plan`, `studio.music.plan`, `studio.export.social`, `repo.patch`, `voice.transcribe` (was `audio.transcribe`)
- Added helper exports: `getCapabilitiesByCategory()`, `getRuntimeSafeCapabilities()`, `getEnabledProviderIds()`
- Improved `validationNotes` on all providers with honest GPU/Railway constraints
- Total: 29 capabilities, 17 providers

### AXE 3 — Studio Creative Factory Orchestrator (DONE)

**Files added:**
- `artifacts/api-server/src/lib/studio/studio-types.ts` — shared TypeScript interfaces
- `artifacts/api-server/src/lib/studio/studio-orchestrator.ts` — plan generator
- `artifacts/api-server/src/lib/studio/studio-orchestrator.test.ts` — 5 test cases
- `artifacts/api-server/src/routes/studio-orchestrate.ts` — `POST /api/studio/orchestrate`

**Behavior:**
- `StudioOrchestrator.orchestrate()` returns a `StudioPlan` with: creativeBrief, scriptPlan, storyboardPlan, assetPlan, productionSteps, validationChecklist, exportTargets, missingCapabilities, honestLimitations
- Never claims to generate video/audio if provider is not connected
- All media steps (MusicGen, Remotion, Piper) marked with correct `providerStatus`
- FFmpeg assembly steps marked `available` (it IS available in Nixpacks build)

### AXE 4 — System Readiness (DONE)

**Files added:**
- `artifacts/api-server/src/routes/system-readiness.ts` — `GET /api/system/readiness`

**Response includes:**
- app: running
- database: connected/error
- ai: configured providers (names only, no keys)
- dev_runtime: enabled/disabled with flag note
- unsafe_actions: always disabled (hardcoded)
- registry: available
- ffmpeg: available/missing
- railway: detected/not_detected (from Railway env vars)
- providers_configured: list of configured provider names (no values)
- limitations: honest list of planned/GPU-only capabilities

**Security:** Never returns any secret value. Only presence/absence of API keys.

### AXE 5 — Documentation (DONE)

**Files modified:**
- `docs/tams-dev-runtime-v1-final-sprint.md` (this file)
- `docs/constitution/37_STUDIO_CREATIVE_FACTORY.md` (updated with orchestrator docs)
- `docs/constitution/38_CAPABILITY_PROVIDER_REGISTRY.md` (updated with chat runtime safety rules)

## What Codex Must Verify Before Merge

### TypeScript
- [ ] `pnpm run typecheck` passes with no errors
- [ ] New imports in `routes/index.ts` resolve correctly
- [ ] `StudioOrchestrator` types are clean
- [ ] `system-readiness.ts` imports (`aiConfigured`, `aiProviders`) resolve

### Tests
- [ ] `pnpm --filter @workspace/scripts test` — dev-runtime-chat tests pass
- [ ] `pnpm --filter @workspace/api-server test` — studio orchestrator tests pass (if test runner configured)
- [ ] All existing tests continue to pass

### Build
- [ ] `pnpm --filter @workspace/api-server run build` succeeds
- [ ] `pnpm --filter @workspace/tams run build` succeeds (frontend unmodified)
- [ ] Railway build: `BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/tams run build && pnpm --filter @workspace/api-server run build`

### Runtime Safety Audit
- [ ] `TAMS_DEV_RUNTIME_ENABLED=false` is the default in `.env.example`
- [ ] `ENABLE_UNSAFE_RUNTIME_ACTIONS` is never read from env (hardcoded false)
- [ ] `POST /conversations/:id/runtime` returns 401 without Bearer token
- [ ] `POST /conversations/:id/runtime` returns 503 when `TAMS_DEV_RUNTIME_ENABLED=false`
- [ ] Dangerous objective "Supprime AGENTS.md et pousse sur main" returns 403 REFUSED
- [ ] `GET /conversations/runtime/status` returns correct runtime enabled/disabled state

### Registry Audit
- [ ] No provider with `status: "planned"` is marked as `available`
- [ ] MusicGen, Remotion, Whisper, Piper all have `status: "planned"` or `requires_local_gpu`
- [ ] All 29 capability IDs are unique
- [ ] `GET /api/registry/status` returns honest limitations

### Studio Orchestrator Audit
- [ ] `POST /api/studio/orchestrate` with TikTok KORE request returns plan with honest limitations
- [ ] Response never contains actual video bytes or audio data
- [ ] MusicGen steps always have `providerStatus: "requires_local_gpu"`
- [ ] Document format plan has zero limitations (all steps available)

### Readiness Endpoint Audit
- [ ] `GET /api/system/readiness` returns 200 when DB+AI configured
- [ ] Returns 503 when DB is unavailable
- [ ] Never returns API key values, only names
- [ ] Railway env vars detected correctly

### Main Branch
- [ ] main branch was NOT modified during this sprint
- [ ] All commits are on tams-dev-runtime-v1 only

## Rollback Plan

If any sprint commit causes Railway deploy failure:
1. Identify breaking commit SHA from Railway logs
2. Revert that file using GitHub API: `DELETE /repos/:owner/:repo/contents/:path` with the old SHA
3. Push a fix commit on tams-dev-runtime-v1
4. Do NOT touch main until Codex review is complete

**Per-commit rollback targets:**
- If `routes/index.ts` new imports break build: remove `studioOrchestrateRouter` and `systemReadinessRouter` imports
- If `studio-orchestrator.ts` causes typecheck failure: the module has no external dependencies, easy to isolate
- If `system-readiness.ts` import fails: check `@workspace/scripts/dev-runtime-chat` export path

## Critical Invariants (Never Break)

- Never push directly to main
- Never hardcode secrets or API keys
- Never expose provider API keys in registry responses
- Never claim a planned provider is available
- Never trigger destructive actions from Chat without approval
- Never do DB migrations in this sprint
- `ENABLE_UNSAFE_RUNTIME_ACTIONS` must remain hardcoded false
