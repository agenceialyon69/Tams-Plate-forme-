# Progress

_Mis à jour à chaque cycle. Dernière maj : 2026-06-21._

## DONE
- **Système d'événements applicatifs (analytics/observabilité)** : table
  `app_events` (ensure-schema idempotent) + `lib/events.ts` : `trackEvent()`
  unique (fire-and-forget, ne throw jamais) avec `source`
  (front/backend/copilot/jobs), `severity` (info/warning/critical),
  `workspaceId` (réservé futur), `metadata`. Helpers typés **`trackAuditRun`**,
  `trackCopilotMessage`, `trackMediaGenerated` (anti-duplication). Câblé :
  red-team run, copilot chat, génération image/vidéo. **Viewer admin**
  `GET /api/app-events` (owner/admin, filtres). Testé bout-en-bout (red-team →
  event `audit_run` écrit). Smoke 22/22. _Suite : page front du viewer._
- **Gouvernance enrichie (docs)** : `decisions.md` (registre ADR : pourquoi le
  code est ainsi), `schemas.md` (modèle de données + distinction
  `audit_logs`/`app_events`), `runbook.md` (déploiement, secrets, incidents,
  rollback), `free-stack.md` (politique gratuit-d'abord + alternatives gratuites).
  Section **« Non-objectifs actifs »** visible dans `vision.md` (multi-tenant
  différé, pas de payant, pas de natif mobile, etc.). Règle free-first ajoutée à
  `rules.md`. Index `README.md` à jour.
- **Page Paramètres honnête (config IA & intégrations)** : nouvel endpoint
  `GET /api/integrations/status` (owner/admin) = source de vérité serveur des
  fournisseurs/intégrations réellement configurés. La page Paramètres affiche
  l'état réel (Gemini/Groq/OpenRouter/Ollama, recherche web, image, GitHub,
  FFmpeg) en vert/rouge avec rafraîchissement, à la place de l'ancien sélecteur
  cosmétique (localStorage) + avertissement GEMINI_API_KEY figé. Retrait du
  « lien de connexion rapide » (`?token=` URL) obsolète. Smoke 21/21.
- **Musique sur les vidéos produit** : `makeSlideshow` accepte une piste audio
  optionnelle (base64), mixée avec trim à la durée + fondu de sortie (FFmpeg).
  Uploader « musique » dans l'onglet Vidéo du Studio (max 8 Mo). Routes
  `/video/slideshow` et `/video/from-prompt` acceptent `musicBase64`. Testé
  bout-en-bout (sortie h264 + aac). Smoke 20/20.
- **Recherche web (Copilot peut chercher sur Internet)** :
  `lib/integrations/web-search.ts` — providers **Tavily / Brave / SearXNG**
  (clé/URL gratuites) + **DuckDuckGo keyless** en repli (marche sans config).
  Bouton **Web** dans le Copilot → recherche sur le dernier message, injecte les
  résultats comme contexte (grounding) et affiche les **sources cliquables**.
  `GET /web-search/status`, `POST /web-search`. **Bug corrigé** : le rate-limiter
  IA était monté en `router.use(aiLimiter, X)` (×3, portée globale « / ») →
  débordait sur les routes non-IA montées après (integrations) et comptait 3× →
  faux 429. Désormais : routes IA en fin de chaîne + `aiLimiter` appliqué une
  seule fois, sans débordement. Vérifié : smoke **20/20**.
- **Créateur de vidéos produit (gratuit, FFmpeg)** : `lib/integrations/video-maker.ts`
  assemble des images en vidéo verticale (slideshow). `POST /video/from-prompt`
  (prompt → N images via le générateur → vidéo) et `POST /video/slideshow`
  (images fournies). Onglet **Vidéo** dans Studio (format 9:16/1:1/16:9, nb de
  scènes, lecteur + téléchargement). Body cap 25 Mo sur `/video/*`, rate-limit
  6/min, fichiers temp nettoyés. **La voie gratuite/sans-GPU vers texte→vidéo**
  (les vrais générateurs texte→vidéo sont payants). Testé bout-en-bout en local
  (3 images → mp4 1080×1920 valide). Smoke **18/18**.
