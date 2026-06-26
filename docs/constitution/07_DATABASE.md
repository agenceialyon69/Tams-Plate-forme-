# 07 — Base de données

## Moteur

PostgreSQL via Railway. ORM : Drizzle (schéma TypeScript, `lib/db/src/schema/`).

## Tables existantes

| Table | Clé primaire | Usage |
|---|---|---|
| `briefings` | `id` uuid | Briefings Chief of Staff |
| `conversations` | `id` uuid | Sessions de chat |
| `messages` | `id` uuid | Messages individuels |
| `tasks` | `id` uuid | Tâches Work OS |
| `projects` | `id` uuid | Projets |
| `contacts` | `id` uuid | Contacts CRM léger |
| `memories` | `id` uuid | Nœuds mémoire |
| `decisions` | `id` uuid | Décisions |
| `assets` | `id` uuid | Assets Studio |
| `activity` | `id` uuid | Journal d'activité |
| `memory_edges` | `id` uuid | Edges typées entre memories (codée, à pusher) |

## Règles Drizzle

- Toujours utiliser `uuid` comme PK avec `defaultRandom()`.
- Toujours ajouter `createdAt` / `updatedAt` avec `defaultNow()`.
- Ne jamais supprimer une colonne — ajouter des colonnes uniquement.
- Après modification du schéma : `pnpm run typecheck:libs` avant les artifacts.
- `memory_edges` : enum de types `(related_to | supports | contradicts | caused_by | leads_to | part_of)`.

## Seed

Toutes les tables sont seedées avec des données réalistes (contexte Mohamed / consulting).

## Issues connues

- `tasks.project_id` : soft reference sans FK constraint.
- `memories.related_ids` : jsonb legacy, remplacé par `memory_edges`.
- Migrations Drizzle non commitées — schéma uniquement en code.
- `memory_edges` non pushée sur Railway DB.

## Commandes

```bash
# Push schéma sur DB (Railway)
pnpm --filter @workspace/db run push

# Typecheck après modif schéma
pnpm run typecheck:libs
```
