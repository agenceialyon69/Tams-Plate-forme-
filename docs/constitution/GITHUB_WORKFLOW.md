# TAMS — Workflow GitHub

> GitHub reste la source de vérité. Aucun travail ne doit rester seulement local.

## Dépôt officiel

`https://github.com/agenceialyon69/Tams-Plate-forme-.git`

Branche : `main`.

## Règles

- Une étape n'est pas réelle tant qu'elle n'est pas poussée sur main.
- Tous les changements importants doivent être commités et pushés.
- Le SHA du commit doit être conservé.
- Ne jamais pousser du travail cassé sur main.
- Ne jamais laisser de secrets dans Git.
- Ne jamais créer un autre repo.
- Ne jamais travailler sur un autre dépôt.

## Format de commit

```
<type>: <description courte>

<description détaillée>
```

Types : `feat`, `fix`, `docs`, `refactor`, `chore`.

## Validation

Une étape n'est validée que si :
- build réussit,
- runtime OK,
- tests réussissent,
- aucune régression,
- commit créé,
- push effectué sur main,
- SHA affiché.

## Interdictions

- Ne jamais créer de branche parallèle non mergée.
- Ne jamais force-push sans justification.
- Ne jamais committer de secrets (`.env`, clés API, tokens).
