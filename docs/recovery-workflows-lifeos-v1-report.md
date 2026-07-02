# Recovery + Workflows + Personal Life OS v1 Report

## Objectif

Construire les prochains éléments ouverts dans la Constitution après les lots Dev Agent, Chat fiable et providers :

- Recovery import/restauration v1.
- Workflows métier v1.
- Personal Life OS v1.
- Garde-fous CI pour éviter une régression.

## Ce qui est construit

### Recovery v1

Nouveaux endpoints :

- `GET /api/system/recovery/status`
- `POST /api/system/recovery/validate`
- `POST /api/system/recovery/import`

Le recovery v1 est volontairement **append-only** :

- pas de suppression ;
- pas de remplacement destructif ;
- pas de conservation forcée des anciens IDs ;
- dry-run par défaut ;
- import limité aux tables sûres : tasks, projects, memories, decisions.

### Personal Life OS v1

Nouveaux endpoints :

- `GET /api/life-os/status`
- `GET /api/life-os/briefing`
- `POST /api/life-os/red-team`
- `GET /api/life-os/workflows`

Priorités codées :

1. Santé physique & mentale.
2. Famille & relations.
3. Obligations perso/admin/financières.
4. Stabilité professionnelle.
5. Projets & ambitions.
6. Apprentissage & productivité.

### Workflows métier v1

Les workflows métier sont exposés sous forme de templates Life OS :

- check santé quotidien ;
- revue admin/finance ;
- garde-fou famille ;
- revue Red Team hebdomadaire.

Ces templates sont non destructifs : ils ne déclenchent aucune action externe tant qu'un workflow réel n'est pas configuré.

## Validation CI ajoutée

La CI smoke vérifie désormais :

- recovery status ;
- recovery validate ;
- recovery dry-run import ;
- Life OS status ;
- Life OS briefing ;
- Life OS Red Team.

## Limites assumées

- Recovery v1 ne fait pas encore de restauration complète des relations/IDs.
- Pas d'import destructif, par sécurité.
- Workflows métier v1 = templates + endpoints, pas encore automatisations réelles longues.
- Personal Life OS v1 = priorisation et Red Team déterministe, pas encore mémoire personnelle profonde.

## Prochaine étape

Après merge et Railway deploy :

1. Tester `/api/system/recovery/status`.
2. Tester un dry-run recovery.
3. Tester `/api/life-os/status`.
4. Tester `/api/life-os/briefing`.
5. Créer ensuite les vrais workflows métier dans l'UI ou via n8n si nécessaire.
