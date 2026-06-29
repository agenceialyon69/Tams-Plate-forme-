# 08 — Architecture

> État réel du dépôt — branche main.

## Stack

| Layer | Technologie |
|---|---|
| Monorepo | pnpm workspaces, Node.js 22, TypeScript 5.9 |
| Frontend | React 19 + Vite 7 + Wouter + Tailwind 4 + shadcn/ui |
| Backend | Express 5 + Drizzle ORM + PostgreSQL |
| AI | OpenAI SDK, model `google/gemini-2.5-flash` via `AI_GATEWAY_URL` |
| Codegen | Orval (OpenAPI → React Query hooks + Zod schemas) |
| Build | esbuild (backend), Vite (frontend) |
| Déploiement | Railway + Nixpacks + Supabase PostgreSQL |

## Structure monorepo

```
artifacts/
  api-server/    — @workspace/api-server (Express, port 8080)
  tams/          — @workspace/tams (React SPA, port 24695 dev)
  mockup-sandbox/ — Replit component preview
lib/
  api-client-react/ — React Query hooks générés par Orval
  api-spec/          — openapi.yaml (source du codegen)
  api-zod/           — schemas Zod générés
  db/                — Drizzle ORM schema + config
scripts/           — github-push, post-merge
```

## Navigation frontend

5 sections : Accueil (`/`), Chat (`/chat`), Travail (`/travail`), Studio (`/studio`), Système (`/systeme`).

Desktop : Sidebar. Mobile : BottomNav. (`artifacts/tams/src/components/navigation.tsx`)

## Tables DB

13 tables : `briefings`, `conversations`, `messages`, `tasks`, `projects`, `contacts`, `memories`, `memory_edges`, `decisions`, `assets`, `activity`, `project_contacts`.

Toutes les tables sont déployées sur Supabase PostgreSQL.

## API

Montée sur `/api`. 12+ routeurs. Voir `lib/api-spec/openapi.yaml` pour le contrat complet.

## Points de vigilance

- `tasks.project_id` : soft reference, pas de FK constraint.
- `memories.related_ids` : jsonb legacy (remplacé par `memory_edges`).
- Pas de table `users`, pas d'auth (single-user hardcoded).
- Pas de migrations Drizzle commitées (schéma en code uniquement).
- Helmet.js installé et configuré (commit `96fb610`).
- CORS restrictif en production via `ALLOWED_ORIGINS`.
- Rate limiting étendu à 5 endpoints IA.
