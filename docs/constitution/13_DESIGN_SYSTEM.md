# 13 — Design System

## Philosophie

Inspiration : Linear, Arc, Raycast, Perplexity. Jamais un admin dashboard.

- **Mobile-first** : le mobile doit être excellent, pas « acceptable ».
- **Clarté** : chaque écran aide à décider, agir, comprendre vite.
- **Hiérarchie typographique** : taille + poids guident l'œil.
- **Espace blanc** : réduire la charge cognitive.
- **Single Responsibility** : un écran = un seul but.
- **Progressive disclosure** : actions secondaires via drawers/modals.

## Stack UI

| Outil | Usage |
|---|---|
| Tailwind CSS 4 | Styles |
| shadcn/ui (Radix) | Composants de base |
| Framer Motion | Animations |
| Lucide React | Icônes |
| Sonner | Toasts |
| Vaul | Drawers mobile |
| Recharts | Charts |

## Système de couleurs

- Primaire : bleu neutre (`blue-600` / `blue-500`)
- Secondaire : zinc/slate neutres
- Accent : cyan ou emerald selon le contexte
- Succès : `green-500`
- Warning : `amber-500`
- Erreur : `red-500`
- **Jamais violet/indigo** sauf demande explicite.

## Typographie

- Maximum 3 graisses de fonte.
- Line-height corps : 1.5. Titres : 1.2.
- Taille minimum mobile : 14px.

## Espacement

Système 8px : `8, 16, 24, 32, 48, 64px`. Cohérence stricte.

## Règle finale

Si un composant ne serait pas utilisé tous les jours, le simplifier ou le supprimer.
