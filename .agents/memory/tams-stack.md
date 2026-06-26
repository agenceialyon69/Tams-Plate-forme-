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

## Navigation
5 sections: Accueil (`/`), Chat (`/chat`), Travail (`/travail`), Studio (`/studio`), Système (`/systeme`)
Desktop: Sidebar (`artifacts/tams/src/components/navigation.tsx`)
Mobile: BottomNav (same file)

## DB tables
briefings, conversations, messages, tasks, projects, contacts, memories, decisions, assets, activity
All seeded with realistic Mohamed/consulting data.

**Why:** API server uses esbuild CJS bundle — new route files are NOT picked up by HMR. Always restart the API Server workflow after touching `artifacts/api-server/src/`.
