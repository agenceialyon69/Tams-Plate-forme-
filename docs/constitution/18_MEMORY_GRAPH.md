# 18 — Memory Graph

## Rôle

Mémoire relationnelle de TAMS. Chaque information importante peut devenir un nœud.  
Les nœuds sont liés par des edges typées. Le graphe est queryable et actionnable.

## Structure

### Table `memories`

```sql
id uuid PK
content text
tags jsonb
related_ids jsonb -- legacy, remplacé par memory_edges
created_at timestamp
```

### Table `memory_edges`

```sql
id uuid PK
source_id uuid FK → memories.id
target_id uuid FK → memories.id
type enum (related_to | supports | contradicts | caused_by | leads_to | part_of)
created_at timestamp
```

## Routes API

- `GET /api/memories` — liste des nœuds
- `POST /api/memories` — créer un nœud
- `GET /api/memories/graph` — graphe complet (nœuds + edges)
- `GET /api/memory-edges` — liste des edges
- `POST /api/memory-edges` — créer une edge
- `DELETE /api/memory-edges/:id` — supprimer une edge

## État actuel

- Edges typées codées (commit `b1d9b79`).
- Routes API : GET graph, CRUD edges opérationnels.
- `memory_edges` non pushée sur Railway DB (bloquant).
- Visualisation graphe frontend : non implémentée.

## Manquant

1. Push `memory_edges` sur Railway DB via `drizzle-kit push`.
2. Visualisation graphe (React Force Graph ou D3 force simulation).
3. Auto-linking : détecter automatiquement les relations entre entités.
