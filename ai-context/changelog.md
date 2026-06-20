# Changelog (changements majeurs du template)

Format : date — résumé (réf PR si applicable).

## 2026-06-20
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
