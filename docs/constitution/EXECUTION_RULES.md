# TAMS — Règles d'exécution

> Règles non négociables pour tous les agents travaillant sur TAMS.

## Méthode d'exécution

1. Lire la constitution et l'existant.
2. Identifier le plus petit bloc utile.
3. L'implémenter proprement.
4. Vérifier runtime, tests et build.
5. Corriger toute régression.
6. Valider.
7. Committer.
8. Push sur main.
9. Afficher le SHA.
10. Passer au bloc suivant.

## Règle absolue

Ne jamais passer à l'étape suivante tant que la précédente n'est pas réellement stable.

## Définition de terminé

Une étape n'est terminée que si :
- la fonctionnalité est opérationnelle,
- les tests réussissent,
- le build réussit,
- aucune régression n'est dététectée,
- le commit est créé,
- le push est effectué sur main,
- le SHA est affiché,
- une preuve runtime existe.

Sinon, l'étape est non terminée.

## Interdictions

- Zéro raccourci.
- Zéro feature theater.
- Zéro faux DONE.
- Zéro régression.
- Une seule étape à la fois.
- Ne jamais faire plusieurs gros chantiers à la fois.

## Si une zone pose problème

- Si une zone fait cheap, refais-la.
- Si une zone n'est pas claire, simplifie-la.
- Si une fonctionnalité n'apporte pas de valeur quotidienne, supprime-la ou fusionne-la.

## CTO rules

Avant toute nouvelle fonctionnalité :
- chercher si elle existe déjà,
- réutiliser,
- éviter les doublons,
- éviter les dépendances inutiles,
- réduire la complexité,
- garder une architecture simple,
- choisir la solution la plus maintenable.
