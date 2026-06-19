---
name: TAMS Architecture (formerly KORE/GANDAL)
description: Full stack, Vite proxy wiring, auth flow, multi-tenant RBAC, DB migration pattern, kill switches, quotas
---

## Stack
- Frontend: React 19, Vite 7, wouter routing, TanStack Query, shadcn/ui, Tailwind 4
- Backend: Express 5, Drizzle ORM, PostgreSQL (DATABASE_URL)
- AI: Gemini 2.5 Flash, Groq Whisper transcription
- Repo: https://github.com/agenceialyon69/Tams-Plate-forme-.git — push to main

## Vite proxy (kore)
- Dev server proxies `/api` → `http://localhost:8080`
- PORT + BASE_PATH required in dev, SKIPPED in build via `isBuild = process.argv.includes("build")` guard
- `getApiBase()` in kore/src/lib/api.ts returns empty string in dev (proxy), full URL in prod

## Auth flow (v3.0)
- JWT issued on login/register, stored in localStorage key `tams_auth_token`
- `getToken()` migrates from legacy keys: `gandal_auth_token`, `tams_api_token`, `kore_api_token`
- `clearToken()` removes all legacy key variants
- LoginGate tabs: login, register, forgot-password, reset-password
- URL param `?reset=<token>` auto-switches LoginGate to reset tab
- `SESSION_DURATION` env var configures JWT TTL (default "8h")
- Password reset tokens: 1h TTL, single-use, stored in `password_reset_tokens` table
- **IMPORTANT**: `gandal-jwt:` prefix in jwt.ts MUST NOT be renamed — changing it invalidates all existing tokens

## Naming (post-rename)
- Brand name: TAMS everywhere in UI, prompts, docs
- Directory: `artifacts/kore/` kept as-is (technical build path — safe)
- JWT secret derivation prefix: `gandal-jwt:` — intentionally frozen
- DB column: `kore_response` in `evening_reviews` — stays (no migration needed); JS property is `tamsResponse`
- API fields renamed: koreMessage→tamsMessage, koreComment→tamsComment, koreResponse→tamsResponse
- Component names: `GandalMark`, `GandalLogo` kept as internal component names (not visible text)

## Multi-tenant RBAC
- Roles: owner > admin > member > viewer
- Tenant ID extracted from JWT, attached to req by auth middleware
- Per-route RBAC enforced via `requireRole()` helper
- Approval tiers: low→member, medium/high→admin, critical→owner

## DB migration pattern (ensure-schema.ts)
- Runs on API startup using raw pg queries
- Uses `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- DO NOT use `CREATE TYPE IF NOT EXISTS` — INVALID PostgreSQL syntax
- Drizzle schema files use `pgEnum`; ensure-schema uses TEXT equivalents

## Rate limiting (order matters)
- Global: 120 req/min per IP (app.ts)
- Per-tenant: 300/min, Per-user: 100/min (routes/index.ts, before route handlers)
- AI routes: 20/min (ai.ts)

## Kill switches
- Targets: agent | provider | workflow | module
- activate/deactivate tracked with activatedById, timestamps
- Activation logged as WARN in audit trail; admin+ required

## Cost guardrails
- `checkAndIncrementAiCalls(tenantId, db)` exported from routes/quotas.ts
- Import in AI routes to enforce daily + monthly call limits
- Returns `{ allowed: boolean }` — return 429 if not allowed

## API client mutation pattern
- All mutations use `{ data: body }` e.g. `useCreateCapture({ data: { content, source } })`
- Query invalidation uses the `get*QueryKey()` helper functions
- New routes (registry, approvals, kill-switch, profile, quotas, audit) use `apiFetch()` directly

## Morning briefing caching
- `/api/briefings/morning` calls Gemini (4-8s) — cached in-memory per day (1hr TTL)
- Cache: `briefingCache = { date, data, cachedAt }` in briefings.ts module scope

## Red Team philosophy
- Honnête, jamais flatteur, jamais culpabilisant
- No gamification, no streaks, no badges anywhere
- Red Team page runs real tests (injection, auth, CORS, data leaks)

## GitHub push
- Auto-commit happens at end of each agent task (Replit system)
- After auto-commit, push with: `git push "https://${GITHUB_TOKEN}@github.com/agenceialyon69/Tams-Plate-forme-.git" main`
- GITHUB_TOKEN is set as Replit secret
