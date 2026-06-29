# 04 — Standard GitHub

## Dépôt officiel

`https://github.com/agenceialyon69/Tams-Plate-forme-.git`  
Branche unique : `main`

## Règles absolues

- Toute étape n'est réelle que si poussée sur main avec un SHA.
- Ne jamais créer un autre dépôt.
- Ne jamais pousser du code cassé.
- Ne jamais committer de secrets (`.env`, clés API, tokens).
- Ne jamais force-push sans justification explicite.

## Format de commit

```
<type>(<scope>): <description courte>

<description détaillée optionnelle>
```

Types valides : `feat`, `fix`, `docs`, `refactor`, `chore`, `perf`, `test`.

Exemples :
```
feat(chat): add tool-use function calling for task creation
fix(briefing): replace hardcoded content with AI-generated output
docs(constitution): add 30-file numbered constitution structure
```

## Validation avant push

1. `pnpm run typecheck` — zéro erreur TypeScript.
2. Build frontend et backend réussi.
3. Healthcheck `GET /api/healthz` retourne 200.
4. Aucune régression détectée.

## Secrets

Voir `09_SECURITY_STANDARD.md` pour la gestion des secrets.