- **Génération d'images (texte → image, gratuit)** : `lib/integrations/image-gen.ts`
  — **Pollinations** (sans clé, sans compte) par défaut + **Hugging Face**
  optionnel (token gratuit, FLUX/SDXL). `GET /image/status`, `POST /image/generate`
  (owner/admin, rate-limit 15/min), nouvelle page **Studio** (prompt → image,
  formats e-commerce : carré/portrait/story/paysage, téléchargement). Dégrade
  proprement si l'égress réseau bloque l'hôte (message explicite). Vérifié :
  typecheck, build, smoke **17/17**.
  À venir : **texte → vidéo** (pas d'API gratuite fiable → pipeline
  images + FFmpeg = vidéo slideshow pour Shopify).
- **Verticales produit (AI Startup OS)** : couche de personas modulaire
  (`lib/products.ts`) transformant la plateforme en n'importe quel assistant
  métier sans nouvelle app. 6 verticales : TAMS (générique), **Claire**
  (assistant dentaire), **Shopify** (e-commerce), **Garage**, **CRM** local,
  **SaaS** (sur mesure). Chacune = nom + tagline + system prompt + suggestions.
  `GET /api/products` (filtré par `ENABLED_PRODUCTS`), sélecteur de persona dans
  le Copilot (pills), `productId` envoyé au chat → bonne persona. Guard
  d'injection partagé extrait dans `lib/prompt-guard.ts`. Vérifié : typecheck
  (web+API), build, smoke **15/15** (6 verticales listées).
- **FFmpeg — traitement réel (vidéo → texte)** : `POST /ffmpeg/probe` et
  `POST /ffmpeg/extract-audio` (option `?transcribe=1` chaîne sur Whisper).
  Fichiers temporaires nettoyés (finally), cap body 25 Mo sur les routes ffmpeg,
  uploader sur la page Intégrations. Testé bout-en-bout en local (clip généré →
  mp3 extrait + métadonnées correctes). Smoke **14/14** (route montée + validée).
- **Fix UX Copilot + index ai-context** : bouton d'envoi du chat n'est plus
  masqué par le FAB de capture (masqué sur `/copilot`), input au-dessus de la
  nav mobile (`100dvh`). `ai-context/README.md` documente chaque fichier.
