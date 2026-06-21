# Changelog (changements majeurs du template)

Format : date — résumé (réf PR si applicable).

## 2026-06-21
- **Gouvernance enrichie** : ajout de `decisions.md` (ADR léger), `schemas.md`
  (modèle de données), `runbook.md` (exploitation/incidents), `free-stack.md`
  (politique gratuit-d'abord + outils). Section **« Non-objectifs actifs »**
  rendue bien visible dans `vision.md`. Règle « gratuit d'abord » dans `rules.md`.
- **Page Paramètres → Configuration IA & Intégrations** : remplace l'ancien
  sélecteur de provider cosmétique (localStorage, Gemini/Ollama seulement, +
  avertissement GEMINI_API_KEY figé) par un **état réel serveur** via
  `GET /api/integrations/status` (fournisseurs IA détectés, recherche web,
  image, GitHub, FFmpeg en vert/rouge). Suppression du « lien de connexion
  rapide » (`?token=` dans l'URL) devenu obsolète et non désiré.
- **Musique sur les vidéos** : piste audio optionnelle (upload) mixée dans le
  slideshow (trim + fondu de sortie via FFmpeg), uploader dans l'onglet Vidéo
  du Studio. Testé bout-en-bout (vidéo h264 + audio aac).
- **Recherche web (Copilot)** : `lib/integrations/web-search.ts` (Tavily/Brave/
  SearXNG + **DuckDuckGo keyless** par défaut). Bouton **Web** dans le Copilot
  (grounding + sources cliquables), `GET /web-search/status`, `POST /web-search`.
  **Fix** d'un bug de portée du rate-limiter IA (mounté globalement → débordait
  sur les routes non-IA montées après ; désormais appliqué une seule fois, en
  fin de chaîne, scoping correct).
- **Créateur de vidéos produit (gratuit)** : `lib/integrations/video-maker.ts`
  (FFmpeg : images → slideshow vertical 9:16). `POST /video/from-prompt`
  (prompt → N images → vidéo) et `POST /video/slideshow` (images fournies).
  Onglet **Vidéo** dans Studio. La voie gratuite/sans-GPU vers « texte → vidéo »
  (texte→vidéo IA réel = payant). Testé bout-en-bout.
- **Génération d'images (texte → image, gratuit)** : `lib/integrations/image-gen.ts`
  (Pollinations sans clé + Hugging Face optionnel), `GET /image/status` +
  `POST /image/generate` (owner/admin, rate-limité), page **Studio** (prompt →
  image → téléchargement, formats e-commerce). Dégrade proprement si l'égress
  réseau bloque l'hôte.
- **Verticales produit (AI Startup OS)** : couche de *personas* configurables
  (`lib/products.ts`) — Claire (dentaire), Shopify (e-commerce), Garage, CRM
  local, SaaS générique + l'assistant TAMS. Chaque verticale = un system prompt
  + suggestions. `GET /api/products`, sélecteur dans le Copilot, `productId`
  passé au chat. Filtrage via `ENABLED_PRODUCTS`. Guard d'injection extrait
  dans `lib/prompt-guard.ts`.
- **FFmpeg — traitement réel** : endpoints `POST /ffmpeg/probe` (métadonnées) et
  `POST /ffmpeg/extract-audio` (vidéo → mp3, option `?transcribe=1` → texte via
  Whisper existant). Fichiers temp nettoyés systématiquement, cap 25 Mo,
  uploader « vidéo → texte » sur la page Intégrations. Testé bout-en-bout.
- **Fix UX Copilot** : le bouton de capture flottant masquait le bouton d'envoi
  du chat → masqué sur `/copilot` (⌘J marche toujours) + input du chat au-dessus
  de la nav mobile (hauteur `100dvh`). Ajout de `ai-context/README.md` (index).
- **Intégration FFmpeg** (vidéo/audio, alternative libre à CapCut) : binaire
  installé dans l'image (nixpacks `aptPkgs`), module `lib/integrations/ffmpeg.ts`
  (statut/version, ffprobe, extraction audio, découpage — exec sans shell),
  endpoint `/api/integrations/ffmpeg/status` + carte sur `/integrations`. Aucun
  compte ni clé requis ; désactivé tant que le binaire est absent.
- **Intégration GitHub** (modulaire, feature-flag `GITHUB_TOKEN`, owner/admin) :
  module `lib/integrations/github.ts` + routes `/api/integrations/github/*`
  (statut, dépôts, issues, création d'issue) + page `/integrations`. Désactivée
  proprement sans token (statut → `configured:false`, data → 503). Le token
  n'est jamais renvoyé au client.
- **Gateway IA multi-fournisseurs** (`lib/llm.ts`) : le Copilot route vers le
  premier fournisseur **gratuit** configuré avec fallback automatique. Gemini,
  Groq (Llama/Qwen), **OpenRouter** (DeepSeek R1 / Qwen, gratuit, sans serveur),
  Ollama (local). Sélection via `AI_PROVIDER`. `.env.example` complété.

## 2026-06-20
- **Copilot IA** : chat conversationnel minimal (`/copilot` + `/api/copilot/chat`,
  Gemini, provider isolé pour multi-LLM futur).
- **Inscription propriétaire** : création de compte email/mot de passe via code
  propriétaire (one-time) quand l'inscription est fermée. Corrige aussi un
  register 500 (slug tenant dupliqué) et une collision de rate-limiters.
- **Login** : ré-ajout de l'accès propriétaire par token sur l'écran de
  connexion (corrige le blocage quand l'inscription est fermée).
- **Décision** : mode perso/test d'abord ; plan de migration multi-tenant
  documenté (`ai-context/multi-tenant-plan.md`), exécution différée.
- **Tests** : smoke test renforcé (10 invariants : auth, onboarding, inscription
  fermée, logout, healthz db=ready).
- **Onboarding** : `GET /api/auth/status` + écran de connexion adaptatif
  (indice premier lancement, masquage inscription si fermée).
- **Healthcheck honnête** : `/api/healthz` reporte l'état réel de la base
  (`db: ready|connecting`), toujours 200 (Railway préservé).
- **README.md** racine : point d'entrée du template.
- **Nettoyage** : dé-suivi des artefacts `dist` commités (générés, reconstruits
  par Railway/CI ; fin de la friction « arbre sale »).
- **Nettoyage** : suppression du middleware d'auth mort (`middlewares/auth.ts`,
  non utilisé). L'auth reste assurée par `requireAuthJwt`.
- **CI + smoke test** : GitHub Actions (typecheck + build web/API + smoke
  runtime sur Postgres) → la croix rouge/verte devient significative.
- **Dashboard honnête** : remplacement du faux `consecutiveWorkDays` (codé à 0)
  par un calcul réel des jours d'activité consécutifs (`lib/signals.ts`).
- **Branding unifié TAMS** : remplacement des occurrences visibles KORE/GANDAL
  par TAMS (logos/lettres, noms d'export, clé de prefs avec migration, fonction
  interne). Exceptions techniques conservées et documentées.
- **ai-context** : création du système de mémoire/gouvernance
  (vision, architecture, roadmap, progress, rules, changelog).
- **Fix login 500** : réparation de la dérive de schéma (ALTER ADD COLUMN
  IF NOT EXISTS) + exécution résiliente des migrations (#18).
- **Durcissement auth** (déploiement personnel) : inscription fermée par défaut,
  reset token haché + non exposé, exports/red-team `requireRole`, rate-limit
  dédié sur les routes d'auth (#17).

## 2026-06-15 → 06-16 (mise en service & robustesse déploiement)
- Image de déploiement allégée (433 Mo → ~80 Mo) : bundle @google + prune (#12).
- Serveur résilient : écoute avant migration, pas de crash-loop si DB lente,
  connexion DB tolérante (DATABASE_URL ou variables PG*) (#8, #9, #10, #11).
- Fix build Railway (pnpm non-frozen via nixpacks) + correctif lockfile (#3).
- Audit red team initial + durcissement + mode service unique (#1).

## Antérieur
- Évolution d'un copilote personnel (KORE) vers une plateforme multi-rôles
  (TAMS) : utilisateurs, tenants, quotas, audit, kill-switch, registry, leads,
  recordings, PWA. (commits intermédiaires)
