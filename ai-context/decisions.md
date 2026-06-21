# Decisions — registre des décisions (ADR léger)

Chaque décision structurante du projet, datée, avec son **contexte**, le **choix**
et la **raison**. Format court (ADR léger). On n'efface pas une décision : si elle
change, on ajoute une nouvelle entrée qui « supersede » l'ancienne.

> But : qu'une IA ou un humain comprenne *pourquoi* le code est ainsi, sans avoir
> à deviner ni à refaire le débat.

---

## ADR-001 — Déploiement en service unique sur Railway
**Date** : 2026-06-15 · **Statut** : actif
**Contexte** : besoin d'un déploiement simple, peu coûteux, sans orchestration.
**Décision** : un seul service — l'API Express sert aussi le front (build Vite).
Build nixpacks, image allégée (~80 Mo), healthcheck `/api/healthz`.
**Raison** : zéro CORS, une seule URL, un seul pipeline. Suffisant en mono-user.
**Conséquence** : `BASE_PATH=/`, le front appelle `/api` sur la même origine.

## ADR-002 — PostgreSQL + Drizzle, migrations idempotentes au démarrage
**Date** : 2026-06-16 · **Statut** : actif
**Décision** : schéma appliqué au boot via `ensure-schema.ts`
(`CREATE TABLE IF NOT EXISTS` + `ALTER ADD COLUMN IF NOT EXISTS`, par statement,
résilient). Le serveur **écoute avant** la fin des migrations.
**Raison** : pas de crash-loop si la DB est lente ; réparation auto de la dérive
de schéma (a corrigé un login 500). **Conséquence** : tout nouveau champ doit
être ajouté de façon idempotente ici.

## ADR-003 — Auth JWT + token maître owner, inscription fermée
**Date** : 2026-06-17 · **Statut** : actif
**Décision** : JWT (bcrypt), rôles owner/admin/member/viewer, `requireRole`.
`API_AUTH_TOKEN` = clé maître owner. Inscription **fermée** (bootstrap 1er
compte, puis code propriétaire one-time).
**Raison** : déploiement perso/test d'abord ; surface d'attaque minimale.
**Lié** : non-objectif « inscription publique » + ADR-008.

## ADR-004 — CI = garantie de déploiement (smoke test runtime)
**Date** : 2026-06-19 · **Statut** : actif
**Décision** : GitHub Actions `build-and-smoke` (install → typecheck → build →
`scripts/smoke.mjs` sur un Postgres réel). 1 feature = 1 PR, **merge seulement
si CI verte**.
**Raison** : reproduire le build Railway et attraper les pannes runtime
(login 500, schéma) qu'un typecheck ne voit pas. La croix rouge/verte devient
significative.

## ADR-005 — Mode perso / test d'abord, multi-tenant différé
**Date** : 2026-06-20 · **Statut** : actif
**Décision** : valider l'app en solo avant le multi-tenant. Concept conservé
(plan détaillé dans `multi-tenant-plan.md`), aucun code multi-tenant maintenant.
**Raison** : éviter la complexité d'isolation tant que le produit n'est pas
validé. **Bloquant** documenté avant toute ouverture multi-clients.

## ADR-006 — Gateway IA multi-fournisseurs gratuits avec fallback
**Date** : 2026-06-21 · **Statut** : actif
**Décision** : `lib/llm.ts` route vers le 1er fournisseur **gratuit** configuré
(Gemini → Groq → OpenRouter → Ollama) et bascule au suivant en cas d'échec.
Sélection via `AI_PROVIDER`.
**Raison** : ne jamais dépendre d'un seul fournisseur ; tout gratuit ; un serveur
local (Ollama) ou une clé manquante ne casse jamais le Copilot.
**Conséquence** : ajouter un fournisseur = un provider isolé, sans toucher aux
routes.

## ADR-007 — Verticales produit = couche de personas (pas d'apps séparées)
**Date** : 2026-06-21 · **Statut** : actif
**Décision** : chaque vertical (Claire, Shopify, Garage, CRM, SaaS) est une
**persona** (`lib/products.ts` : prompt système + suggestions), sélectionnable
dans le Copilot. Pas de nouvelle app par produit.
**Raison** : réaliser « AI Startup OS » de façon réaliste et maintenable.
Filtrage via `ENABLED_PRODUCTS`.