- **Intégration FFmpeg (vidéo/audio, gratuit, sans compte)** : binaire ffmpeg
  installé dans l'image de déploiement (nixpacks `[phases.setup] aptPkgs`),
  module `lib/integrations/ffmpeg.ts` (statut/version, `probeMedia`,
  `extractAudio`, `trimMedia` — `execFile` avec tableau d'args, pas de shell),
  endpoint `/api/integrations/ffmpeg/status` (owner/admin) + carte sur la page
  `/integrations`. Désactivé proprement tant que le binaire est absent
  (`configured:false`). Vérifié : typecheck (web+API), build, smoke **13/13**.
  Prochaine étape : endpoints de traitement (upload → extraction audio →
  transcription Whisper existante, découpage).
- **Intégration GitHub (modulaire, feature-flag)** : module
  `lib/integrations/github.ts` (token-based, REST officielle) + routes
  `/api/integrations/github/*` (statut, dépôts, issues, création d'issue,
  owner/admin) + page `/integrations` (statut, identité, dépôts récents).
  Activée seulement si `GITHUB_TOKEN` est présent ; sinon statut
  `configured:false` (200) et data routes 503 — aucune casse. Le token n'est
  jamais renvoyé au client. Vérifié : typecheck (web+API), build, smoke **12/12**
  (nouvelle assertion : intégration désactivée proprement sans token).
- **Gateway IA multi-fournisseurs gratuits** (`lib/llm.ts`) : `chatComplete()`
  route vers le premier fournisseur **configuré** et bascule sur le suivant en
  cas d'échec (clé absente / serveur local éteint → le Copilot ne casse jamais).
  Fournisseurs : **gemini**, **groq** (Llama/Qwen), **openrouter** (DeepSeek R1 /
  Qwen, gratuit, sans serveur), **ollama** (local). Sélection via `AI_PROVIDER`
  (auto par défaut). `copilotChat` passe par le gateway. `.env.example` complété.
  Vérifié : typecheck, build, smoke.
- **Copilot IA minimal (chat)** : nouvelle page `/copilot` (UI de chat) + endpoint
  `POST /api/copilot/chat` (auth + quota IA), branché sur Gemini via un provider
  isolé (`lib/ai.ts copilotChat`) prêt à accueillir Ollama/local plus tard.
  Dégrade proprement si `GEMINI_API_KEY` absente. Ajouté à la navigation
  (sidebar + mobile). Vérifié : typecheck, build, smoke 11/11.
- **Inscription propriétaire pro (email/mot de passe)** : l'onglet « Créer un
  compte » est toujours dispo ; quand l'inscription est fermée, un **code
  propriétaire** (= `API_AUTH_TOKEN`, comparé en temps constant) permet de créer
  son compte **owner** une seule fois → ensuite connexion email/mot de passe.
  **2 bugs corrigés au passage** : (1) register 500 (tenant ré-inséré sur même
  domaine email → désormais lookup avant insert) ; (2) rate-limiters qui
  partageaient le même compteur par IP (global 120 vs auth 10) → namespace par
  instance. Vérifié : smoke **11/11**, typecheck, build.
- **Correctif UX login** : ré-ajout de l'option **« Accès propriétaire avec un
  token »** sur l'écran de connexion (la doc demandait de coller `API_AUTH_TOKEN`
  mais l'écran ne le permettait plus → blocage quand l'inscription est fermée).
  Le owner peut de nouveau entrer avec le token maître, puis créer/inviter des
  comptes depuis l'admin. Vérifié : typecheck + build.
- **Décision produit (2026-06-20)** : mode **perso / test d'abord**. L'utilisateur
  valide l'app en solo avant de basculer en multi-tenant. Concept conservé :
  plan de migration détaillé dans `ai-context/multi-tenant-plan.md` (prêt à
  exécuter, aucun changement de code maintenant).
- **Filet anti-régression renforcé** : `scripts/smoke.mjs` couvre maintenant
  10 invariants (santé, `bootstrap` avant/après 1er compte, auth requise,
  register, **2ᵉ inscription bloquée 403**, login, route protégée, logout,
  `healthz db=ready`). Exécuté par la CI sur chaque PR. 10/10 OK.
- **Onboarding minimal** : endpoint public `GET /api/auth/status`
  (`bootstrap` = aucun utilisateur encore, `selfRegistrationEnabled`). L'écran de
  connexion s'adapte : indice « premier lancement → crée ton compte
  propriétaire » + onglet inscription masqué quand l'inscription est fermée
  (plus de cul-de-sac 403). Vérifié (base vide → bootstrap true, après 1er
  compte → false ; smoke 5/5).
- **Healthcheck honnête (observabilité)** : `/api/healthz` expose maintenant
  l'état réel de la base (`db: "ready" | "connecting"`) tout en restant **200**
  (healthcheck Railway préservé, démarrage résilient). Plus de « ok » trompeur
  quand la base est down ; diagnostic immédiat. Aucune fuite. Vérifié les 2 états.
- **`README.md` racine** : point d'entrée du template (démarrage rapide,
  fonctionnement, structure, stack, CI, comment adapter, liens vers `ai-context`
  / `SETUP.md`). Rend le projet « compréhensible sans contexte externe ».
- **Nettoyage : dé-suivi des artefacts `dist` commités** (5 fichiers générés,
  déjà dans `.gitignore`, et incohérents — `index.html` commité pointait vers
  des assets non commités). Railway/CI reconstruisent `dist` à chaque build,
  donc aucun impact runtime ; supprime le bruit et la friction « arbre sale ».
