# 36 — Free-Stack Standard (OBLIGATOIRE — zéro payant)

> Règle absolue : **aucune dépendance payante obligatoire.** Le système doit
> rester pleinement fonctionnel avec une stack 100 % gratuite et
> auto-hébergeable. Tout fournisseur cloud est **optionnel** et activé par
> feature-flag — jamais requis.

## Critères d'acceptation d'un outil
Pour chaque besoin, l'outil retenu doit être : **gratuit**, sans abonnement
obligatoire, sans carte bancaire, sans crédits mensuels imposés, et de préférence
**open source / auto-hébergeable**. En cas de choix multiple : le plus pérenne.

## Stack autorisée (par point fort)
| Besoin | Outil(s) gratuits | Rôle |
|---|---|---|
| LLM local | **Ollama** (Qwen 3, DeepSeek, Llama, Mistral) | raisonnement, chat, agents — auto-hébergé |
| LLM cloud gratuit | **Groq**, **Gemini** (quota gratuit), **OpenRouter** (modèles `:free` uniquement) | accélérateurs optionnels |
| Transcription | **Whisper / Faster-Whisper** (auto-hébergé) | voix → texte |
| Recherche web | **SearXNG** (auto-hébergé) | recherche, grounding |
| Base de données | **PostgreSQL** (+ **Supabase Free** possible) | persistance |
| Mémoire vectorielle | **pgvector** (dans Postgres) | Memory Graph / RAG, sans service externe |
| Automatisation | **n8n Community** | workflows |
| Média | **FFmpeg** | vidéo/audio/images (montage, encodage) |
| Observabilité | **OpenTelemetry**, **Prometheus**, **Grafana** | métriques, traces, dashboards |

## Interdit
- ❌ Toute API à **paiement obligatoire** (ex. OpenAI payant, services « pay-as-you-go » sans palier gratuit réel).
- ❌ Coder en dur une dépendance cloud requise pour qu'une fonctionnalité marche.
- ❌ Le **SDK `openai`** comme dépendance : on utilise un client **OpenAI-compatible par `fetch`** pointé vers un fournisseur gratuit (Ollama/Groq/Gemini/OpenRouter free).

## AI Router (Pilier 8) — implication
Le routeur choisit automatiquement le meilleur modèle **gratuit** selon la tâche.
L'utilisateur ne choisit pas. Ordre de repli type : Ollama (local) → Groq →
Gemini free → OpenRouter free. Si aucun n'est configuré, dégrader proprement
(réponse déterministe + message clair), jamais d'erreur opaque.

### Implémenté : `artifacts/api-server/src/lib/ai.ts`
Routeur free-first multi-fournisseurs, OpenAI-compatible par `fetch`, avec
**fallback en chaîne** (le premier fournisseur qui répond gagne). Sélection du
modèle gratuit **par tâche** (`chat` | `fast` | `reasoning` | `json`). Le `model`
passé par l'appelant est un simple indice — remplacé par le modèle adapté au
fournisseur retenu.

**Variables d'environnement** (toutes optionnelles ; activer celles voulues) :

| Var | Fournisseur | Notes |
|---|---|---|
| `AI_BASE_URL` (+ `AI_API_KEY`, `AI_MODEL`) | override explicite | Ollama distant, passerelle perso… respecte `AI_MODEL` |
| `OLLAMA_BASE_URL` (+ `OLLAMA_MODEL`, `OLLAMA_MODEL_FAST`, `OLLAMA_MODEL_REASONING`) | Ollama local | inclus seulement si défini (évite timeouts sur Railway) |
| `GROQ_API_KEY` | Groq | quota gratuit, très rapide |
| `GEMINI_API_KEY` | Gemini | quota gratuit (endpoint OpenAI-compatible) |
| `OPENROUTER_API_KEY` (+ `OPENROUTER_REFERER`) | OpenRouter | modèles `:free` **uniquement** |

Rétro-compat : `AI_GATEWAY_URL`, `REPLIT_AI_API_KEY`.

**Diagnostic** : `GET /api/system/ai` → `{ configured, providers[], primary, hint }`.
Si aucun fournisseur n'est configuré, `hint` explique quoi définir (jamais
d'échec silencieux — Pilier 7).
