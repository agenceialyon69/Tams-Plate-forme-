# RUNBOOK TAMS — exploitation & configuration (source unique de vérité)

> TAMS = **OS personnel mono-utilisateur** (Mohamed). **Pas de multi-tenant, pas
> de paiement/quotas, pas de marketplace.** Web + Telegram/Google Sheet en
> priorité, tout en **free-first**. Ce fichier dit quoi configurer sur Railway,
> l'état réel de chaque capacité, et les actions humaines prioritaires.

Dernière mise à jour : 2026-07-06.

---

## 1. 🔴 Les 3 actions humaines prioritaires

1. **Fermer l'accès public** (sinon la plateforme + l'agent codeur sont ouverts à
   qui a l'URL). Voir §2A. → readiness passe de **FAIL** à **PASS**.
2. **Activer la musique réelle** (optionnel) : mettre `HF_TOKEN` (gratuit) sinon
   la musique tombe en repli WAV local (réel mais basique).
3. **Fournir de vraies photos produit** pour la vidéo : le diaporama MP4 est bien
   meilleur avec de vraies images qu'avec des images génératives.

---

## 2. Variables Railway (service API)

### 2A. 🔒 Sécurité — gate d'accès personnel (À FAIRE)
Le gate est **indépendant** de l'auth Supabase et n'est actif que si activé.
| Variable | Valeur | Rôle |
|---|---|---|
| `TAMS_PERSONAL_ACCESS_ENABLED` | `true` | Active le gate (sinon 100% no-op) |
| `TAMS_ADMIN_EMAIL` | *(l'email exact de connexion, ex. `tamsplateforme@gmail.com`)* | Seul email autorisé — **doit correspondre à l'email avec lequel tu te connectes** |
| `TAMS_ADMIN_PASSWORD` | *(mot de passe fort)* | Mot de passe (repli simple, sans hash) |
| `TAMS_SESSION_SECRET` | *(chaîne aléatoire 40+ car.)* | Signe le cookie de session |

> Option plus sûre que le mot de passe en clair : `TAMS_ADMIN_PASSWORD_HASH`
> (généré par `node scripts/hash-admin-password.mjs`). Le code ne met **jamais**
> `REQUIRE_AUTH=false`.

### 2B. Base de données (déjà en place)
| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Postgres (conversations, messages, mémoire). Le serveur **démarre même si la DB est indisponible** (liveness ≠ readiness, pas de crash-loop). |

### 2C. IA — free-first (au moins UNE recommandée)
Routeur multi-fournisseurs, dans l'ordre gratuit d'abord.
| Variable | Fournisseur | Gratuit ? |
|---|---|---|
| `GROQ_API_KEY` | Groq (rapide) | ✅ gratuit |
| `GEMINI_API_KEY` | Google Gemini (vision incluse) | ✅ palier gratuit |
| `OPENROUTER_API_KEY` | OpenRouter (modèles gratuits) | ✅ modèles `:free` |
| `HF_TOKEN` | Hugging Face (musique MusicGen, ASR) | ✅ gratuit |
| `TAVILY_API_KEY` | Recherche web (sinon DuckDuckGo gratuit) | option |

> Sans aucune clé IA, le chat/analyse tombent en dégradé. `TAVILY` est optionnel :
> la recherche web marche en gratuit via DuckDuckGo.

### 2D. Capacités connectées par variable (optionnelles)
| Variable | Débloque |
|---|---|
| `TAMS_TELEGRAM_CAPTURE_SECRET` | Capture Telegram → mémoire |
| `N8N_WEBHOOK_URL` | Automatisations n8n |
| `GITHUB_TOKEN` (+ `GITHUB_REPO`) | Agent codeur : ouvrir des PR |
| `MUSICGEN_WORKER_URL` / `WHISPER_WORKER_URL` / `PIPER_WORKER_URL` | Workers audio/voix externes (sinon HF/local) |
| `STUDIO_GPU_*_URL` | Workers GPU Studio premium (sinon fallback FFmpeg/HF) |

### 2E. Agent codeur — garde-fous (par défaut sûrs)
| Variable | Effet | Défaut conseillé |
|---|---|---|
| `TAMS_DEV_AGENT_PR_WRITE` | Autorise l'ouverture de PR | activer quand prêt |
| `TAMS_DEV_AGENT_CI_WRITE` | Autorise l'écriture CI | prudence |
| `TAMS_DEV_AGENT_SCHEDULER` | Boucle autonome planifiée | `false` tant que non validé |
| `TAMS_ALLOW_PAID_PROVIDERS` | Autorise fournisseurs payants | **laisser non défini** (free-first) |

> Règle absolue : jamais sur `main` directement, jamais de merge automatique,
> confirmation avant action sensible.

---

## 3. État réel des capacités (honnête)

| Capacité | État | Détail |
|---|---|---|
| Chat (mémoire persistante) | ✅ live | localStorage + DB ; les messages ne disparaissent plus |
| Pièces jointes images (vision) | ✅ live | via Gemini |
| Pièces jointes documents (PDF/DOCX/CSV/TXT) | ✅ live | extraction locale injectée au contexte |
| Recherche web | ✅ live | DuckDuckGo (gratuit) / Tavily (si clé) |
| Lire une URL | ✅ live | récupère + résume, anti-SSRF |
| Agent codeur (lire repo, écrire code → PR) | ✅ live | jamais main, jamais merge auto, confirmation |
| Vidéo (Studio + Chat) | ✅ live | vrai MP4 diaporama FFmpeg (pas d'IA premium Veo/Runway) |
| Musique | ✅ conditionnel | HF MusicGen si `HF_TOKEN`, sinon repli WAV local |
| Tâches / projets / contacts / mémoire | ✅ live | |
| Statut CI / santé + Red Team | ✅ live | via Mon Agent |
| Gmail / Google Agenda | ❌ non connecté | affiché honnêtement « à connecter » |
| IA vidéo premium (Veo/Runway/Kling) | ❌ non activé | provider GPU payant requis |
| WhatsApp | ❌ pas maintenant | |

---

## 4. Santé & déploiement
- Liveness : `GET /api/healthz` et `/api/health` (n'exigent pas la DB).
- Le serveur **écoute avant** la connexion DB → pas de crash-loop au boot.
- Médias (MP4/audio) stockés en **temporaire** : peuvent expirer après un
  redéploiement Railway (normal).

## 5. Vérification après déploiement (boucler la boucle)
1. Ouvrir la plateforme → **Mon Agent** visible dans le menu.
2. Chat : envoyer un message, recharger la page → le message est **toujours là**.
3. Chat : joindre un PDF → l'agent en parle réellement.
4. Studio → Vidéo : un **vrai MP4** est produit (plus de bandeau rouge « je ne
   peux pas »).
5. Mon Agent → readiness `personal_access` = **PASS** (après §2A).
