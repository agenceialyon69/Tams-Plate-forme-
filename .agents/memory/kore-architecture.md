---
name: KORE Architecture
description: Key decisions and constraints for the KORE life copilot app (React+Vite frontend, Express 5 backend, PostgreSQL)
---

# KORE Architecture

## Stack
- Frontend: React + Vite, wouter routing, TanStack Query, shadcn/ui, framer-motion, Recharts
- Backend: Express 5, Drizzle ORM, PostgreSQL (Replit DB via DATABASE_URL)
- AI: Gemini 2.5 Flash (via @google/generative-ai), Groq Whisper transcription
- API client: @workspace/api-client-react (generated hooks, customFetch with setBaseUrl)

## Critical wiring detail
- Vite dev server proxies `/api` → `http://localhost:8080` (vite.config.ts server.proxy)
- Without this proxy, the browser gets 504 timeouts on all API calls
- API server port: 8080. Frontend port: 25268 (from PORT env var).

## Morning briefing caching
- `/api/briefings/morning` calls Gemini (4-8 seconds). Must cache in-memory per day (1hr TTL).
- Cache: `briefingCache = { date, data, cachedAt }` in briefings.ts module scope.

## API client mutation pattern
- All mutations use `{ data: body }` e.g. `useCreateCapture({ data: { content, source } })`
- Query invalidation uses the `get*QueryKey()` helper functions

## Priority compass (domain ordering, never change)
health > family > admin > work > projects > productivity

## Red Team philosophy
- KORE never flatters, never guilt-trips. Calm honesty only.
- Overload alerts are visually prominent but tonally calm.
- No gamification, no streaks, no badges, no scores anywhere.

**Why:** Core product identity — any deviation makes KORE just another productivity app.
