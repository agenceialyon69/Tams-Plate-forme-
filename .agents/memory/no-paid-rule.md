---
name: No-paid rule
description: Règle absolue projet TAMS — rien de payant, tout gratuit et auto-hébergeable
---

## Règle

Ne jamais ajouter de fonctionnalité nécessitant un abonnement, des crédits IA ou une carte bancaire.

**Why:** L'utilisateur a explicitement demandé que la plateforme reste 100% gratuite et auto-hébergeable. C'est une contrainte non négociable, confirmée à plusieurs reprises.

**How to apply:**
- Priorité aux outils libres : Ollama, DeepSeek, Qwen, Llama, Whisper (self-hosted), FFmpeg, PostgreSQL, n8n, SearXNG
- Les IA payantes (Gemini, Groq, OpenAI) restent OPTIONNELLES uniquement (pas de chemin critique)
- Avant d'ajouter une dépendance ou intégration, vérifier : est-ce gratuit sans limite d'utilisation ?
- Si une feature ne peut être faite qu'avec un service payant, NE PAS l'ajouter — proposer l'alternative libre

## Exemples d'alternatives libres obligatoires
- Transcription : Whisper self-hosted (pas Groq Whisper en production critique)
- LLM : Ollama + Qwen/Llama (pas OpenAI en chemin critique)
- Vidéo : FFmpeg (pas CapCut/RunwayML)
- Images : Stable Diffusion self-hosted ou API libre (pas DALL-E)
- DB : PostgreSQL / SQLite (pas Supabase payant)
