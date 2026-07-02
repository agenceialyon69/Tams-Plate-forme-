# 00 — READ FIRST

> Point d'entrée obligatoire. Lire avant tout travail sur TAMS.

## Source de vérité

Dépôt : `https://github.com/agenceialyon69/Tams-Plate-forme-.git`  
Branche de livraison : `main`  
Dernier registre d'implémentation : `37_IMPLEMENTATION_LEDGER_2026-07-02.md`

## Index constitution

| # | Fichier | Contenu |
|---|---|---|
| 00 | `00_READ_FIRST.md` | Ce fichier — index et règles d'entrée |
| 01 | `01_MISSION.md` | Mission, utilisateur unique, règle finale |
| 02 | `02_PRODUCT_VISION.md` | Vision produit, modules prioritaires |
| 03 | `03_NORTH_STAR.md` | Les capacités indispensables |
| 04 | `04_10_PILLARS.md` | Détail de chaque pilier |
| 05 | `05_ENGINEERING_RULES.md` | Règles d'exécution ingénierie |
| 06 | `06_GITHUB_STANDARD.md` | Workflow GitHub, commits, SHA |
| 07 | `07_RAILWAY_STANDARD.md` | Déploiement Railway, build, env vars |
| 08 | `08_ARCHITECTURE.md` | Stack, monorepo, tables DB, API |
| 09 | `09_DATABASE.md` | Schéma DB complet, règles Drizzle |
| 10 | `10_API_STANDARD.md` | Contrat API, conventions, codegen |
| 11 | `11_SECURITY_STANDARD.md` | Sécurité, secrets, surface d'attaque |
| 12 | `12_RED_TEAM_STANDARD.md` | Audit modules, posture Red Team |
| 13 | `13_TESTING_STANDARD.md` | Tests, CI, validation runtime |
| 14 | `14_RUNTIME_VALIDATION.md` | Healthcheck, monitoring, alertes |
| 15 | `15_DESIGN_SYSTEM.md` | Design system, composants, couleurs |
| 16 | `16_UX_SYSTEM.md` | UX, flux, interactions, progressive disclosure |
| 17 | `17_MOBILE_SYSTEM.md` | Mobile premium, safe areas, gestes |
| 18 | `18_HOME_CHIEF_OF_STAFF.md` | Module Accueil — Chief of Staff |
| 19 | `19_CHAT_OS.md` | Chat central — cœur du système |
| 20 | `20_MEMORY_GRAPH.md` | Memory Graph — mémoire relationnelle |
| 21 | `21_DECISION_OS.md` | Decision OS — décisions structurées |
| 22 | `22_WORKSPACE.md` | Work OS — tâches, projets, contacts |
| 23 | `23_STUDIO.md` | Studio — assets créatifs |
| 24 | `24_AGENT_SYSTEM.md` | Système d'agents |
| 25 | `25_AI_ROUTER.md` | AI Router — routage des modèles |
| 26 | `26_TOOL_SYSTEM.md` | Tool System — function calling |
| 27 | `27_PROMPT_LIBRARY.md` | Prompt Library |
| 28 | `28_OBSERVABILITY.md` | Logs, audit, stats |
| 29 | `29_RECOVERY.md` | Recovery — export et restauration |
| 30 | `30_EXPORT_SYSTEM.md` | Export complet du système |
| 31 | `31_LONG_TERM_ROADMAP.md` | Roadmap long terme |
| 32 | `32_FINAL_ACCEPTANCE.md` | Critères d'acceptation finale |
| 33 | `33_RED_TEAM_AUDIT_2026-06-26.md` | Audit Red Team initial |
| 34 | `34_RED_TEAM_REPORT_2026-06-26_FIXES.md` | Audit post-corrections |
| 35 | `35_STATE.md` | État vivant : fait / en cours / reste |
| 36 | `36_FREE_STACK.md` | Stack gratuite obligatoire |
| 37 | `37_IMPLEMENTATION_LEDGER_2026-07-02.md` | Registre des lots réellement construits et validés |

## Les 11 piliers

TAMS = AI Operating System **personnel**. Les 11 piliers :

1. Chief of Staff  
2. Chat OS  
3. Agent System  
4. Memory Graph  
5. Decision OS  
6. Workspace  
7. Studio  
8. AI Router  
9. Mobile Premium  
10. Platform OS  
11. Personal Life OS : santé, famille, finances, admin, carrière, apprentissage.

> Chaque ligne de code doit améliorer au moins un pilier. Sinon, ne pas la développer.

## Règles d'entrée

1. Lire `35_STATE.md` avant de commencer.
2. Lire le registre `37_IMPLEMENTATION_LEDGER_2026-07-02.md` pour éviter de reconstruire ce qui existe déjà.
3. Garder `main` comme source de vérité.
4. Utiliser des branches temporaires uniquement pour PR + CI + validation.
5. Zéro payant obligatoire : voir `36_FREE_STACK.md`.
6. Lire aussi `01_MISSION.md`, `08_ARCHITECTURE.md` et le fichier du module concerné.
7. Ne jamais supposer une structure absente du dépôt réel.
8. Ne jamais livrer du travail cassé : build + typecheck + smoke + validation production si possible.
