# 24 — Tool System

## Définition

Les tools (function calling OpenAI) permettent à l'IA d'agir directement sur le système TAMS.

## Tools implémentés (commit `5254126`)

| Tool | Action | Route API |
|---|---|---|
| `create_task` | Créer une tâche | `POST /api/tasks` |
| `create_project` | Créer un projet | `POST /api/projects` |
| `create_contact` | Créer un contact | `POST /api/contacts` |
| `create_decision` | Créer une décision | `POST /api/decisions` |
| `create_memory` | Créer un nœud mémoire | `POST /api/memories` |
| `search_memories` | Chercher dans la mémoire | `GET /api/memories?q=` |
| `get_briefing` | Récupérer le briefing actuel | `GET /api/briefing` |

## Pattern d'implémentation

```typescript
// 1. Définir le tool dans le system prompt
const tools = [{ type: 'function', function: { name: 'create_task', parameters: schema } }];

// 2. Appel IA avec tools
const response = await ai.chat.completions.create({ model, messages, tools });

// 3. Exécuter le tool call si présent
if (response.choices[0].finish_reason === 'tool_calls') {
  const toolCall = response.choices[0].message.tool_calls[0];
  await executeTool(toolCall.function.name, JSON.parse(toolCall.function.arguments));
}
```

## Manquant

- `update_task` — modifier le statut d'une tâche.
- `search_tasks` — chercher des tâches.
- `get_decisions` — lister les décisions en cours.
- `create_memory_edge` — créer une relation entre deux mémoires.
