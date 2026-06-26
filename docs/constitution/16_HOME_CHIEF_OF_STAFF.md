# 16 — Home — Chief of Staff

## Rôle

Premier écran ouvert chaque matin. Doit répondre en 3 secondes à : « Quoi faire aujourd'hui ? »

## Contenu du briefing (IA-generated)

- Résumé de la situation (projets actifs, tâches en retard, décisions en attente)
- Priorités du jour (3 maximum)
- Risques identifiés
- Recommandation principale
- Météo opérationnelle (charge, urgences)

## Architecture

- Route : `GET /api/briefing` → génère le briefing via IA à partir des vraies données DB.
- Fallback rule-based si IA indisponible.
- Cache 1h : ne pas re-générer à chaque reload.
- Frontend : `artifacts/tams/src/pages/accueil.tsx`

## État actuel

- Briefing IA fonctionnel (commit `4a0204f`).
- Fallback rule-based opérationnel.

## Manquant

- Streaming du briefing.
- Indicateur de fraîcheur (« généré il y a 12min »).
- Actions rapides depuis l'accueil (créer tâche, lancer une décision).

## Règle

Le Chief of Staff ne doit pas afficher de données brutes. Il doit **interpréter** et **prioriser**.
