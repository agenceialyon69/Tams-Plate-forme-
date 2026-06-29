# 23 — AI Router

## Rôle

Sélectionner le bon modèle IA selon le contexte, le coût et la disponibilité.

## Modèle actuel

```
OpenAI SDK → AI_GATEWAY_URL → google/gemini-2.5-flash
```

Fallback : réponse rule-based si clé absente.

## Logique de routage cible

```typescript
function routeAI(task: AITask): AIProvider {
  if (task.type === 'briefing') return fastModel;   // gemini-flash
  if (task.type === 'decision') return strongModel; // gemini-pro ou local
  if (task.type === 'red_team') return strongModel;
  if (task.type === 'embedding') return embeddingModel;
  return defaultModel;
}
```

## Providers cibles (free-first)

| Provider | Modèle | Coût | Usage |
|---|---|---|---|
| Replit AI Gateway | gemini-2.5-flash | Gratuit | Default |
| Ollama local | Qwen/DeepSeek | Gratuit | Si Ollama dispo |
| OpenRouter | modèles gratuits | Gratuit | Fallback API |

## Implémentation actuelle

`artifacts/api-server/src/lib/ai.ts` — client OpenAI SDK avec model et URL configurables.

## Manquant

- Router formel avec sélection conditionnelle.
- Support Ollama.
- Métriques de coût / latence par provider.
