# GANDAL — Plateforme IA Gouvernée

Plateforme personnelle d'IA avec mémoire persistante, mode red team intégré, audit trail immuable, observabilité complète et gouvernance.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env:
  - `DATABASE_URL` — Postgres connection string
  - `API_AUTH_TOKEN` — shared secret protecting the API (>= 16 chars). Generate with `openssl rand -hex 32`. The server refuses to start without it. Clients send it as `Authorization: Bearer <token>`.
  - `PORT` — port to listen on
- Optional env:
  - `FRONTEND_URL` — comma-separated allowlist of exact browser origins for CORS
  - `GROQ_API_KEY` — enables voice transcription (`/api/ai/transcribe`)
  - `GEMINI_API_KEY` — enables LLM extraction/analysis/briefings
  - Frontend: `VITE_API_URL` — base URL of the API server

## Security

- All `/api` routes require a valid bearer token except `/api/healthz`. See `src/middlewares/auth.ts`.
- Rate limiting: 120 req/min globally, 20 req/min on LLM endpoints.
- Audit trail: all write operations (POST/PATCH/DELETE) are logged to `audit_logs` table.
- Red Team mode: `/api/red-team/run` executes 9 real security tests.
- See `SECURITY_AUDIT.md` for the full red-team audit and remediation log.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/kore/src/pages/` — all frontend pages
- `artifacts/kore/src/components/` — shared components (CommandPalette, QuickCapture, LoginGate)
- `artifacts/kore/src/lib/api.ts` — direct apiFetch for new endpoints not in OpenAPI spec
- `artifacts/api-server/src/routes/` — all API routes
- `artifacts/api-server/src/middlewares/audit.ts` — auto-audit middleware for all writes
- `lib/db/src/schema/` — Drizzle schema (includes audit_logs)

## New Pages (v2.0)

- `/audit` — Audit trail viewer (all write operations, exportable)
- `/red-team` — Security test runner (9 tests: injection, auth, CORS, data leaks, headers)
- `/diagnostics` — System health dashboard (DB, AI providers, memory, uptime, PWA status)
- ⌘K — Command palette (navigation + actions rapides)
- ⌘J — Quick capture (moved from ⌘K)

## Architecture decisions

- New API endpoints (audit, diagnostics, export, red-team) bypass OpenAPI codegen — direct fetch via `apiFetch()` in `artifacts/kore/src/lib/api.ts`
- Audit middleware is async/non-blocking — never delays API responses
- Red Team tests run inside the same process (uses `fetch` to localhost) — no external dependencies
- AI provider preferences stored in localStorage (`gandal_ai_prefs`) — backend still uses GEMINI_API_KEY env var

## Product

- Mémoire persistante structurée avec tags, domaines, recherche
- Dashboard d'état général avec alertes surcharge
- Journal d'audit immuable de toutes les actions
- Mode Red Team : 9 tests de sécurité réels (injection, auth bypass, CORS, fuites de données)
- Diagnostics système en temps réel
- Command palette globale (⌘K) pour navigation rapide
- Export complet des données en JSON
- Sélecteur de provider IA (Gemini / Ollama / désactivé)

## User preferences

- Langage : Français
- Philosophie : Red Team — honnête, jamais flatteur, jamais culpabilisant
- Pas de gamification, pas de streaks, pas de badges

## Gotchas

- `git commit` and `git push` are managed by Replit's auto-commit system
- To push to GitHub: configure GITHUB_TOKEN secret and run `git push origin main` from terminal, or use the Replit Git panel
- Railway auto-deploys from `main` branch (configured in `railway.toml`)
- New routes use `apiFetch` directly — if you add them to OpenAPI spec, remove the direct calls

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
