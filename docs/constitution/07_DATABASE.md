# 07 — Base de données

## Moteur

PostgreSQL via Supabase. ORM : Drizzle (schéma TypeScript, `lib/db/src/schema/`).

## Tables existantes

| Table | Clé primaire | Usage |
|---|---|---|
| `briefings` | `id` serial | Briefings Chief of Staff |
| `conversations` | `id` serial | Sessions de chat |
| `messages` | `id` serial | Messages individuels |
| `tasks` | `id` serial | Tâches Work OS |
| `projects` | `id` serial | Projets |
| `contacts` | `id` serial | Contacts CRM léger |
| `memories` | `id` serial | Nœuds mémoire |
| `memory_edges` | `id` serial | Edges typées entre memories |
| `decisions` | `id` serial | Décisions |
| `assets` | `id` serial | Assets Studio |
| `activity` | `id` serial | Journal d'activité |
| `project_contacts` | `id` serial | Jointure contacts↔projets |

Toutes les tables déployées sur Supabase PostgreSQL (2026-06-26).

## Règles Drizzle

- Toujours utiliser `serial` comme PK (pas uuid).
- Toujours ajouter `createdAt` / `updatedAt` avec `defaultNow()`.
- Ne jamais supprimer une colonne — ajouter des colonnes uniquement.

## Issues connues

- `tasks.project_id` : soft reference sans FK constraint (intentionnel pour flexibilité).
- `memories.related_ids` : jsonb legacy, remplacé par `memory_edges`.
- Migrations Drizzle non commitées — schéma uniquement en code.
- `memory_edges` et `project_contacts` déployées (commit `96fb610`).
