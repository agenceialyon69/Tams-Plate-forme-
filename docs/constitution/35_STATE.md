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
- **api-server TypeScript valide** : corrigés tool-calls OpenAI v6, enum mode,
  dates briefing. (SHA `beb4e55`)
- **Backend (routes présentes)** : health, briefing (Chief of Staff), conversations
  (Chat OS), tasks/projects/contacts (Workspace), memories (Memory), decisions
  (Decision OS), assets + studio-generate (Studio), dashboard, notifications, system.
- **Frontend déployé** : `artifacts/tams` (accueil, chat, studio, systeme, travail).

## 🔧 En cours / à corriger en priorité
1. **Retirer le payant** : `studio-generate.ts` importe le SDK `openai` et pointe
   par défaut sur `api.openai.com` → remplacer par un client OpenAI-compatible
   `fetch` routé vers un fournisseur **gratuit** (Ollama/Groq/Gemini/OpenRouter free).
2. **Frontend `tams` — typecheck** : erreurs réelles à corriger (vite build passe
   mais bugs runtime) : `systeme.tsx` (`decisionId`→`id`, `memoryId`→`id`,
   `.question`→`.title`), shapes d'options des hooks générés (queryKey) dans
   `chat.tsx`, `accueil.tsx`, `notifications-panel.tsx`.
3. **Deux frontends** (`tams` déployé vs `kore` non déployé) : clarifier/consolider
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
