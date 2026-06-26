# 20 — Workspace (Work OS)

## Rôle

Gestion opérationnelle quotidienne : tâches, projets, contacts.  
Pas un CRM complet — un CRM léger intégré au reste du système.

## Modules

### Tâches

- CRUD complet
- Statuts : `todo | in_progress | done | blocked`
- Priorités : `low | medium | high | urgent`
- Lien vers projet (soft reference)
- Créables depuis le chat (tool-use)

### Projets

- CRUD complet
- Statut, date de début, date de fin
- Liste des tâches associées
- Lien contacts ↔ projets : non implémenté

### Contacts

- CRUD complet
- Nom, email, téléphone, société, notes
- Lien contacts ↔ projets : non implémenté

## État actuel

- CRUD tâches / projets / contacts opérationnel.
- Vues liste fonctionnelles.
- Vue Kanban : non implémentée.
- Liens contacts ↔ projets : non implémentés.

## Manquant

1. Vue Kanban pour les tâches.
2. Table de jointure `project_contacts` (contacts ↔ projets).
3. Filtres et recherche sur les listes.
4. Vue projet détaillée (tâches + contacts + timeline).