- **Nettoyage : suppression du middleware mort `middlewares/auth.ts`** (~270
  lignes, `requireAuth` non importé nulle part — l'app utilise `requireAuthJwt`).
  Réduit la confusion/dette du template. Vérifié : typecheck + build + smoke
  (5/5) OK, l'auth fonctionne toujours.
- **Harnais de stabilité (CI + smoke)** : workflow GitHub Actions
  (`.github/workflows/ci.yml`) → install + typecheck + build (web+API) + smoke
  test runtime sur un Postgres de service. Script `scripts/smoke.mjs` (santé,
  auth requise, bootstrap register, login, route protégée). Rend la croix
  rouge/verte enfin **significative** et attrape la classe de pannes qui cassait
  les déploiements. Vérifié en local : SMOKE OK (5/5).
- **Dashboard / signaux honnêtes** : suppression du faux `consecutiveWorkDays: 0`
  codé en dur. Calcul réel des jours d'activité consécutifs (helper partagé
  `lib/signals.ts`, dérivé de `energy_logs`), utilisé dans `/overload/status`
  (affiché) et le briefing matinal (IA). Les états light/moderate/heavy/critical
  restent calculés sur de vraies données. Vérifié (3 jours consécutifs → 3).
- **Branding unifié TAMS** : `GandalLogo`/`GandalMark` → `TamsLogo`/`TamsMark`
  (lettre « G » → « T »), exports `gandal-export-*` → `tams-export-*`, clé prefs
  `gandal_ai_prefs` → `tams_ai_prefs` (avec migration), `generateMorningKoreMessage`
  → `generateMorningTamsMessage`. Exceptions conservées : préfixe JWT `gandal-jwt:`,
  colonne DB `kore_response`, clés legacy de migration, dossier `artifacts/kore`.
  Vérifié : typecheck + build OK, 0 « Gandal » dans le bundle front.
- Auth JWT (login/register/reset) + token maître owner.
- Déploiement Railway service unique (API sert le front) ; build nixpacks ;
  image allégée (~80 Mo) ; healthcheck robuste.
- Migrations idempotentes au démarrage + **réparation de dérive de schéma**
  (ALTER ADD COLUMN IF NOT EXISTS, exécution résiliente) → fix login 500 (#18).
- Durcissement sécurité : inscription fermée par défaut (bootstrap 1er compte),
  reset token haché + non renvoyé par l'API, exports `requireRole`, rate-limit
  auth (#17). `_debug` verrouillé en prod.
- **Système `ai-context` créé** (vision/architecture/roadmap/progress/rules/changelog).

## IN PROGRESS
- (rien — en attente de validation de la prochaine tâche)

## NEXT (une tâche à la fois)
1. **Configuration** : avec l'utilisateur, renseigner les variables Railway
   (clés IA, GitHub, recherche web) + débloquer l'egress réseau si besoin.
2. Page **Paramètres → Intégrations/IA** : surface l'état des fournisseurs
   configurés (diagnostic) + sélecteur `AI_PROVIDER`.
3. Analytics structure minimale (événements utiles, usage réel).
4. Docker de base (optionnel — le déploiement actuel utilise nixpacks).

## Outils gratuits livrés (résumé)
- IA Copilot multi-fournisseurs (Gemini/Groq/OpenRouter/Ollama) + fallback.
- 6 personas métier (TAMS, Claire, Shopify, Garage, CRM, SaaS).
- Intégration GitHub. FFmpeg (vidéo→texte). Génération d'images (Studio).
- Créateur de vidéos produit (prompt→vidéo) + musique. Recherche web (Copilot).
5. (Différé, hors-scope perso) isolation multi-tenant — prérequis multi-clients.

## BLOCKERS
- **Isolation multi-tenant** absente sur les tables de données produit
  (`tasks/captures/leads/recordings/...`). Non bloquant en mono-utilisateur
  avec inscription fermée ; **bloquant avant ouverture multi-clients**.
- Accès prod : se connecter via le **token maître `API_AUTH_TOKEN`** (le plus
  fiable) ou créer le 1er compte (bootstrap owner).
