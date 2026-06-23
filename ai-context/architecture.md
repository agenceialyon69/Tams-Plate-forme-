# Architecture

## Stack auto-hébergeable (free-first — ADR-013)
Le système doit rester pleinement fonctionnel avec **uniquement** des briques
libres et auto-hébergeables. Les services cloud sont des accélérateurs optionnels.
| Besoin | Brique libre (cible) | État |
|---|---|---|
| Base de données | **PostgreSQL** | ✅ utilisé |
| LLM (Copilot, analyses) | **Ollama** (Qwen / DeepSeek / Llama) via le gateway | ✅ supporté (`OLLAMA_BASE_URL`) |
| Transcription audio | **Whisper auto-hébergé** (OpenAI-compatible) | ✅ prioritaire (`WHISPER_BASE_URL`), Groq = fallback optionnel |
| Recherche web | **SearXNG** | ✅ supporté (`SEARXNG_URL`), DuckDuckGo sinon |
| Mémoire sémantique / RAG | **Qdrant** | ⏸️ optionnel (à brancher au besoin) |
| Automatisation / workflows | **n8n** | ⏸️ optionnel |
| Chat alternatif | **Open WebUI** | ⏸️ non requis (Copilot intégré) |
> Optionnels (abonnement/crédits/API propriétaire) : Gemini, Groq, OpenRouter,
> Hugging Face, Pollinations, Tavily, Brave — **jamais requis**, feature-flaggés.

## Stack (réel)
- **Monorepo** pnpm (workspaces), Node.js 20/24, TypeScript 5.9.
- **Backend** : Express 5 (`artifacts/api-server`).
- **Frontend** : React 19 + Vite + Tailwind + wouter (`artifacts/kore`).
- **DB** : PostgreSQL + Drizzle ORM (`lib/db`).
- **Auth** : JWT (jsonwebtoken) + bcryptjs. Token maître `API_AUTH_TOKEN` (owner).
- **API contracts** : OpenAPI → Orval (`lib/api-spec`, `lib/api-zod`,
  `lib/api-client-react`).
- **Déploiement** : Railway, **service unique** (l'API sert le build du front).
  Build via `nixpacks.toml` + `railway.toml`. Schéma auto-créé/migré au démarrage
  (`lib/db/src/ensure-schema.ts`).

## Structure actuelle du dépôt
```
artifacts/
  api-server/   → backend Express (routes, middlewares, lib)
  kore/         → frontend React (= "TAMS" côté produit ; dossier gardé "kore")
  mockup-sandbox/
lib/
  db/           → schéma Drizzle + ensure-schema (migrations idempotentes)
  api-spec/ api-zod/ api-client-react/  → contrats & client générés
scripts/        → setup.sh, start.sh, dev.sh, railway-start.sh
ai-context/     → source de vérité (ce dossier)
```

## Correspondance avec la structure cible du template
La cible décrite dans la vision (`/frontend /backend /core /core-template
/agents /integrations /docs /tests /docker /ai-context`) sera atteinte de façon
**incrémentale**, sans casser le déploiement existant :
- `/backend` ≈ `artifacts/api-server`
- `/frontend` ≈ `artifacts/kore`
- `/core` + `/core-template` ≈ à **extraire progressivement** depuis `lib/*` et
  les routes/middlewares réutilisables (auth, users, settings, analytics…).
- `/agents`, `/integrations`, `/docker`, `/tests` : à créer quand un besoin réel
  MVP le justifie.

> Décision d'architecture : on **ne renomme pas** les dossiers `artifacts/*` et
> `lib/*` maintenant (renommage = risque de casser build/déploiement Railway
> pour zéro valeur utilisateur). On documente l'intention et on extraira le
> `core-template` par modules quand ce sera utile.

## Modules présents (backend `routes/`)
- **Auth & identité** : `auth`, `users`, `profile` (JWT, rôles owner/admin/member/viewer).
- **Multi-tenant (gouvernance)** : `tenants` (via auth), `quotas`, `audit`,
  `kill-switch`, `registry`, `approvals` — **scopés par `tenantId`**.
- **Données produit** : `captures`, `tasks`, `events`, `learnings`, `decisions`,
  `memory`, `overload`, `briefings`, `leads`, `recordings`, `export`.
- **IA** : `ai` (transcription), scoring leads, analyses (Gemini/Groq).
- **Ops** : `health` (`/api/healthz`), `diagnostics`, `red-team`.

## Conventions
- Auth appliquée globalement : `requireAuthJwt` sur `/api` (sauf health/_debug/auth).
- Rôles via `requireRole(...)`. Rate-limit en mémoire (`middlewares/rate-limit.ts`).
- Validation d'entrée Zod ; Drizzle (requêtes paramétrées, pas de SQLi).
- En-têtes de sécurité + CORS restreint aux routes `/api`.
- `_debug` verrouillé en production.

## Dette / risques connus (voir roadmap)
- **Isolation multi-tenant incomplète** : les tables de données produit
  (`tasks`, `captures`, `leads`, `recordings`, `decisions`, `memory`, …) n'ont
  **pas** de colonne `tenantId`. OK tant que mono-utilisateur + inscription
  fermée ; **bloquant avant ouverture multi-clients**.
- Branding mixte (KORE/GANDAL) encore présent dans le code (à uniformiser TAMS).
- `dist/` est commité dans le repo (Railway le reconstruit de toute façon).
