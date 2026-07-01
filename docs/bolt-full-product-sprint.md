# TAMS Full Product Sprint

Branch: tams-dev-runtime-v1

TAMS full product sprint started.
Branch: tams-dev-runtime-v1.
Goal: build maximum useful platform foundations before Codex final correction/integration/deployment.
Main branch must not be modified.

## Sprint Start State

- Branch: `tams-dev-runtime-v1` (HEAD: a4c47b5)
- Backend: Express + TypeScript + Drizzle + Supabase
- Frontend: React + Wouter + TanStack Query
- Kernel: `lib/kernel/index.ts` — full intent engine, mission generator, execution graph
- Capability Registry: 29 capabilities, 17 providers (free-first)
- Studio Orchestrator: plan-only, no fake media
- System Readiness: `GET /api/system/readiness`
- Dev Runtime: hardened with UNSAFE_ACTIONS_ENABLED=false

## Sprint Axes

### Phase 0 — Checkpoint
- [x] Sprint doc created

### Axe 1 — Chat OS Central
- [ ] `GET /api/chat/capabilities` route
- [ ] "TAMS can do" panel in chat.tsx
- [ ] Mode-aware quick actions

### Axe 2 — Kernel IA
- [ ] `POST /api/kernel/route-intent` endpoint
- [ ] `kernel-types.ts` separate file
- [ ] `intent-engine.ts` module
- [ ] `mission-generator.ts` module
- [ ] `permission-layer.ts` module
- [ ] `capability-router.ts` module

## Codex Pre-Merge Checklist

1. `pnpm run typecheck` passes
2. `pnpm --filter @workspace/api-server run build` succeeds
3. `pnpm --filter @workspace/scripts test` (4 existing dev-runtime-chat tests)
4. `pnpm --filter @workspace/api-server test` (5 new studio orchestrator tests)
5. Smoke: `GET /api/registry/status`, `GET /api/system/readiness`, `POST /api/studio/orchestrate`, `POST /api/kernel/route-intent`
6. Confirm `POST /conversations/:id/runtime` returns 401 without token, 503 when flag disabled
7. Confirm main branch was NOT modified
