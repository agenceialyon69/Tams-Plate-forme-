# Progress

_Mis à jour à chaque cycle. Dernière maj : 2026-06-20._

## DONE
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
1. Settings : structurer compte / workspace / intégrations / branding.
2. Analytics structure minimale (événements utiles, usage réel).
3. Onboarding minimal (réduire la friction d'entrée).
4. Docker de base (optionnel — le déploiement actuel utilise nixpacks).

## BLOCKERS
- **Isolation multi-tenant** absente sur les tables de données produit
  (`tasks/captures/leads/recordings/...`). Non bloquant en mono-utilisateur
  avec inscription fermée ; **bloquant avant ouverture multi-clients**.
- Accès prod : se connecter via le **token maître `API_AUTH_TOKEN`** (le plus
  fiable) ou créer le 1er compte (bootstrap owner).
