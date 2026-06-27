# 35 — STATE (état vivant : fait / en cours / reste)

> **Lire avant de commencer un lot.** Mettre à jour après chaque lot.
> Source de vérité unique de l'avancement. Branche : `main` (autodeploy Railway).

_Dernière mise à jour : 2026-06-27 — LOT 11._

## Règles de travail (rappel)
- **Une seule branche : `main`.** Tout le monde (outils, agents) travaille et
  pousse sur `main`, qui est liée à Railway (autodeploy). Pas de branches
  parallèles divergentes.
- **Zéro payant** (voir `36_FREE_STACK.md`).
- **Definition of Done** : build OK, TypeScript valide, app démarre, anciennes +
  nouvelles fonctions marchent, Railway déploie, commit + push sur `main`, SHA affiché.

---

## ✅ Fait (vérifié sur `main`)

- **Railway débloqué** : `pnpm-lock.yaml` régénéré (frozen install OK) ; builds
  `api-server` (esbuild) + `tams` (vite) passent. (SHA `4a1d8ff`)
- **api-server TypeScript valide** : corrigés tool-calls, enum mode, dates briefing. (SHA `beb4e55`)
- **Zéro payant** : SDK `openai` **retiré** ; nouveau client `lib/ai.ts`
  OpenAI-compatible par `fetch` routé vers des fournisseurs **gratuits**. (SHA `1825d9b`)
- **Backend (routes présentes)** : health, briefing (Chief of Staff), conversations
  (Chat OS), tasks/projects/contacts (Workspace), memories (Memory), decisions
  (Decision OS), assets + studio-generate (Studio), dashboard, notifications, system.
- **Frontend déployé** : `artifacts/tams` (accueil, chat, studio, systeme, travail).
- **Frontend TypeScript valide** : bugs runtime corrigés, typecheck propre. (SHA `4624378`)
- **P8 AI Router (free-first)** : `lib/ai.ts` routeur multi-fournisseurs avec
  fallback en chaîne. Fournisseurs : `AI_BASE_URL` → Ollama → Groq → Gemini →
  OpenRouter (`:free`). (SHA `27f364b`)
- **P2 Chat OS (mobile)** : bulle utilisateur optimiste, bouton Stop, textarea
  auto-grow. (SHA `4786b57`)
- **P7 Studio — génération d'image réelle & gratuite** : Pollinations/Flux sans
  clé API, enrichissement prompt optionnel. (SHA `1f2fedc`)
- **P3 Agent System (backend)** : 11 agents spécialisés, Chief of Staff orchestre,
  `GET /api/agents`, `POST /api/agents/:id/run`, `POST /api/agents/orchestrate`.
  (SHA `c30c531`)
- **P3 Agent System (frontend)** : page `/agents`, roster + composer, plan +
  synthèse exécutive. (SHA `b73783b`)
- **LOT 11 — Railway hardening + Red Team** (SHA en cours) :
  - CORS `resolveOrigin()` : plus jamais `false` en production.
  - nixpacks : pnpm épinglé `@10.26.1`, `typecheck:libs` ajouté avant build.
  - `.env.example` : tous les vars documentés (ALLOWED_ORIGINS, FRONTEND_URL, IA).
  - `logActivity` : type `ActivityType` complet (ajout `"agent"`).
  - Audit Red Team complet : `37_RED_TEAM_AUDIT_2026-06-27.md` (score 87/100).

### 🚑 Récupération post-merge Bolt/Replit + audit branches (2026-06-27)
- **Railway débloqué (cause racine réelle)** : un commit « tailwind v3 compat »
  avait cassé TOUS les déploiements (config v3 vs paquets v4 installés →
  `autoprefixer` introuvable). Retour au setup **Tailwind v4** (`@tailwindcss/vite`,
  `@import "tailwindcss"`), suppression de `postcss.config.js` + `tailwind.config.js`.
  Builds tams + api-server OK. (SHA `1ee47cf`)
- **Consolidation (zéro doublon)** : suppression de `lib/agents.ts`,
  `lib/agent-tools.ts` (doublons de `lib/agents/`), `lib/ai-router.ts` (mort),
  `routes/studio-generate.ts` (fusionné dans `studio.ts`). Système d'agents
  **unique** = `lib/agents/`. (SHA `418b46b`)
