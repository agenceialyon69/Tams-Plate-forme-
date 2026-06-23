# Vision — AI STARTUP OS (branding : TAMS)

## Ce que c'est
AI STARTUP OS est un **assistant personnel privé** : un système de capture,
mémoire, décision, recovery et amélioration. Le projet est pour un usage
personnel, totalement gratuit, sans crédit, sans abonnement, sans carte bancaire.

Ce dépôt n'est **pas un SaaS multi-tenant** (pour l'instant) : c'est un
assistant IA personnel avec des capacités de copilote, audit, génération
média et gouvernance. Le branding visible est **TAMS**.

## Capacités principales
- **Dashboard** : aperçu premium avec actions principales (Capturer, Consulter,
  Décider, Récupérer)
- **Copilot** : assistant IA multi-modèles (Gemini/Groq/DeepSeek/Ollama) avec
  mémoire conversationnelle et mode Audit Red Team
- **Upload & Analyse** : dépôt de fichiers (images, PDF, vidéo, audio) pour
  analyse de risques et recommandations
- **Recovery** : export ZIP complet de toutes les données (database, mémoire,
  événements, décisions) pour restauration
- **Studio** : génération d'images et vidéos produit (gratuit via Pollinations)
- **Gouvernance** : audit trail, red team, observabilité

## Utilisateurs cibles
- Usage personnel uniquement (multi-tenant différé).
- Pas d'inscription publique, pas de paywall.

## Principe directeur
**Gratuit d'abord**. Tout outil doit être gratuit (open source / auto-hébergé).
Simplicité maximale, scope strict, stabilité avant intelligence.
Une feature = un cycle complet (voir `rules.md`).

## 🚫 Non-objectifs actifs
Ce qu'on refuse/reporte explicitement (multi-tenant différé, pas d'inscription
publique, **pas de payant**, pas de natif mobile, pas de temps réel, pas de
doublon d'analytics…). **Détail complet et à jour : `non-objectifs.md`.**
À relire avant toute nouvelle feature.

## Stack gratuite
- **IA** : Gemini (gratuit), Groq (gratuit), OpenRouter (DeepSeek gratuit),
  Ollama (local)
- **Média** : Pollinations (images gratuites), FFmpeg (vidéo local)
- **Base** : PostgreSQL (Supabase gratuit), Drizzle ORM
- **Frontend** : React + Vite + Tailwind (shadcn/ui)
