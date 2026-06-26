# 28 — Export System

## Exports disponibles

| Type | Route | Format | Contenu |
|---|---|---|---|
| Snapshot complet | `GET /api/system/export` | JSON | Toutes les tables |
| Export décision | Non implémenté | PDF/MD | Une décision + analyses |
| Export tâches | Non implémenté | CSV/JSON | Filtré par projet |

## Format snapshot

Voir `27_RECOVERY.md` pour la structure JSON complète.

## Export décision (à implémenter)

```typescript
GET /api/decisions/:id/export?format=markdown

// Retourne :
# Décision : <titre>
## Contexte
...
## Options analysées
...
## Conseil stratégique
...
## Red Team
...
## Score de confiance : XX/100
## Tâches créées
...
```

## Règles

- L'export doit être récupérable sans IA.
- L'export ne doit jamais exposer des secrets (`AI_GATEWAY_URL`, clés).
- L'export JSON doit être lisible par un humain sans tooling.
- Préparer l'export avant toute migration DB ou redéploiement majeur.
