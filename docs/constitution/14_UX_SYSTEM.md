# 14 — UX System

## Principes

1. **Vitesse perçue** : les actions doivent sembler instantanées (optimistic updates, skeletons).
2. **Contexte permanent** : l'utilisateur sait toujours où il est et ce qu'il peut faire.
3. **Zero dead end** : chaque écran a une action principale visible.
4. **Feedback immédiat** : toast, indicateur, transition après chaque action.
5. **Graceful degradation** : l'UI reste utilisable si l'IA ou le réseau est indisponible.

## Flux prioritaires

### Accueil
`Ouvrir l'app → voir le briefing IA → identifier les priorités → cliquer sur une action → exécuter`

### Chat
`Taper un message → réponse en streaming → l'IA crée une tâche/décision via tool-use → confirmation visible`

### Memory Graph
`Ouvrir le graphe → voir les nœuds et edges → cliquer sur un nœud → voir le détail → créer un lien`

### Decision OS
`Créer une décision → IA génère conseil + red team → voir score analytique → lier à des tâches → archiver`

### Work OS
`Voir les tâches → filtrer par projet → modifier le statut → créer une tâche depuis le chat`

## Règles UX mobile

- Tous les éléments interactifs : min 44px de touch target.
- Inputs : pas de zoom automatique (font-size min 16px).
- Bottom sheet pour les actions secondaires.
- Pull-to-refresh sur les listes.
- Keyboard dismiss sur tap hors input.

## États obligatoires

Chaque composant liste/donnée doit gérer :
- `loading` (skeleton)
- `error` (message + retry)
- `empty` (message + CTA)
- `success` (données)
