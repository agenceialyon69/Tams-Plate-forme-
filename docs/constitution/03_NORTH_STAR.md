# 03 — North Star

> Ce document définit le sens ultime de TAMS. Si toutes les fonctionnalités disparaissaient, ces 10 capacités suffiraient à reconstruire le système.

## La promesse fondamentale

TAMS doit transformer la surcharge informationnelle en **décisions éclairées**, **mémoire fiable** et **action priorisée**.

Pourquoi un utilisateur reviendrait-il chaque jour ?
- Parce qu'il sait que TAMS connaît son contexte
- Parce qu'il peut agir depuis l'unique point d'entrée (chat)
- Parce que rien n'est oublié (mémoire relationnelle)
- Parce que chaque décision est structurée et critiquée

## Les 10 capacités indispensables

### 1. Chief of Staff (Briefing intelligent)

**Mission :** Répondre à « Quoi faire aujourd'hui ? » en moins de 3 secondes.

**Pourquoi :** Un consultant perd 2h/jour à contextualiser. Le briefing élimine ce coût.

**Architecture :** `GET /api/briefing` + IA generation + fallback rule-based.

### 2. Chat Central (Point d'entrée unique)

**Mission :** 90% des actions démarrables depuis le chat via tool-use.

**Pourquoi :** Réduire la navigation. Agir, pas naviguer.

**Architecture :** POST `/api/conversations/:id/stream` avec SSE + function calling.

### 3. Memory Graph (Mémoire relationnelle)

**Mission :** Aucune information importante oubliée. Lien explicite entre entités.

**Pourquoi :** Un consultant gère 50+ contacts, 10+ projets, 100+ décisions/an. Impossible sans mémoire structurée.

**Architecture :** Tables `memories` + `memory_edges` avec types relationnels.

### 4. Decision OS (Moteur de décision)

**Mission :** Chaque décision importante analysée, critiquée, exécutable.

**Pourquoi :** Les décisions mal prises coûtent plus que les bugs.

**Architecture :** Double appel IA (advisor + red team) + score analytique + lien tâches.

### 5. Work OS (Tâches + projets + contacts intégrés)

**Mission :** Un espace de travail unifié, pas trois outils séparés.

**Pourquoi :** Context switching tue la productivité.

**Architecture :** Tables `tasks`, `projects`, `contacts` + Kanban + filtres.

### 6. Studio (Assets créatifs centralisés)

**Mission :** Production de contenu structurée, pas dispersée.

**Pourquoi :** Le consultant produit : emails, scripts, documents, présentations.

**Architecture :** Table `assets` + génération IA via chat.

### 7. Système (Observabilité + Recovery)

**Mission :** Savoir ce qui se passe. Pouvoir récupérer.

**Pourquoi :** Un système opaque est un système abandonné.

**Architecture :** Table `activity` + `/system/export` + `/system/stats`.

### 8. Sécurité (Protection des données utilisateur)

**Mission :** Données personnelles protégées, secrets non exposés.

**Pourquoi :** Un AI OS contient des secrets. Les fuir casse la confiance.

**Architecture :** Helmet.js + CORS restrict + rate limiting + Zod validation.

### 9. Performance (Temps de réponse acceptable)

**Mission :** < 300ms pour routes non-IA. < 3s pour briefing.

**Pourquoi :** La latence tue l'usage quotidien.

**Architecture :** SQL optimisé (JOINs + pagination), pas N+1.

### 10. Mobile Premium (Expérience native)

**Mission :** Utilisable quotidiennement sur iOS Safari et Android Chrome.

**Pourquoi :** Le mobile est la surface principale hors bureau.

**Architecture :** Safe areas + bottom nav + touch targets 44px + `dvh`.

## Ce que TAMS ne doit jamais devenir

- Un dashboard de métriques passif
- Un CRM générique sans mémoire relationnelle
- Un clone de ChatGPT sans capacité d'action
- Un clone de Notion sans IA intégrée
- Un SaaS multi-tenant avec plans payants
- Un admin dashboard
- Une collection de modules sans valeur quotidienne

## Validation du North Star

Pour chaque nouvelle fonctionnalité, demander :

1. Renforce-t-elle l'une des 10 capacités ?
2. Peut-on l'atteindre depuis le chat ?
3. Crée-t-elle de la mémoire exploitable ?
4. Aide-t-elle à décider ou agir ?
5. Serait-elle utilisée chaque semaine ?

Si 3/5 réponses sont « non », la fonctionnalité ne doit pas exister.
