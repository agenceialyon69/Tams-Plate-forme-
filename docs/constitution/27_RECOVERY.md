# 27 — Recovery

## Définition

Capacité à récupérer l'état complet du système après une interruption, une corruption ou un déploiement raté.

## Route export existante

`GET /api/system/export` — retourne un snapshot JSON de toutes les tables.

## Contenu du snapshot

```json
{
  "exported_at": "ISO timestamp",
  "briefings": [...],
  "conversations": [...],
  "messages": [...],
  "tasks": [...],
  "projects": [...],
  "contacts": [...],
  "memories": [...],
  "memory_edges": [...],
  "decisions": [...],
  "assets": [...],
  "activity": [...]
}
```

## Procédure de recovery

1. Déclencher `GET /api/system/export` → sauvegarder le JSON.
2. Sur la nouvelle instance : restaurer le snapshot via script d'import.
3. Vérifier la cohérence (counts, dernières dates).
4. Relancer le healthcheck.

## Manquant

- Import / restore depuis un snapshot.
- Export planifié (cron).
- Notification si export > N jours d'ancienneté.

## Règle

Un système sans export est un système perdu.  
L'export doit fonctionner même si l'IA est indisponible.
