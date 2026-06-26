# TAMS — Architecture

> État réel du dépôt au commit efb038ac (2026-06-26).

## Stack

- **Monorepo** : pnpm workspaces, Node.js 22, TypeScript 5.9
- **Frontend** : React 19 + Vite 7 + Wouter + Tailwind 4 + shadcn/ui (Radix)
- **Backend** : Express 5 + Drizzle ORM + PostgreSQL
- **AI** : OpenAI SDK, model `google/gemini-2.5-flash`, via `AI_GATEWAY_URL` + `REPLIT_AI_API_KEY`
- **Codegen** : Orval (OpenAPI → React Query hooks + Zod schemas)
- **Build** : esbuild (backend CJS bundle), Vite (frontend)
- **Déploiement** : Railway + Nixpacks

## Structure du monorepo

```
artifacts/
  api-server/    — @workspace/api-server (Express backend, port 8080)
  tams/          — @workspace/tams (React SPA frontend, port 24695 dev)
  mockup-sandbox/ — Replit component preview
lib/
  api-client-react/ — React Query hooks générés
  api-spec/          — openapi.yaml (source du codegen)
  api-zod/           — schemas Zod générés
  db/                — Drizzle ORM schema + config
scripts/           — github-push, post-merge
```

## Navigation frontend

5 sections : Accueil (`/`), Chat (`/chat`), Travail (`/travail`), Studio (`/studio`), Système (`/systeme`).
Desktop : Sidebar. Mobile : BottomNav. (`artifacts/tams/src/components/navigation.tsx`)

## Tables DB (10)

briefings, conversations, messages, tasks, projects, contacts, memories, decisions, assets, activity.

Voir `lib/db/src/schema/` pour le détail des colonnes.

## API

Montée sur `/api`. 12 routeurs. Voir `lib/api-spec/openapi.yaml` pour le contrat complet.

## Points d'attention

- `tasks.project_id` n'a pas de FK constraint (soft reference).
- `memories.related_ids` est jsonb plat (pas de edges typées).
- Pas de table users, pas d'auth (single-user hardcoded).
- `middlewares/` vide.
- Pas de migrations Drizzle commitées (schema en code uniquement).
- Le serveur API utilise un bundle esbuild — pas de HMR sur les routes. Redémarrage requis après ajout de routes.
- `SESSION_SECRET` déclaré mais non utilisé.
