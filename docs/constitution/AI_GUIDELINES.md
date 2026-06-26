# TAMS — Guidelines IA

> Règles pour l'intégration IA dans TAMS.

## Modèle actuel

- OpenAI SDK, model `google/gemini-2.5-flash`
- Via `AI_GATEWAY_URL` + `REPLIT_AI_API_KEY` (Replit AI Gateway)
- Fallback : réponse canned si pas de clé API

## Philosophie free-first

Privilégier en priorité :
- Ollama (local), Qwen, DeepSeek
- OpenRouter gratuit si utile
- Le modèle actuel (gemini-2.5-flash via Replit) est acceptable car gratuit sur Replit

Jamais de dépendance payante obligatoire. Si une solution gratuite existe, l'utiliser.

## Règles d'intégration

1. **Chaque écran important doit apporter de l'intelligence.** Afficher des données ne suffit pas.
2. L'IA doit : analyser, anticiper, prioriser, critiquer, recommander, automatiser.
3. Le chat doit pouvoir déclencher la majorité des actions (tool-use / function-calling).
4. L'IA doit avoir accès au contexte (mémoire, tâches, projets, contacts, décisions).
5. Toujours prévoir un fallback gracieux si l'IA est indisponible.

## Modes de chat

5 modes avec system prompts distincts :
- `chat` — conversation générale
- `chief_of_staff` — briefing et conseil
- `decision` — aide à la décision
- `red_team` — critique et contre-argumentation
- `execution` — planification et exécution

## Decision OS

Double appel IA parallèle :
1. Strategic advisor → `ai_advice`
2. Red Team critic → `red_team_advice`

## Ce qui manque (priorité)

- Briefing Accueil non-AI (hardcoded) — doit devenir AI-generated
- Chat sans tool-use — l'IA ne peut pas agir sur le système
- Chat sans injection mémoire — l'IA ne connaît pas le contexte utilisateur
- Decision OS : confidence score aléatoire — doit être analytique
