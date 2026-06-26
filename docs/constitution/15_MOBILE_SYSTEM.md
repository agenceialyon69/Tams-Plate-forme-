# 15 — Mobile System

## Objectif

Expérience native, fluide, haut de gamme. Pas « responsive qui marche » — vraiment premium.

## Navigation

BottomNav avec 5 sections. Actif = indicateur visuel clair. Badge count si nécessaire.  
Fichier : `artifacts/tams/src/components/navigation.tsx`

## Safe Areas

```css
padding-top: env(safe-area-inset-top);
padding-bottom: env(safe-area-inset-bottom);
padding-left: env(safe-area-inset-left);
padding-right: env(safe-area-inset-right);
```

Tailwind : `pb-safe`, `pt-safe` via plugin `tailwindcss-safe-area`.

## Keyboard Handling

- Sur mobile, le keyboard doit pousser le contenu (pas l'overlayer).
- Input chat : `position: sticky; bottom: 0` avec `padding-bottom: env(safe-area-inset-bottom)`.
- Éviter `vh` units — préférer `dvh` (dynamic viewport height).

## Performance

- 60 FPS cible.
- Pas d'animation sur `width`/`height` — utiliser `transform` + `opacity`.
- Lazy-load les pages non-critiques.
- Images : WebP, lazy loading, dimensions explicites.

## Gestes

- Swipe-to-dismiss sur les bottom sheets (Vaul).
- Long-press pour actions secondaires.
- Pull-to-refresh sur listes.

## Touch Targets

Min 44×44px pour tout élément interactif. Privilégier 48px.

## Règles

- Tester sur vrai mobile (iOS Safari + Android Chrome).
- Ne jamais considérer le mobile comme « après desktop ».
- Le mobile est la première surface à valider.
