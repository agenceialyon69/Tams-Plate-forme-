# ai-context — mémoire & gouvernance du projet

Ce dossier est la **source de vérité** du projet. Il permet à n'importe quel
humain — ou n'importe quelle IA — de comprendre le produit, son état et ses
règles **sans contexte externe**, et de reprendre le travail à tout moment.

> Règle d'or : **lire ces fichiers avant d'agir, les mettre à jour après.**

## Les fichiers

| Fichier | À quoi il sert | Quand le mettre à jour |
|---|---|---|
| **`vision.md`** | Le « pourquoi » : but du produit, public, principes directeurs. | Rarement (changement de cap). |
| **`architecture.md`** | Le « comment » : stack, structure des dossiers, choix techniques, déploiement. | À chaque changement structurel. |
| **`roadmap.md`** | La direction à moyen terme (phases, grandes étapes). | Quand les priorités évoluent. |
| **`progress.md`** | L'état **vivant** : `DONE` / `IN PROGRESS` / `NEXT` / `BLOCKERS`. C'est le fichier le plus consulté au quotidien. | **À chaque cycle / feature.** |
| **`changelog.md`** | L'historique daté des changements majeurs (réf. PR). | À chaque feature livrée. |
| **`rules.md`** | Les règles d'exécution : boucle Analyse→RedTeam→…→Commit, sécurité, « 1 feature = 1 commit », free-first. | Rarement. |
| **`decisions.md`** | Registre des décisions (ADR léger) : *pourquoi* le code est ainsi. | À chaque décision structurante. |
| **`schemas.md`** | Modèle de données (tables PostgreSQL, conventions). | À chaque changement de schéma. |
| **`runbook.md`** | Exploitation & incidents : déploiement, secrets, pannes fréquentes, rollback. | Quand l'ops évolue. |
| **`free-stack.md`** | Politique « gratuit d'abord » + outils/alternatives gratuits retenus. | Quand un outil change. |
| **`multi-tenant-plan.md`** | Plan de migration multi-tenant (différé : l'app est en mode perso/test). Concept conservé. | Avant d'ouvrir le multi-clients. |

> ⚠️ Avant toute nouvelle feature, relire les **« Non-objectifs actifs »** de
> `vision.md` : si la demande y retombe, elle est reportée, pas codée.

## Boucle d'exécution (résumé de `rules.md`)

```
Analyse → Red Team → Decision Gate → Implémentation → Tests (typecheck/build/smoke)
→ Commit → Push → mettre à jour progress.md → vérifier stabilité → tâche suivante
```

## Démarrage rapide pour un nouveau venu

1. Lis `vision.md` (2 min) → tu sais ce qu'on construit et pourquoi.
2. Lis `progress.md` → tu sais où on en est et quelle est la prochaine tâche.
3. Lis `architecture.md` → tu sais où vit le code et comment ça tourne.
4. Respecte `rules.md` → tu livres proprement (CI verte, un commit par feature).

Voir aussi la racine du dépôt : `README.md` (démarrage), `SETUP.md` (installation
pas-à-pas) et `.env.example` (toutes les variables d'environnement documentées).
