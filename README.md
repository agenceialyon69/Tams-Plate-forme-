# TAMS — AI STARTUP OS

Template SaaS réutilisable (auth, multi-rôles, dashboard, gouvernance, IA) servant
de socle à plusieurs produits verticaux (CRM, copilote métier, outils business).
Le branding visible est **TAMS**.

> Conçu pour rester **simple, stable et compréhensible sans contexte externe**.
> Avant toute contribution, lire `ai-context/` (source de vérité) et `ai-context/rules.md`.

## Démarrage rapide

**En local** (Node 20/24 + pnpm, voir `SETUP.md` pour le détail) :
```bash
cp .env.example .env      # renseigner DATABASE_URL, API_AUTH_TOKEN, JWT_SECRET
bash scripts/setup.sh     # install + build (une fois)
bash scripts/start.sh     # démarre tout sur http://localhost:8080
```

**En ligne** : déploiement service unique sur Railway (l'API sert le front).
Guide pas à pas dans **[`SETUP.md`](./SETUP.md)**.

## Comment ça marche

- **Service unique** : l'API Express sert aussi le front buildé (une seule URL, pas de CORS).
- **Base de données** : tables créées et migrées automatiquement au démarrage
  (`lib/db/src/ensure-schema.ts`) — aucune commande de migration manuelle.
- **Auth** : JWT (login/register/reset) + token maître `API_AUTH_TOKEN` (owner).
  Inscription fermée par défaut (1ᵉʳ compte = bootstrap owner).

## Structure

```
artifacts/api-server/   Backend Express (routes, middlewares, lib)
artifacts/kore/         Frontend React + Vite (produit « TAMS »)
lib/db/                 Schéma Drizzle + migrations idempotentes
lib/api-*/              Contrats OpenAPI & client générés
scripts/                setup / start / dev / smoke
ai-context/             Source de vérité (vision, architecture, roadmap, rules…)
.github/workflows/ci.yml  CI : typecheck + build + smoke test
```

Détails et conventions : **[`ai-context/architecture.md`](./ai-context/architecture.md)**.

## Stack

pnpm monorepo · TypeScript · Express 5 · PostgreSQL + Drizzle · React 19 + Vite +
Tailwind · JWT/bcrypt · déploiement nixpacks/Railway.

## Qualité & stabilité

Chaque PR passe la **CI** (`install → typecheck → build (web+API) → smoke test`
sur un Postgres de service). La CI reproduit le build de déploiement : si elle est
verte, Railway peut déployer.

## Adapter le template à un nouveau cas d'usage

1. Garder le socle (auth, users, settings, dashboard, gouvernance).
2. Remplacer/ajouter les modules « données produit » sous `artifacts/api-server/src/routes`
   et le schéma sous `lib/db/src/schema`.
3. Ajuster le branding (voir `ai-context/rules.md` pour les exceptions techniques).
4. Avant d'ouvrir à plusieurs clients : ajouter l'**isolation multi-tenant**
   (`tenantId` sur les tables data) — voir `ai-context/roadmap.md`.

## Documentation

- [`SETUP.md`](./SETUP.md) — mise en service (local & Railway).
- [`SECURITY_AUDIT.md`](./SECURITY_AUDIT.md) — audit sécurité et remédiations.
- [`ai-context/`](./ai-context) — vision, architecture, roadmap, progress, rules, changelog.
