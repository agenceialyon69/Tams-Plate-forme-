# GANDAL — Plateforme d'Intelligence Commerciale IA Gouvernée

Plateforme multi-tenant d'IA avec gouvernance complète : registre d'agents, workflow d'approbation 4 niveaux, kill switches d'urgence, quotas IA par tenant, audit immuable, profils, reset de mot de passe, red team intégré.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/kore run dev` — run the frontend (port from env PORT)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-server run build` — build API (esbuild → dist/)
- `pnpm --filter @workspace/kore run build` — build frontend (vite → dist/public/)
- Required env:
  - `DATABASE_URL` — Postgres connection string
  - `JWT_SECRET` — secret for JWT signing (>= 32 chars)
  - `PORT` — port (api-server: 8080, kore: assigned by Replit)
  - `BASE_PATH` — Vite base path (kore only, dev only)
- Optional env:
  - `SESSION_DURATION` — JWT duration (default "8h", e.g. "24h", "7d")
  - `FRONTEND_URL` — comma-separated CORS origins allowlist
  - `GROQ_API_KEY` — voice transcription (`/api/ai/transcribe`)
  - `GEMINI_API_KEY` — LLM extraction/analysis/briefings

## Security

- All `/api` routes require JWT bearer token except `/api/auth/login`, `/api/auth/register`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/healthz`
- Rate limiting: 120 req/min globally (IP), 300/min per tenant, 100/min per user, 20/min on AI routes
- Audit trail: all write operations (POST/PATCH/DELETE) logged to `audit_logs` with userId + tenantId
- Multi-tenant RBAC: owner > admin > member > viewer enforced per-route
- Red Team mode: `/api/red-team/run` executes 9 real security tests

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + JWT auth + RBAC
- DB: PostgreSQL + Drizzle ORM + ensure-schema (auto-migrate on boot)
- Validation: Zod, drizzle-zod
- Frontend: React 19, Vite 7, Tailwind 4, Shadcn/ui, TanStack Query, Wouter

## API Routes (v3.0)

### Auth
- `POST /api/auth/login` — login, returns JWT
- `POST /api/auth/register` — create account + tenant
- `POST /api/auth/forgot-password` — request password reset token
- `POST /api/auth/reset-password` — reset password with token
- `GET/PATCH /api/auth/me` — current user profile

### Profile
- `GET /api/profile` — get own profile
- `PATCH /api/profile` — update name/language preferences
- `POST /api/profile/change-password` — change password (requires current)

### Registry (tenant-scoped)
- `GET /api/registry` — list all agents for tenant
- `POST /api/registry` — create agent (member+)
- `GET /api/registry/:id` — get agent detail
- `PATCH /api/registry/:id` — update agent (admin+)
- `DELETE /api/registry/:id` — delete agent (admin+)

### Approvals (4-tier risk: low/medium/high/critical)
- `GET /api/approvals` — list requests
- `POST /api/approvals` — create approval request (auto-assigns reviewer tier)
- `GET /api/approvals/:id` — get request detail
- `POST /api/approvals/:id/review` — approve/reject (tier-enforced RBAC)

### Kill Switches (admin+)
- `GET /api/kill-switches` — list all kill switches
- `POST /api/kill-switches` — create (targets: agent/provider/workflow/module)
- `POST /api/kill-switches/:id/activate` — emergency stop
- `POST /api/kill-switches/:id/deactivate` — restore

### Quotas
- `GET /api/quotas` — tenant AI usage & budget
- `PATCH /api/quotas` — update limits (admin+)

### Existing routes
- `/api/captures`, `/api/tasks`, `/api/memory`, `/api/briefings`, `/api/leads`, `/api/decisions`, `/api/recordings`, `/api/learnings`, `/api/events`, `/api/diagnostics`, `/api/red-team`, `/api/audit`, `/api/export`, `/api/ai`, `/api/users`, `/api/overload`

## Frontend Pages

- `/` — Dashboard (overview, captures, tasks)
- `/registry` — Registre des agents IA (CRUD complet + filtres)
- `/approvals` — Workflow d'approbation (4 niveaux de risque)
- `/observability` — Observabilité (quotas IA, kill switches, audit live)
- `/profile` — Profil utilisateur + changement de mot de passe
- `/audit` — Journal d'audit complet
- `/red-team` — Tests de sécurité red team
- `/diagnostics` — Santé système

## DB Schema (ensure-schema — auto-migrate on boot)

Tables: `tenants`, `users`, `sessions`, `captures`, `tasks`, `memory_entries`, `briefings`, `leads`, `decisions`, `recordings`, `learnings`, `events`, `audit_logs` (+ userId, tenantId), `password_reset_tokens`, `registry_entries`, `approval_requests`, `kill_switches`, `tenant_quotas`

## Architecture decisions

- `ensure-schema.ts` runs on API startup — uses IF NOT EXISTS + ADD COLUMN IF NOT EXISTS → safe for prod
- New routes bypass OpenAPI codegen — direct `apiFetch()` in kore/src/lib/api.ts
- Audit middleware is async/non-blocking — never delays API responses
- `checkAndIncrementAiCalls()` exported from quotas.ts — import in AI routes to enforce cost guardrails
- Approval RBAC: low→member, medium/high→admin, critical→owner (enforced server-side)
- Kill switch activation logged as WARN level in audit trail
- Password reset tokens: 1h TTL, single-use, stored hashed in DB
- Vite build (kore): PORT/BASE_PATH required in dev, optional in build (isBuild guard)

## User preferences

- Langage : Français
- Philosophie : Red Team — honnête, jamais flatteur, jamais culpabilisant
- Pas de gamification, pas de streaks, pas de badges
- **RÈGLE ABSOLUE** : Ne jamais ajouter de fonctionnalité payante, nécessitant un abonnement, des crédits ou une carte bancaire. Tout doit rester 100% gratuit et auto-hébergeable. Les IA payantes (OpenAI, Anthropic…) restent optionnelles. Priorité : Ollama, DeepSeek, Qwen, Llama, Whisper, FFmpeg, PostgreSQL.

## Gotchas

- `git commit` is managed by Replit's auto-commit system at end of each agent task
- To push to GitHub after auto-commit: `git push "https://${GITHUB_TOKEN}@github.com/agenceialyon69/Tams-Plate-forme-.git" main`
- Kore vite.config.ts: PORT required in dev, skipped in build (isBuild check on process.argv)
- `CREATE TYPE IF NOT EXISTS` is invalid PostgreSQL — use TEXT columns in ensure-schema, Drizzle pgEnum in schema files
- Rate limit order matters: global IP limiter in app.ts, per-tenant + per-user in routes/index.ts before route handlers
