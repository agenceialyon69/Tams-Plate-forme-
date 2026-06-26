# 04 — Les 10 Piliers de TAMS

> Chaque pilier est un module vertical indissociable. Ensemble, ils forment l'AI Operating System.

---

## Pilier 1 — Chief of Staff

**Mission :** Générer chaque matin un briefing contextuel qui répond à « Quoi faire aujourd'hui ? ».

**Pourquoi il existe :** Le contexte change quotidiennement. Sans synthèse, le consultant perd du temps à reconstituer la situation.

**Valeur utilisateur :** Économise 30 minutes de contextualisation chaque matin. Identifie les urgences invisibles.

**Architecture concernée :**
- Route : `GET /api/briefing/today` + `POST /api/briefing/generate`
- Table : `briefings`
- IA : `google/gemini-2.5-flash` via Replit AI Gateway
- Fallback : règles déterministes si IA indisponible

**Risques :**
- Briefing répétitif si données inchangées
- Fallback trop générique
- Cache obsolète

**Ce qu'il ne doit jamais devenir :** Une liste de tâches brute. Il doit **interpréter** et **prioriser**.

**Critères d'acceptation :**
- [x] Répond en < 3 secondes
- [x] Fallback gracieux si IA indisponible
- [x] Affiche priorités, risques, recommandations
- [ ] Indicateur de fraîcheur (« généré il y a 12min »)

---

## Pilier 2 — Chat OS

**Mission :** Être le point d'entrée unique. 90% des actions accessibles depuis le chat.

**Pourquoi il existe :** La navigation tue la productivité. Le chat permet d'agir sans quitter le contexte conversationnel.

**Valeur utilisateur :** Réduire le nombre d'écrans. Créer une tâche, un projet, un contact, une décision en une phrase.

**Architecture concernée :**
- Routes : `POST /api/conversations/:id/messages`, `POST /api/conversations/:id/stream`
- Tables : `conversations`, `messages`
- Tool-use : 8 functions déclarées
- Modes : `chat`, `chief_of_staff`, `decision`, `red_team`, `execution`

**Ce qu'il ne doit jamais devenir :** Un chatbot passif sans capacité d'action.

**Critères d'acceptation :**
- [x] Tool-use fonctionnel
- [x] Injection mémoire avant chaque appel
- [x] Streaming SSE implémenté

---

## Pilier 3 — Memory Graph

**Mission :** Mémoriser chaque information importante et la relier aux autres.

**Architecture concernée :**
- Tables : `memories`, `memory_edges`
- Types de nœuds : `person`, `project`, `company`, `decision`, `note`, `goal`, `event`
- Route : `GET /api/memories/graph`

**Critères d'acceptation :**
- [x] Tables déployées
- [x] API CRUD complète
- [ ] Visualisation force graph frontend

---

## Pilier 4 — Decision OS

**Mission :** Structurer chaque décision importante, l'analyser, la critiquer, la lier à des actions.

**Architecture concernée :**
- Table : `decisions`
- Route : `POST /api/decisions/:id/analyze`

**Critères d'acceptation :**
- [x] Double appel IA (advisor + red team)
- [x] Score analytique sur 4 critères
- [x] Lien vers tâches

---

## Pilier 5 — Work OS

**Mission :** Unifier tâches, projets et contacts.

**Architecture concernée :**
- Tables : `tasks`, `projects`, `contacts`, `project_contacts`
- Vues : Liste + Kanban

**Critères d'acceptation :**
- [x] CRUD complet
- [x] Vue Kanban
- [x] Cascade delete projet → tâches
- [x] Table `project_contacts` déployée

---

## Pilier 6 — Studio

**Mission :** Centraliser les assets créatifs.

**Critères d'acceptation :**
- [x] CRUD assets
- [x] Génération de scripts IA

---

## Pilier 7 — Système

**Mission :** Rendre le système observable et capable de recovery.

**Critères d'acceptation :**
- [x] Activity log
- [x] Export JSON complet
- [x] Healthcheck Railway

---

## Pilier 8 — AI Router

**Mission :** Sélectionner le modèle optimal.

**Architecture :** OpenAI SDK + `google/gemini-2.5-flash` via AI Gateway.

---

## Pilier 9 — Tool System

**Mission :** Permettre à l'IA d'agir via function calling.

**Tools implémentés :** `create_task`, `create_project`, `create_contact`, `create_decision`, `create_memory`, `search_memories`, `get_briefing`.

---

## Pilier 10 — Mobile Premium

**Mission :** Expérience native sur iOS Safari et Android Chrome.

**Architecture :** BottomNav + Safe areas + Touch targets 44px + `dvh`.

**Critères d'acceptation :**
- [x] BottomNav implémentée
- [x] Safe areas définies
- [ ] Pull-to-refresh
