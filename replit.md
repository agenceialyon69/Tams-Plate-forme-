# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

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
  - `FRONTEND_URL` — comma-separated allowlist of exact browser origins for CORS (e.g. `https://app.example.com,https://kore.vercel.app`). If unset, only same-origin requests are allowed.
  - `GROQ_API_KEY` — enables voice transcription (`/api/ai/transcribe`). The server boots without it; only transcription fails.
  - `GEMINI_API_KEY` — enables LLM extraction/analysis/briefings.
  - Frontend: `VITE_API_URL` — base URL of the API server.

## Security

- All `/api` routes require a valid bearer token except `/api/healthz`. See `src/middlewares/auth.ts`.
- Rate limiting (`src/middlewares/rate-limit.ts`): 120 req/min globally, 20 req/min on LLM endpoints (`/captures`, `/decisions`, `/ai/*`).
- Strict CORS allowlist, security headers (`src/middlewares/security.ts`), explicit body-size caps, and a centralized error handler that returns generic messages.
- LLM output is sanitized/clamped before DB insertion (`src/lib/ai.ts`).
- See `SECURITY_AUDIT.md` for the full red-team audit and remediation log.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
