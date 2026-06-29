# TAMS — ORGANISATION D'INGÉNIERIE AUTONOME

> Conception CTO. Objectif : que `Continue le développement de TAMS` déclenche une
> organisation d'agents spécialisés qui analyse → planifie → conçoit → (prépare le)
> développement → teste → critique (Red Team) → corrige → valide → mémorise → apprend
> → recommence. **Fiabilité, cohérence, maintenabilité, évolutivité, autonomie.**

## ⚖️ Honnêteté (ce qui est réel aujourd'hui vs à venir)
- ✅ **Réel maintenant** : raisonnement, analyse, planification, architecture-review,
  Red Team, validation, mémorisation, apprentissage — produits par de vrais appels
  au **routeur IA gratuit** (`lib/ai.ts`) et persistés (Décisions / Reflection / Memory).
- 🔒 **Porte de validation humaine (obligatoire)** : écriture de code dans le dépôt,
  `git commit/push`, **déploiement** production. L'app déployée n'a **pas** ces droits.
- 🔌 **Exécution** : confiée à un *Execution Agent* disposant d'un accès dépôt
  (ex : Claude Code, ou un runner CI dédié) qui consomme le **dossier de mission**
  produit par l'organisation. L'architecture le prévoit explicitement (ci-dessous).

## 🏢 L'organisation (agents = rôles, droits limités, aucun agent omnipotent)
| Agent | Mission | Droits | Validation / sortie |
|---|---|---|---|
| **Chief of Staff** | Comprend l'objectif, priorise, arbitre, synthétise, décide la suite | Décision stratégique (seul) | Synthèse + go/no-go |
| **Mission Planner** | Décompose en étapes ordonnées | Proposer | Plan vérifiable |
| **Architect** | Garant de la Constitution (anti-doublon, anti-dette, free-first) | Veto architectural | constraints[], objections[], approved |
| **Product Manager** | Vérifie l'alignement avec la vision | Veto produit | rapproche-vision: oui/non |
| **Research** | Rassemble le contexte / état de l'art gratuit | Lecture | findings[] |
| **Code Engineer** | Conçoit le diff (crée/corrige/refactore/supprime) | **Proposer** (jamais commit direct) | patch proposé + justification |
| **DevOps** | Git, CI, Railway, Supabase, migrations, build, monitoring | **Proposer** (commit/deploy = porte humaine) | plan de déploiement |
| **QA** | Teste réellement (front/back/API/mobile/stream/tool calls) | Bloquer | checklist de tests + résultats |
| **Security** | Secrets, permissions, surface d'attaque, dépendances | Bloquer | findings sécurité |
| **Red Team** | Attaque tout ; refuse une mission non prouvée | **Veto** | attaques[], non-prouvé[], verdict |
| **Reflection** | Qu'a-t-on appris ? quoi améliorer ? quelle erreur bannir ? | Écrit mémoire | learnings → Memory |
| **Memory Manager** | Memory Graph, embeddings, relations, historique | Écrit mémoire | maj connaissances |

## 🔁 Pipeline de mission (aucun raccourci)
```
Analyse → Planification → Architecture → Développement(proposé) → Tests →
Red Team → Corrections → Validation → Mémoire → Apprentissage → Mission suivante
```
Chaque étape = un rôle, une sortie structurée, un critère de passage. Le **Red Team
est obligatoire** et peut renvoyer le dossier en arrière.

## 🧠 Mémoire & apprentissage partagés
Tous les agents partagent : **Memory Graph** (pgvector→Qdrant→Chroma→FAISS) ·
**Decision OS** (décisions persistées) · **Reflection Engine** · **Constitution** ·
**Knowledge Graph**. Après chaque mission : Reflection → Memory → Decision OS →
Chief of Staff. Le système devient progressivement meilleur.

## 🛠️ Runtime & Tool Orchestrator (garde-fous)
- **Runtime** : lance plusieurs agents, gère priorités/timeouts, détecte les blocages,
  reprend/annule/relance, journalise toutes les décisions (Observability + Event Bus).
- **Tool Orchestrator** : **aucun agent n'appelle un outil directement**. Tout passe par
  validation → permissions → timeout → retry → rollback → journalisation → observabilité.
- **AI Router** : choisit le meilleur modèle **gratuit** par tâche (free-first, multi-fournisseurs).

## 🔐 Sécurité (vaut même pour le Chief of Staff)
Un agent ne peut JAMAIS, sans validation explicite : supprimer du code critique ·
modifier l'architecture · déployer · fusionner. Ces actions sont des **portes**, pas
des contournements.

## 📦 Le « dossier de mission » (contrat de sortie)
Une itération produit un objet structuré, persisté et exécutable par un agent à accès dépôt :
`{ objective, analysis, plan[], architecture{constraints,objections,approved},
redTeam{attacks,unproven,verdict}, validation{checklist,humanGates,readyToExecute},
synthesis, learnings }`.

## ✅ Définition du succès
Pouvoir écrire **« Continue le développement de TAMS »** et obtenir un dossier de
mission complet (analyse → priorités → plan → répartition → critique → validation →
mémoire), prêt à être exécuté derrière les portes humaines. Puis recommencer, en
s'améliorant. **Pas plus de code — une organisation durable.**

## État d'implémentation
- ✅ Rôles & pipeline de raisonnement : `lib/agents/*` (definitions, council, planner,
  orchestrator) + `lib/agents/mission.ts` (pipeline de mission) + `POST /api/agents/continue`.
- ✅ Reflection branché sur le Chat + les missions ; décisions persistées.
- 🟡 Tool Orchestrator avec validation/permissions/retry/rollback : à durcir.
- 🟡 Runtime multi-agents (priorités/reprise/annulation) : à étoffer.
- 🔌 Execution Agent (accès dépôt + portes humaines) : à brancher (Claude Code / runner CI).
