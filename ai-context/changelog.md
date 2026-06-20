# Changelog (changements majeurs du template)

Format : date — résumé (réf PR si applicable).

## 2026-06-20
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
