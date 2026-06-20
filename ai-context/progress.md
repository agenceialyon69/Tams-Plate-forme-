# Progress

_Mis à jour à chaque cycle. Dernière maj : 2026-06-20._

## DONE
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

## NEXT (proposé, à valider — une tâche à la fois)
1. **Branding unifié TAMS** : remplacer occurrences visibles KORE/GANDAL
   (~27 dans le code : `GandalLogo`, `GandalMark`, `gandal-export-*`,
   `gandal_ai_prefs`, etc.). Conserver les identifiants techniques risqués
   (clé localStorage déjà migrée, secret `gandal-jwt:` côté JWT — à documenter).
2. Dashboard : audit des signaux (timestamps/charge réels).
3. Settings : structurer compte / workspace / intégrations / branding.

## BLOCKERS
- **Isolation multi-tenant** absente sur les tables de données produit
  (`tasks/captures/leads/recordings/...`). Non bloquant en mono-utilisateur
  avec inscription fermée ; **bloquant avant ouverture multi-clients**.
- Accès prod : se connecter via le **token maître `API_AUTH_TOKEN`** (le plus
  fiable) ou créer le 1er compte (bootstrap owner).
