# 17 — Chat OS

## Rôle

Cœur du système. 90% des actions doivent être démarrables depuis le chat.  
L'IA doit pouvoir agir, pas seulement répondre.

## Modes de chat

| Mode | System prompt |
|---|---|
| `chat` | Conversation générale |
| `chief_of_staff` | Briefing et conseil |
| `decision` | Aide à la décision |
| `red_team` | Critique et contre-argumentation |
| `execution` | Planification et exécution |

## Tool-use (function calling)

L'IA peut déclencher des actions système :
- `create_task` — créer une tâche
- `create_project` — créer un projet
- `create_contact` — créer un contact
- `create_decision` — créer une décision
- `create_memory` — créer un nœud mémoire
- `search_memories` — chercher dans la mémoire
- `get_briefing` — récupérer le briefing actuel

## Injection mémoire

Avant chaque appel IA, injecter dans le system prompt :
- Tâches actives (5 dernières)
- Projets actifs
- Décisions récentes
- Mémoires pertinentes

## État actuel

- Tool-use fonctionnel (commit `5254126`).
- Injection mémoire opérationnelle.
- Streaming : non implémenté.

## Manquant

- Streaming des réponses (SSE ou WebSocket).
- Historique de conversations persisté par session.
- Recherche dans l'historique.
