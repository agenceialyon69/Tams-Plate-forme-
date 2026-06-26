# 03 — Règles d'ingénierie

## Méthode d'exécution

1. Lire la constitution et l'existant.
2. Identifier le plus petit bloc utile.
3. Implémenter proprement.
4. Vérifier runtime, build, types.
5. Corriger toute régression.
6. Committer + push main.
7. Afficher le SHA.
8. Passer au bloc suivant.

## Définition de terminé (DoD)

Une étape est terminée uniquement si :
- la fonctionnalité est opérationnelle en runtime,
- le build TypeScript réussit sans erreurs,
- aucune régression introduite,
- commit créé et pushé sur main avec SHA.

## Interdictions absolues

- Zéro feature theater (écrans décoratifs sans valeur).
- Zéro faux DONE (preuve runtime obligatoire).
- Zéro régression tolérée.
- Une seule étape active à la fois.
- Ne jamais pousser du code cassé sur main.
- Ne jamais créer de doublon de fonction existante.
- Ne jamais créer de dépendance payante obligatoire.
- Ne jamais supposer une structure non présente.

## Règle architecturale CTO

Avant toute nouvelle fonctionnalité :
1. Vérifier si elle existe déjà.
2. Réutiliser ou étendre plutôt que dupliquer.
3. Choisir la solution la plus maintenable.
4. Réduire la complexité, pas l'augmenter.
5. La performance compte — ne pas ignorer les N+1, les re-renders inutiles.

## Récupération après erreur

- Diagnostiquer la cause racine avant de corriger.
- Ne jamais masquer une erreur avec un try/catch vide.
- Toujours exposer un état d'erreur visible à l'utilisateur.
