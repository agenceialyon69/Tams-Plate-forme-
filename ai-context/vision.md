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

## Non-objectifs (pour l'instant)
- Pas de refonte structurelle massive du dépôt tant qu'elle n'est pas justifiée.
- Pas de couche IA avancée avant que la base soit stable (Phase 3).
- Pas de features spéculatives.
