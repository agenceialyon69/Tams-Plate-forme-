# Vision — AI STARTUP OS (branding : TAMS)

## Ce que c'est
AI STARTUP OS est un **template SaaS réutilisable** : une base produit propre,
modulaire et stable, destinée à servir de socle à plusieurs produits verticaux
(CRM local, assistant métier, copilote IA, automatisation, etc.).

Ce dépôt n'est **pas une application unique** : c'est une fondation que l'on
adapte rapidement à un cas d'usage. Le branding visible est **TAMS**.

## Utilisateurs cibles
- Solo founder / petite équipe lançant un SaaS B2B vertical.
- Cas d'usage initiaux envisagés : assistant dentaire, Shopify AI assistant,
  garage management, CRM local, outils business verticaux.

## Produit actuel (réalité)
Aujourd'hui le dépôt contient une application fonctionnelle « TAMS » (issue d'un
copilote personnel) avec : auth multi-rôles, tableau de bord, prospection
(leads), captures/tâches/mémoire, recordings, et une couche gouvernance
(audit, quotas, kill-switch, registry, approbations). Déployée en service unique
sur Railway (API Express qui sert aussi le front).

## Principe directeur
Simplicité maximale, scope strict, stabilité avant intelligence, template avant
expérimentation. Une feature = un cycle complet (voir `rules.md`).

## 🚫 Non-objectifs actifs (à relire avant toute nouvelle feature)
Ce qu'on **refuse explicitement** maintenant — non par manque d'intérêt, mais
par discipline de scope. Toute demande qui retombe ici est reportée, pas codée.

1. **Multi-tenant / multi-clients** : isolation `tenantId` non faite sur les
   tables data → l'app reste **mono-utilisateur** (inscription fermée). Plan
   prêt dans `multi-tenant-plan.md`, exécution différée. **Bloquant avant
   ouverture publique.**
2. **Inscription publique ouverte** : fermée par défaut (bootstrap 1er compte +
   code propriétaire). On ne l'ouvre pas avant le multi-tenant.
3. **Services payants** : interdits par défaut. Tout outil/IA doit être gratuit
   (voir `free-stack.md`). Exception seulement si le gratuit est insuffisant /
   instable / incompatible avec une contrainte documentée.
4. **Vrai texte→vidéo IA** (Sora/Runway/Pika…) : payant → hors-scope. La voie
   retenue est images gratuites + montage FFmpeg.
5. **Refonte structurelle massive** du dépôt sans justification red-team.
6. **App native mobile** : on reste en **PWA** (installable, mobile-first).
7. **Temps réel / collaboratif** (websockets multi-utilisateurs, présence…).
8. **Features spéculatives** : pas de code « au cas où ». Une feature = un besoin
   réel + un cycle complet (voir `rules.md`).

## Non-objectifs (rappels techniques)
- Pas de couche IA avancée avant que la base soit stable (Phase 3).
