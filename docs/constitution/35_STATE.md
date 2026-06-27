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
