# Progress

_Mis à jour à chaque cycle. Dernière maj : 2026-06-20._

## DONE
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
1. Analytics structure minimale (événements utiles, usage réel).
2. Docker de base (optionnel — le déploiement actuel utilise nixpacks).
3. (Différé, hors-scope perso) isolation multi-tenant — prérequis multi-clients.

## BLOCKERS
- **Isolation multi-tenant** absente sur les tables de données produit
  (`tasks/captures/leads/recordings/...`). Non bloquant en mono-utilisateur
  avec inscription fermée ; **bloquant avant ouverture multi-clients**.
- Accès prod : se connecter via le **token maître `API_AUTH_TOKEN`** (le plus
  fiable) ou créer le 1er compte (bootstrap owner).
