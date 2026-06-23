# Project-config — modes, flags, intégrations & déploiement

Vue d'ensemble de la configuration. **Source de vérité des valeurs :
`.env.example`** (toutes les variables y sont documentées). Ce fichier en donne
la lecture « modes & paramètres » pour reprise rapide — il ne duplique pas les
valeurs.

## Modes actifs
| Mode | État | Réf |
|---|---|---|
| Déploiement | **service unique** Railway (API sert le front) | ADR-001 |
| Accès | **mono-utilisateur**, inscription **fermée** (bootstrap + code owner) | ADR-003 |
| Multi-tenant | **différé** (isolation non appliquée) | ADR-005, `multi-tenant-plan.md` |
| Outils/IA | **free-first** (gratuit par défaut) | ADR-008 |

## Variables requises (le serveur démarre avec)
`DATABASE_URL` · `API_AUTH_TOKEN` (≥16, = clé maître owner) ·
`JWT_SECRET` (≥32, sinon dérivé) · `PORT` · `BASE_PATH=/`.

## Fournisseurs IA (≥1 pour le Copilot ; tous gratuits)
Gateway `lib/llm.ts`, sélection via `AI_PROVIDER` (auto = gemini→groq→openrouter→ollama).
| Variable | Fournisseur |
|---|---|
| `GEMINI_API_KEY` | Gemini (Google) |
| `GROQ_API_KEY` | Groq (Llama/Qwen) + transcription Whisper |
| `OPENROUTER_API_KEY` | OpenRouter (DeepSeek R1, Qwen) — sans serveur |
| `OLLAMA_BASE_URL` | Ollama (local) |

## Intégrations (feature-flag, off par défaut, owner/admin)
| Intégration | Activation | Défaut |
|---|---|---|
| GitHub | `GITHUB_TOKEN` | off |
| FFmpeg (vidéo/audio) | binaire (nixpacks) | auto |
| Génération d'images | `ENABLE_IMAGE_GENERATION` (≠ false) · Pollinations sans clé / `HUGGINGFACE_API_KEY` | on (keyless) |
| Vidéo produit | FFmpeg + génération d'images | suit ci-dessus |
| Recherche web | `WEB_SEARCH_PROVIDER` · `TAVILY_API_KEY`/`BRAVE_API_KEY`/`SEARXNG_URL` (sinon DuckDuckGo sans clé) | on (keyless) |
| Personas produit | `ENABLED_PRODUCTS` (vide = toutes) | toutes |

> État réel en prod : page **Paramètres → Configuration IA & Intégrations** ou
> `GET /api/integrations/status`.

## Déploiement
- `railway.toml` (build front+API, `prune --prod`), `nixpacks.toml`
  (`pnpm install --no-frozen-lockfile`, `aptPkgs=["ffmpeg"]`).
- Healthcheck `/api/healthz`. Détail incidents : `runbook.md`.

## Réseau (egress) — requis pour images/vidéo/recherche web
Hôtes à autoriser si politique restrictive : `image.pollinations.ai`,
`api-inference.huggingface.co`, `openrouter.ai`, `api.tavily.com`,
`api.search.brave.com`, `api.duckduckgo.com`. Railway autorise le sortant par
défaut.
