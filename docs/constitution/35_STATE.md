# 35 — STATE (état vivant : fait / en cours / reste)

> **Lire avant de commencer un lot.** Mettre à jour après chaque lot.
> Source de vérité unique de l'avancement. Branche : `main` (autodeploy Railway).

_Dernière mise à jour : 2026-06-27._

## Règles de travail (rappel)
- **Une seule branche : `main`.** Tout le monde (outils, agents) travaille et
  pousse sur `main`, qui est liée à Railway (autodeploy). Pas de branches
  parallèles divergentes.
- **Zéro payant** (voir `36_FREE_STACK.md`).
- **Definition of Done** : build OK, TypeScript valide, app démarre, anciennes +
  nouvelles fonctions marchent, Railway déploie, commit + push sur `main`, SHA affiché.

## ✅ Fait (vérifié sur `main`)
- **Railway débloqué** : `pnpm-lock.yaml` régénéré (frozen install OK) ; builds
  `api-server` (esbuild) + `tams` (vite) passent. (SHA `4a1d8ff`)
- **api-server TypeScript valide** : corrigés tool-calls, enum mode, dates briefing. (SHA `beb4e55`)
- **Zéro payant** : SDK `openai` **retiré** ; nouveau client `lib/ai.ts`
  OpenAI-compatible par `fetch` (non-stream + streaming SSE) routé vers des
  fournisseurs **gratuits** (`AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL`, fallback
  `AI_GATEWAY_URL`). briefing/decisions/conversations/studio-generate migrés.
  Boot OK (healthz 200). Plus de défaut vers api.openai.com.
- **Backend (routes présentes)** : health, briefing (Chief of Staff), conversations
  (Chat OS), tasks/projects/contacts (Workspace), memories (Memory), decisions
  (Decision OS), assets + studio-generate (Studio), dashboard, notifications, system.
- **Frontend déployé** : `artifacts/tams` (accueil, chat, studio, systeme, travail).
- **Frontend `tams` TypeScript valide** : bugs runtime corrigés (`systeme.tsx`
  `decisionId`→`id`, `memoryId`→`id`, `.question`→`.title`, `accueil.tsx`
  `generate.mutate()`), shapes d'options des hooks Orval surtypés neutralisés.
  `tams` + `api-server` typecheck **propres**, builds **OK**, boot **OK** (healthz 200).
- **P8 AI Router (free-first)** : `lib/ai.ts` réécrit en routeur multi-fournisseurs
  avec **fallback en chaîne** et sélection du modèle gratuit **par tâche**
  (`chat`/`fast`/`reasoning`/`json`). Fournisseurs : `AI_BASE_URL` → Ollama →
  Groq → Gemini → OpenRouter (`:free`). Diagnostic `GET /api/system/ai`
  (`{configured, providers, primary, hint}`). decisions/conversations/briefing/
  studio migrés (plus de `model` codé en dur imposé). Voir `36_FREE_STACK.md`.
- **P2 Chat OS (mobile)** : bulle utilisateur optimiste (style WhatsApp), bouton
  Stop pendant le streaming, textarea auto-redimensionnée, saisie possible
  pendant la génération.
- **P7 Studio — génération d'image RÉELLE & gratuite** : `POST /api/studio/generate-image`
  (moteur Pollinations/Flux, sans clé) + enrichissement optionnel du prompt via
  le routeur IA. UI Studio : formulaire Image (aperçu live, régénérer, enregistrer),
  rendu `<img>` dans les cartes, boutons Image (header + état vide). CSP `frameSrc`
  ajouté (YouTube/Vimeo/SoundCloud/Spotify) pour que les embeds vidéo/audio marchent.

## 🔧 En cours / à corriger en priorité
1. **Deux frontends** (`tams` déployé vs `kore` non déployé) : clarifier/consolider
   pour éviter la confusion (un seul frontend canonique).

## 🗺️ Reste (par pilier — voir `04_10_PILLARS.md`)
- **P1 Chief of Staff** : indicateur de fraîcheur du briefing ; intégrer vie perso (P11).
- **P2 Chat OS** : streaming, pièces jointes, modes (Discussion/CoS/Red Team/Dev/…),
  appels d'outils fiables, mémoire dans le contexte.
- **P3 Agent System** : agents spécialisés (Executive/Engineering/Product/Business/
  Marketing/Research/Memory/Decision/Red Team/Studio/DevOps/Personal Life) + orchestrateur.
- **P4 Memory Graph** : relations réelles via **pgvector** (personnes/projets/docs/décisions…).
- **P5 Decision OS** : options/risques/avis IA/Red Team/confiance.
- **P6 Workspace** : fusion tâches/agenda/CRM/projets/notes/objectifs.
- **P7 Studio** : image/vidéo/audio/doc **réellement** fonctionnels (FFmpeg + free) ;
  jamais un bouton « Créer » qui échoue sans diagnostic.
- **P8 AI Router** : choix automatique du meilleur modèle **gratuit** par tâche.
- **P9 Mobile Premium** : safe areas, clavier, gestes, offline, fluidité native.
- **P10 Platform OS** : observabilité (OpenTelemetry/Prometheus/Grafana), audit,
  sauvegarde, récupération, export, santé.
- **P11 Personal Life OS** : santé/famille/finances/admin/carrière/apprentissage/habitudes.

## 📦 À récupérer (depuis l'ancienne branche `claude/red-team-audit-qbtht9`)
Travaux utiles **gratuits** à porter sur `main` quand pertinent : éditeur vidéo
FFmpeg (intro/outro, transitions, styles, Ken Burns, logo, captions, musique),
mémoire conversationnelle persistée, Whisper auto-hébergé, recherche web
(SearXNG/DuckDuckGo), génération d'images (Pollinations/HF free).