## ADR-008 — Outils/IA gratuits par défaut (free-first)
**Date** : 2026-06-21 · **Statut** : actif
**Décision** : tout besoin est couvert par un outil gratuit, sans abonnement ni
crédit caché (voir `free-stack.md`). Payant = exception, seulement si le gratuit
est insuffisant / instable / incompatible avec une contrainte documentée.
**Conséquence** : vidéo = FFmpeg (pas CapCut/Runway) ; images = Pollinations/HF ;
recherche = DuckDuckGo/SearXNG ; pas de service payant branché sans décision ici.

## ADR-010 — Standard d'événements unifié + helpers spécialisés
**Date** : 2026-06-21 · **Statut** : actif
**Décision** : un **seul** système d'événements applicatifs (`app_events` +
`trackEvent()`). Standard de champs : `event`, `category`, `source`, `severity`,
`importance`, `userId`, `tenantId`, `workspaceId`, `timestamp`, `metadata`.
`source` ∈ {frontend, backend, copilot, agent, workflow, search, system, job} ;
`severity` ∈ {low, medium, high, critical}. Helpers typés (`trackAuditRun`…)
**seulement** pour un vrai besoin métier récurrent.
**Raison** : éviter la duplication de la logique de tracking et les systèmes
d'analytics multiples (cf. `non-objectifs.md`). Distinct de `audit_logs`
(log HTTP automatique).

## ADR-011 — Structure docs minimale (pas de dossiers `architecture/` / `adr/`)
**Date** : 2026-06-21 · **Statut** : actif
**Décision** : garder `ai-context/` plat et court — `architecture.md` (vue
système) et `decisions.md` (ADR) **suffisent**. On ne crée pas de dossier
`architecture/` (system-overview/integrations/data-flow/agent-flow) ni `adr/`
tant que le volume ne le justifie pas.
**Raison** : éviter « trop de docs parallèles qui se recouvrent »
(`non-objectifs.md`). À revoir seulement si `decisions.md` devient ingérable.

## ADR-009 — Intégrations externes modulaires et feature-flaggées
**Date** : 2026-06-21 · **Statut** : actif
**Décision** : chaque intégration (GitHub, FFmpeg, image, vidéo, web search)
s'active uniquement si sa variable/condition est présente ; sinon statut
`configured:false` (200) et data routes 503. Jamais de secret renvoyé au client.
Restreint owner/admin. Source de vérité affichée via `/api/integrations/status`.
**Raison** : rien ne casse quand un service est absent ; config lisible d'un
coup d'œil dans Paramètres.

## ADR-012 — Triage des outils/modèles IA (adopté / différé / refusé)
**Date** : 2026-06-21 · **Statut** : actif
**Décision** :
- **Adoptés (déjà en place)** : **Ollama** (provider local prioritaire),
  **Llama / Qwen / DeepSeek R1** via le gateway (Gemini/Groq/OpenRouter/Ollama),
  **Whisper** (transcription Groq), **génération d'images** (Pollinations sans
  clé + **Hugging Face SDXL/FLUX**).
- **Côté outillage dev (≠ app)** : **DeepSeek Coder / Qwen3-Coder** via
  Cline + Ollama (cf. `free-stack.md`). Pas dans le Copilot produit (assistant
  métier, pas agent de code).
- **Différés (seulement si besoin concret)** : **n8n CE** (si un workflow métier
  réel le justifie) ; **LlamaIndex** (RAG/documents plus tard) ; **Stable
  Diffusion/SDXL local** (nécessite un serveur GPU — HF couvre SDXL/FLUX en
  attendant).
- **Refusés tant qu'aucun besoin** : frameworks d'agents (**LangChain, CrewAI,
  AutoGPT, AgentGPT**) → complexité/dette, abstractions prématurées ; multi-agent
  sans cas d'usage ; **Make / Replicate / HF payant** comme fondation ; **ChatGLM**.
- **Variantes de modèles** (Mixtral/Mistral/Gemma/Phi/Falcon/Bloom) : pas une
  « intégration » — le gateway accepte n'importe quel modèle Ollama/OpenRouter
  par configuration (`*_MODEL`).
**Raison** : free-first + anti sur-ingénierie (`non-objectifs.md`). On n'ajoute
un framework/outil que pour un besoin réel et récurrent.
