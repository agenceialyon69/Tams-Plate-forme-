# Dev Agent — chemin proche de Claude Code

## Objectif

Construire progressivement un agent interne capable de comprendre un dépôt, planifier une tâche, proposer un patch, valider et réparer, tout en restant borné par une permission explicite.

## Modules nécessaires

1. Repo Intelligence — index, recherche, dépendances et contexte.
2. Task Planner — plan vérifiable, critères de succès et limites.
3. Patch Engine — modifications ciblées sur une branche dédiée.
4. Validation Engine — typecheck, build, tests et smokes.
5. Error Repair Loop — lecture des erreurs, correction bornée, nouvelle validation.
6. GitHub Operator — branches, commits, PR et revues ; jamais de push direct dangereux.
7. Railway Operator — statut, logs, healthcheck et rollback, en lecture seule par défaut.
8. Permission Layer — read_only, propose_patch, approved_write et refus des actions critiques.

## État actuel

TAMS possède déjà un Development Runtime, un Kernel, un routeur d'intentions, une couche de permissions, des validations, un bridge Chat authentifié et des opérations GitHub/Railway décrites en lecture seule.

## Manques

- Ownership conversation/utilisateur prouvé en base.
- Workspace isolé et durable par mission.
- Patch Engine réellement transactionnel.
- Boucle de réparation basée sur les logs CI.
- Opérateurs GitHub/Railway avec permissions minimales et audit immuable.
- E2E navigateur authentifié et approbation humaine des écritures.

## Prochaine implémentation recommandée

Commencer par l'ownership et l'isolation des workspaces. Ajouter ensuite un Patch Engine limité aux branches `codex/*`, puis brancher Validation Engine et Error Repair Loop. GitHub Operator vient après, Railway Operator en dernier.

## Risques de sécurité

Injection de prompt, exfiltration de secrets, confusion d'identité, écriture hors périmètre, push vers `main`, commandes destructrices et boucles de réparation incontrôlées.

## Ordre de construction

Ownership → workspace isolé → permissions → Repo Intelligence → Task Planner → Patch Engine → Validation → Repair Loop → GitHub Operator → Railway Operator → E2E et audit.


## Minimum réellement branché

Dans Agents, une demande d’analyse de dépôt déclenche maintenant un fallback read-only structuré :

`scan → risques → plan → patch proposé → tests → PR`.

Le résultat précise explicitement que Repo Intelligence et Validation Engine existent partiellement, tandis que Patch Engine transactionnel, GitHub Operator et Railway Operator ne sont pas encore connectés pour une exécution autonome. Aucune modification du dépôt n’est promise sans ownership, permission d’écriture et validation humaine.