- **Régressions de montage corrigées** : Chat (`/conversations` double-préfixe →
  404) et Agents (`/agents` non monté → 404) ré-opérationnels ;
  `routes/agents.ts` réécrit sur `lib/agents/` + orchestrate multi-agents. (SHA `418b46b`)
- **Studio** : `/studio/generate-image` (Pollinations gratuit) réintégré dans
  `studio.ts` ; checks IA `REPLIT_AI_API_KEY` → `aiConfigured()`. (SHA `418b46b`)
- **DB résilience + auto-migration** (récupéré des branches `fix/db-*`,
  `fix/healthcheck-listen-first`, adapté au schéma actuel) : `lib/db` ne plante
  plus à l'import, fallback `PG*` ; `ensure-schema.ts` crée enums + 13 tables
  (idempotent, retry) ; boot listen-first + schéma en arrière-plan. **Une base
  Railway vierge est bootstrapée automatiquement** (testé sur Postgres réel :
  12 tables, CRUD OK). (SHA `d6dd311`)
- **CSP Google Fonts** (récupéré de `fix/csp-fonts`) : `styleSrc` +
  `fonts.googleapis.com`, `fontSrc` + `fonts.gstatic.com` (la police Inter
  premium ne se chargeait pas en prod).

### 📋 Audit des 33 branches distantes
Toutes les branches `chore/*`, `feat/*`, `docs/*`, `test/*`, `claude/*`,
`fix/*` (sauf récupérées ci-dessus) sont sur **l'ANCIENNE architecture**
(aucun ancêtre commun avec `main` actuel — `main` a été reconstruit). Leurs
concepts (AI router, agents, studio, healthz, CRM) sont **déjà présents et
mieux intégrés** dans `main`. Récupéré par concept ce qui était utile et
compatible (résilience DB, auto-schéma, CSP fonts). Le reste = ancienne base à
ne PAS re-merger (réintroduirait la dette). Branches `railway/code-change-*` =
commits auto Railway (env), sans valeur de code.

---

## 🔧 En cours / à corriger en priorité

1. **`dashboard/summary`** : charge toutes les lignes sans `COUNT(*)` → ajouter
   des agrégats SQL pour les compteurs.
2. **Streaming SSE timeout** : ajouter un timeout max (5 min) côté serveur pour
   les connexions SSE abandonnées.
3. **Deux frontends** (`tams` déployé vs `kore` non déployé) : `kore` est orphelin,
   à supprimer dans un futur lot.

---

## 🗺️ Reste (par pilier — voir `04_10_PILLARS.md`)

- **P1 Chief of Staff** : indicateur de fraîcheur du briefing ; intégrer vie perso (P11).
- **P2 Chat OS** : streaming complet, pièces jointes, modes avancés,
  appels d'outils fiables, mémoire dans le contexte.
- **P3 Agent System** : agents spécialisés plus riches, mémoire longue durée,
  délégation inter-agents.
- **P4 Memory Graph** : relations réelles via **pgvector**
  (personnes/projets/docs/décisions…).
- **P5 Decision OS** : options/risques/avis IA/Red Team/confiance améliorés.
- **P6 Workspace** : fusion tâches/agenda/CRM/projets/notes/objectifs.
- **P7 Studio** : vidéo/audio/doc via FFmpeg + free ; jamais de bouton « Créer »
  qui échoue sans diagnostic.
- **P8 AI Router** : choix automatique du meilleur modèle gratuit par tâche.
- **P9 Mobile Premium** : safe areas, clavier, gestes, offline, fluidité native.
- **P10 Platform OS** : observabilité (OpenTelemetry/Prometheus/Grafana), audit,
  sauvegarde, récupération, export, santé.
- **P11 Personal Life OS** : santé/famille/finances/admin/carrière/apprentissage.
- **Tests** : vitest pour routes critiques (briefing, conversations, agents).
- **Migration DB auto** : script Drizzle au démarrage pour éviter les mises à jour manuelles.
