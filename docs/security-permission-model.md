# Security Permission Model v1

## Verdict

**PASS au niveau conception/implémentation; validation CI requise.**

## Niveaux

| Niveau | Usage |
|---|---|
| `read_only` | lecture sans effet |
| `preview` | simulation/dry-run et écritures internes faibles |
| `approved` | action explicitement approuvée |
| `autonomous_safe` | automatisation locale réversible et bornée |
| `admin_only` | recovery, bulk write, GitHub critique |

## Règles

- Toute action high/critical exige un approval humain actif, sauf dry-run explicitement supporté.
- L'approval exige une confirmation égale à l'`actionId`, un auteur et une expiration maximum de 24 h.
- Toute décision autorisée ou bloquée crée un événement d'audit.
- Les métadonnées d'audit sont tronquées et nettoyées.
- Aucune valeur de secret n'est retournée.
- Une PR ou modification GitHub ne peut jamais cibler directement `main` via ce modèle.
- Email, Calendar, n8n et actions externes restent sans effet tant que la configuration et l'approval ne sont pas présents.

## Actions protégées

`email.send`, `calendar.write`, `n8n.run`, `recovery.import`, `github.write`, `github.ci.rerun`, `github.pr.create`, `worker.long.run`, `data.bulk.write`, `automation.enable`.

## Endpoints

- `GET /api/permissions/actions`
- `GET /api/permissions/actions/:id`
- `POST /api/permissions/check`
- `POST /api/permissions/approve`
- `GET /api/permissions/audit`

## Limite

TAMS est actuellement single-user. En mode authentifié, l'approval devra être lié au sujet JWT/Supabase; aucune extension multi-tenant ne doit être supposée.
