# 36 — Free-Stack Standard (OBLIGATOIRE — zéro payant)

> Règle absolue : **aucune dépendance payante obligatoire.** Le système doit rester fonctionnel avec une stack gratuite, freemium ou auto-hébergeable. Tout fournisseur cloud avancé doit rester optionnel, jamais requis pour démarrer.

## Critères d'acceptation d'un outil

Pour chaque besoin, l'outil retenu doit être : gratuit ou utilisable avec un palier gratuit, sans abonnement obligatoire, sans carte bancaire obligatoire si possible, et de préférence open source / auto-hébergeable. En cas de choix multiple : le plus pérenne et le plus contrôlable.

## Stack autorisée

| Besoin | Outil(s) gratuits | Rôle | État |
|---|---|---|---|
| LLM local | Ollama | raisonnement, chat, agents | prévu/local |
| LLM cloud gratuit/freemium | Groq, Gemini, OpenRouter free, Hugging Face | accélérateurs optionnels | branché selon config |
| Image | Pollinations | image gratuite sans clé | branché |
| Vidéo | FFmpeg | MP4 réel slideshow / encodage | branché |
| Vidéo avancée | Remotion worker | rendu avancé optionnel | optionnel |
| Musique | Hugging Face MusicGen ou worker MusicGen | audio génératif | bridge branché |
| Transcription | Whisper/Faster-Whisper worker | voix → texte | bridge branché |
| Voix | Piper/TTS/Edge TTS worker | texte → voix | bridge branché |
| Recherche web | DuckDuckGo, Tavily optionnel | recherche / grounding | branché |
| Automatisation | n8n Community webhook | workflows | bridge branché |
| Base de données | PostgreSQL / Supabase Free | persistance | branché |
| Mémoire vectorielle | pgvector | Memory Graph / RAG | branché |
| Observabilité | système interne + futur OpenTelemetry/Prometheus/Grafana | métriques, traces, dashboards | partiel |
| CI/E2E | GitHub Actions + Playwright | validation automatique | branché |

## Interdit

- Toute API à paiement obligatoire comme dépendance dure.
- Coder en dur une dépendance cloud requise pour qu'une fonctionnalité critique marche.
- Faire croire qu'une capacité est opérationnelle si elle n'a qu'un plan ou un bridge non configuré.
- Réintroduire le SDK OpenAI comme dépendance centrale obligatoire.

## AI Router

Le routeur choisit automatiquement le meilleur modèle gratuit/freemium selon la tâche. L'utilisateur ne doit pas gérer les modèles. Si aucun fournisseur n'est configuré, la dégradation doit être claire et non opaque.

### Implémenté : `artifacts/api-server/src/lib/ai.ts`

Routeur free-first multi-fournisseurs, OpenAI-compatible par `fetch`, avec fallback en chaîne. Sélection du modèle par tâche (`chat`, `fast`, `reasoning`, `json`).

## Provider bridges ajoutés

### `video.generate`

- Chemin réel actuel : FFmpeg slideshow.
- Peut produire un MP4 réel.
- Remotion reste une amélioration optionnelle, pas la base obligatoire.

### `search.web`

- Chemin gratuit : DuckDuckGo Instant Answer.
- Chemin enrichi optionnel : Tavily si configuré.

### `automation.workflow`

- Chemin réel : webhook n8n.
- Sans webhook configuré : la capacité doit répondre configuration manquante, pas faux succès.

### `audio.music.generate`

- Chemin gratuit/freemium : Hugging Face MusicGen si configuré.
- Chemin stable : worker MusicGen externe.
- Pas de MusicGen GPU local directement sur Railway.

### `voice.transcribe`

- Chemin réel : worker Whisper/STT.
- Nécessite une URL audio et un worker.

### `audio.synthesize`

- Chemin réel : worker TTS/Piper/Edge TTS.
- Nécessite un worker configuré.

## Diagnostic

- `GET /api/registry/status` : stratégie providers/capacités.
- `GET /api/registry/capabilities` : vérité des capacités.
- `GET /api/registry/providers` : vérité des providers.
- `GET /api/system/ai` : statut IA.
- `GET /api/system/validate` : VIS.
- `GET /api/system/selftest` : test fonctionnel réel.

## Règle Red Team

La Constitution préfère un système honnête, limité et stable à une plateforme qui affiche des boutons spectaculaires mais faux. Une capacité peut être :

- `success` si elle fonctionne réellement ;
- `missing_config` si le handler existe mais la config manque ;
- `planned` si rien n'est encore branché ;
- `read_only` si elle observe sans modifier ;
- `plan_only` si elle produit seulement un plan.
