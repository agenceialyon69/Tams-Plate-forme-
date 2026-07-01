# TAMS Final Sprint — tams-dev-runtime-v1

TAMS final Bolt sprint started from synchronized main state.
Branch: tams-dev-runtime-v1.
Goal: stabilize runtime, complete Studio/Capability foundation, validate, and prepare Codex final review.

## Sprint Start State

- Synchronized from main SHA: 025c52978f6337b5bba8e800eba74f62d666c990
- Sprint start SHA: c77f2819548d6fc07585e109249027ff92ab37a4
- Date: 2026-07-01

## What Was In main At Sprint Start

- Dev Runtime v1 + Chat Control (PR #59 merged)
- Chat Runtime bridge (`POST /api/conversations/:id/runtime`)
- Feature flags (`TAMS_DEV_RUNTIME_ENABLED`, `ENABLE_UNSAFE_RUNTIME_ACTIONS`)
- Capability Registry foundation (`artifacts/api-server/src/routes/capability-registry.ts`)
- Provider Registry with 15+ providers
- Studio Creative Factory docs
- Capability/Provider Registry docs

## Sprint Goals

1. [AXE 1] Harden Chat Runtime safety — feature flags, no-session response, dangerous request refusal
2. [AXE 2] Strengthen Capability/Provider Registry — add missing capabilities, helpers, honest status
3. [AXE 3] Studio Creative Factory Orchestrator — structured plan generation
4. [AXE 4] System readiness endpoint — Railway-safe `/api/system/readiness`
5. [AXE 5] Documentation update for Codex handoff
6. [AXE 6] Final validation and push

## What Codex Must Verify Before Merge

- [ ] `TAMS_DEV_RUNTIME_ENABLED=false` is the safe default in all environments
- [ ] `ENABLE_UNSAFE_RUNTIME_ACTIONS=false` is enforced server-side
- [ ] Chat runtime only allows `read_only` mode unless explicitly enabled
- [ ] No provider marked `available` without proven config
- [ ] Studio Orchestrator only returns plans — never fake media
- [ ] `/api/system/readiness` exposes no secrets
- [ ] Railway build still passes with new files
- [ ] TypeScript types are clean (`pnpm typecheck`)

## Rollback Plan

If any sprint commit causes Railway deploy failure:
1. Identify the breaking commit SHA from Railway logs
2. Revert that specific file using GitHub API
3. Push fix commit on tams-dev-runtime-v1
4. Do NOT touch main until Codex review is complete

## Critical Invariants (Never Break)

- Never push directly to main
- Never hardcode secrets or API keys
- Never expose provider API keys in registry responses
- Never claim a planned provider is available
- Never trigger destructive actions from Chat without approval
- Never do DB migrations in this sprint
