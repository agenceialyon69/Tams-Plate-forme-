---
name: KORE Architecture
description: Key decisions and constraints for the GANDAL/KORE life copilot app (React+Vite frontend, Express 5 backend, PostgreSQL)
---

# GANDAL / KORE Architecture

## Stack
- Frontend: React + Vite, wouter routing, TanStack Query, shadcn/ui, framer-motion, Recharts
- Backend: Express 5, Drizzle ORM, PostgreSQL (Replit DB via DATABASE_URL)
- AI: Gemini 2.5 Flash (via @google/generative-ai), Groq Whisper transcription
- API client: @workspace/api-client-react (generated hooks, customFetch with setBaseUrl)

## Critical wiring detail
- Vite dev server proxies `/api` → `http://localhost:8080` (vite.config.ts server.proxy)
- Without this proxy, the browser gets 504 timeouts on all API calls
- API server port: 8080. Frontend port: 25268 (from PORT env var).
- Frontend uses `@/lib/api.ts` for new endpoints not in the OpenAPI spec (direct apiFetch)

## Morning briefing caching
- `/api/briefings/morning` calls Gemini (4-8 seconds). Must cache in-memory per day (1hr TTL).
- Cache: `briefingCache = { date, data, cachedAt }` in briefings.ts module scope.

## API client mutation pattern
- All mutations use `{ data: body }` e.g. `useCreateCapture({ data: { content, source } })`
- Query invalidation uses the `get*QueryKey()` helper functions
- New routes (audit, diagnostics, export, red-team) use `apiFetch()` directly from `artifacts/kore/src/lib/api.ts`

## Priority compass (domain ordering, never change)
health > family > admin > work > projects > productivity

## Red Team philosophy
- GANDAL/KORE never flatters, never guilt-trips. Calm honesty only.
- Overload alerts are visually prominent but tonally calm.
- No gamification, no streaks, no badges, no scores anywhere.
- Red Team page runs real security tests (injection, auth, CORS, data leaks) — not just labels.

**Why:** Core product identity — any deviation makes GANDAL just another productivity app.

## New features added (v2.0)
- `audit_logs` DB table — tracks all write operations (POST/PATCH/DELETE) automatically
- Audit middleware (`artifacts/api-server/src/middlewares/audit.ts`) — non-blocking async log
- `/api/audit` — query audit log with resource/date filters
- `/api/diagnostics` — system health check (DB, AI providers, memory, uptime)
- `/api/export` — full data export as JSON
- `/api/red-team/run` — POST to run 9 security tests (injection, auth, CORS, headers, sensitive data)
- Frontend pages: `/audit`, `/red-team`, `/diagnostics`
- `CommandPalette` component — triggered by ⌘K (global navigation + actions)
- `QuickCapture` now triggered by ⌘J (moved from ⌘K)
- Settings page enhanced with AI provider selector (Gemini/Ollama/disabled) + export button
- AI provider prefs stored in localStorage under key `gandal_ai_prefs`

## GitHub remote
- Remote: `https://github.com/agenceialyon69/Tams-Plate-forme-`
- Branch: `main`
- Railway auto-deploys from main (railway.toml configured)
- No GITHUB_TOKEN configured in Replit secrets — push must be done manually or via token
