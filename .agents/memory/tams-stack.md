---
name: TAMS stack
description: Architecture decisions and sharp edges for the TAMS AI OS project
---

## Stack
- API server: Express 5, Drizzle ORM, PostgreSQL, port 8080, mounted at `/api`
- Frontend: React + Vite + Wouter, port 24695, previewPath `/`
- AI: OpenAI client via `process.env.AI_GATEWAY_URL` + `process.env.REPLIT_AI_API_KEY`, model `google/gemini-2.5-flash`
- Codegen: `pnpm --filter @workspace/api-spec run codegen` → hooks in `lib/api-client-react/src/generated/`

## Key rules
- API server must be **restarted** after adding new routes (esbuild bundle, not hot-reload)
- Run `pnpm run typecheck:libs` after any `lib/db` schema change before leaf artifact typechecks
- Hook pattern: `useXxx()` returns `T` directly; mutations: `mutate({ data: payload })` or `mutate({ id, data: payload })`
- `SESSION_SECRET` env secret exists
- `VITE_API_URL` env var needed for frontend dev (empty = same origin in prod)

## Navigation
5 sections: Accueil (`/`), Chat (`/chat`), Travail (`/travail`), Studio (`/studio`), Système (`/systeme`)
Desktop: Sidebar (`artifacts/tams/src/components/navigation.tsx`)
Mobile: BottomNav (same file) — paddingBottom uses `env(safe-area-inset-bottom)`
App root: `height: 100dvh` (not `h-screen`) for iOS keyboard correctness

## DB tables
briefings, conversations, messages, tasks, projects, contacts, memories, decisions, assets, activity
Table `memory_edges` defined in schema but **NOT yet pushed to Railway DB** — run `pnpm --filter @workspace/db run push` on Railway.

## Middlewares (active since 2026-06-26)
- `middlewares/rate-limit.ts`: aiRateLimit (20 req/min) on /api/chat + /api/briefing; defaultRateLimit (120 req/min) on all /api
- `middlewares/error-handler.ts`: centralized Express error handler (hides stack traces in prod)

## Chat streaming
- Backend: `POST /api/conversations/:id/stream` → SSE events: `{type:user_id}`, `{type:token}`, `{type:tool}`, `{type:done}`
- Frontend: `chat.tsx` uses `fetch()` + `ReadableStream` — no useSendMessage hook

## Constitution
`docs/constitution/` contains 30 numbered files (00_READ_FIRST.md → 30_FINAL_ACCEPTANCE.md).
Legacy unnumbered docs removed 2026-06-26.

## Last session SHA
`3d288dff103362ff7eb2e9bbbf510bf50606626e` — feat(travail): Kanban view

## Priority blockers
1. Push `memory_edges` schema to Railway DB (manual Railway step)
2. CI workflow `.github/workflows/ci.yml` needs GitHub Actions enabled in repo settings
