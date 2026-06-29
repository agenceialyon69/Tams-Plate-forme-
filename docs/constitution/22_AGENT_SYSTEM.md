# 22 — Système d'agents

## Définition

Un agent TAMS = une séquence de steps IA avec accès aux outils, capable de compléter une tâche multi-étapes sans intervention humaine à chaque step.

## Agents actuellement impliqués

| Agent | Rôle | Implémentation |
|---|---|---|
| Chief of Staff | Génère le briefing quotidien | `routes/briefing.ts` |
| Chat Agent | Répond + déclenche tool-use | `routes/chat.ts` |
| Decision Advisor | Double appel parallèle (conseil + red team) | `routes/decisions.ts` |

## Architecture cible

```
User input
  → AI Router (sélection modèle + mode)
  → Agent (system prompt + contexte injecté)
  → Tool System (function calling)
  → DB (lecture/écriture)
  → Response (streaming)
```

## Règles

- Chaque agent a un system prompt distinct dans `25_PROMPT_LIBRARY.md`.
- Chaque agent doit avoir un fallback si l'IA est indisponible.
- Chaque agent log ses appels dans la table `activity`.
- Pas d'agent sans outil — un agent sans capacité d'action est un simple chat.

## Manquant

- Agent de planification (décompose un objectif en tâches).
- Agent de recherche (SearXNG + synthèse).
- Agent de monitoring (alerte si une tâche est en retard ou bloquée).
