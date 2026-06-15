# Audit Red Team — KORE (Tams Plate-forme)

**Date :** 2026-06-15
**Périmètre :** `artifacts/api-server` (API Express 5), `lib/db` (Drizzle/PostgreSQL), `lib/api-*`, `artifacts/kore` (frontend React).
**Type de données traitées :** données personnelles très sensibles (tâches, décisions de vie, niveaux d'énergie, réflexions intimes du soir, mémoire personnelle).

---

## Résumé exécutif

L'application expose une API de « copilote de vie » manipulant des données extrêmement personnelles **sans aucune authentification ni isolation par utilisateur**. N'importe qui connaissant l'URL peut lire, modifier et supprimer l'intégralité des données. C'est le défaut structurel dominant ; plusieurs autres faiblesses (CORS, absence de rate limiting, injection de prompt, coût LLM non borné) l'aggravent.

| # | Sévérité | Vulnérabilité |
|---|----------|---------------|
| 1 | **Critique** | Absence totale d'authentification / autorisation (Broken Access Control) |
| 2 | **Critique** | Aucune notion d'utilisateur en base — toutes les données sont globales et partagées |
| 3 | **Élevée** | CORS permissif (`origin: true` + regex `*.vercel.app` non ancrée) avec `credentials: true` |
| 4 | **Élevée** | Endpoints LLM non authentifiés et sans quota → bombe de coût / DoS financier |
| 5 | **Élevée** | Injection de prompt (entrées utilisateur concaténées dans les prompts) |
| 6 | **Moyenne** | Aucun rate limiting, aucun en-tête de sécurité (pas de helmet) |
| 7 | **Moyenne** | Sortie du LLM insérée en base sans revalidation des enums/volume |
| 8 | **Moyenne** | Pas de limite de taille explicite sur les entrées (audio base64, contenu) |
| 9 | **Faible** | Fuite d'information via messages d'erreur Zod bruts + absence de handler d'erreur |
| 10 | **Faible** | État/cache global partagé entre toutes les requêtes |

---

## Constats détaillés

### 1. CRITIQUE — Absence totale d'authentification/autorisation
**Fichiers :** `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/*`, `src/middlewares/` (vide, seulement `.gitkeep`).

Aucune route n'est protégée. Le routeur monte directement tous les endpoints sous `/api` sans middleware d'auth. Tout client non authentifié peut :

- `GET /api/captures`, `/api/decisions`, `/api/memory`, `/api/briefings/evening/history` → **lire toutes les données personnelles** ;
- `DELETE /api/tasks/:id`, `/api/captures/:id`, `/api/memory/:id` → **détruire les données** ;
- `POST /api/captures`, `/api/decisions`, `/api/ai/transcribe` → **déclencher des appels LLM payants**.

Le client (`custom-fetch.ts`) prévoit pourtant un porteur de jeton Bearer (`setAuthTokenGetter`), mais **le serveur ne le vérifie jamais**. Le `cookie-parser` est listé en dépendance mais n'est pas câblé dans `app.ts`.

**Exploitation :**
```bash
curl https://<host>/api/decisions          # dump des décisions de vie
curl -X DELETE https://<host>/api/tasks/1   # suppression arbitraire
```

**Remédiation :** introduire une authentification (session/cookie httpOnly+Secure+SameSite, ou OIDC), un middleware appliqué à tout `/api` sauf `/healthz`, et refuser par défaut.

---

### 2. CRITIQUE — Aucune isolation par utilisateur (multi-tenant inexistant)
**Fichiers :** `lib/db/src/schema/*.ts`.

Aucune table (`tasks`, `captures`, `decisions`, `memory`, `evening_reviews`, `energy_logs`, `events`, `learnings`) ne possède de colonne `userId`/`ownerId`. Toutes les requêtes sélectionnent/suppriment sans filtre de propriétaire. Même si l'auth était ajoutée, il n'existe aucun moyen de cloisonner les données : c'est un IDOR de conception généralisé.

**Remédiation :** ajouter `userId` (FK) à chaque table, indexer, et filtrer **toutes** les requêtes par l'utilisateur authentifié (`where(eq(table.userId, req.user.id))`).

---

### 3. ÉLEVÉE — CORS permissif avec credentials
**Fichier :** `artifacts/api-server/src/app.ts:28-35`.

```js
cors({
  origin: process.env.FRONTEND_URL
    ? [process.env.FRONTEND_URL, /\.vercel\.app$/]
    : true,
  credentials: true,
})
```

- Sans `FRONTEND_URL`, `origin: true` **reflète n'importe quelle origine** avec `credentials: true`.
- Avec `FRONTEND_URL`, la regex `/\.vercel\.app$/` n'est **pas ancrée au host** : toute origine se terminant par `.vercel.app` (ex. `https://attacker.vercel.app`) est autorisée à émettre des requêtes créditées.

Combiné à l'absence d'auth, cela facilite l'exfiltration/altération cross-origin depuis n'importe quel site hébergé sur Vercel.

**Remédiation :** liste blanche stricte d'origines exactes ; éviter les regex de suffixe ; ne jamais combiner `origin: true` et `credentials: true`.

---

### 4. ÉLEVÉE — Endpoints LLM non bornés (bombe de coût / DoS financier)
**Fichiers :** `routes/captures.ts`, `routes/decisions.ts`, `routes/ai.ts`, `lib/ai.ts`.

Chaque `POST /api/captures`, `/api/decisions`, `/api/ai/transcribe`, `/api/briefings/*` déclenche un appel à Gemini / Groq Whisper. Ces endpoints sont **publics, sans rate limiting ni quota**. Un attaquant peut boucler ces appels pour épuiser les budgets API (Gemini/Groq) et provoquer un déni de service financier, en plus de saturer la base par insertions massives.

**Remédiation :** authentification obligatoire, rate limiting par utilisateur/IP, quotas d'usage LLM, et budget plafonné côté fournisseur.

---

### 5. ÉLEVÉE — Injection de prompt
**Fichier :** `lib/ai.ts` (toutes les fonctions).

Les entrées utilisateur (`content`, `question`, `context`, `mostImportantThing`, `freeReflection`…) sont **concaténées directement** dans les prompts entre guillemets, sans délimitation robuste ni neutralisation :

```js
const prompt = `... Capture de l'utilisateur : "${content}" ...`;
```

Un utilisateur peut détourner les instructions de « KORE », faire ignorer la boussole de priorités, manipuler le `koreComment` stocké, ou tenter d'extraire le prompt système. L'impact direct est limité (pas d'outils/actions branchés sur le LLM), mais l'intégrité des analyses et des données stockées est compromise.

**Remédiation :** séparer instructions et données utilisateur (rôles/messages structurés), filtrer/échapper, et ne jamais traiter la sortie LLM comme de confiance.

---

### 6. MOYENNE — Pas de rate limiting ni d'en-têtes de sécurité
**Fichier :** `artifacts/api-server/src/app.ts`.

Aucun `express-rate-limit`, aucun `helmet`. Les endpoints de lecture/écriture et LLM sont exposés à du brute-force et du scraping. Aucun en-tête (`X-Content-Type-Options`, `Referrer-Policy`, `Content-Security-Policy`, etc.).

**Remédiation :** ajouter `helmet`, un rate limiter global + spécifique aux routes LLM.

---

### 7. MOYENNE — Sortie LLM insérée sans revalidation
**Fichier :** `routes/captures.ts` (`extractFromCapture`).

Le JSON renvoyé par le modèle est `JSON.parse` puis inséré tel quel dans `tasks/events/learnings`. Les champs (`priority`, `category`, `priorityDomain`) ne sont **pas revalidés** contre les enums Zod, et le **nombre d'éléments n'est pas plafonné** : une capture conçue pour faire produire au modèle des tableaux volumineux ou des valeurs hors-enum entraîne des insertions de masse / données incohérentes.

**Remédiation :** valider la sortie du modèle avec les schémas Zod, plafonner la taille des tableaux, rejeter les valeurs hors-enum.

---

### 8. MOYENNE — Absence de limites de taille explicites
**Fichiers :** `app.ts` (`express.json()` sans `limit`), `api-zod` (`audioBase64` sans `maxLength`, `content` seulement `min(1)`).

`express.json()` utilise la limite par défaut (~100 kb), non explicitée — fragile et susceptible d'être augmentée par mégarde. Aucune borne haute sur `content` ni sur l'audio base64.

**Remédiation :** fixer explicitement `express.json({ limit: '...' })`, ajouter `maxLength` côté Zod sur toutes les chaînes libres.

---

### 9. FAIBLE — Fuite d'information & absence de handler d'erreur
**Fichiers :** toutes les routes (`res.status(400).json({ error: parsed.error.message })`), `app.ts`.

Les messages Zod bruts sont renvoyés au client (divulgation de structure interne). Aucun middleware d'erreur global n'est défini : les rejets de promesses (ex. erreurs DB) tombent sur le handler par défaut d'Express. En production (`NODE_ENV=production`) la stack est masquée, mais l'absence de gestion centralisée reste fragile.

**Remédiation :** handler d'erreur global, messages génériques côté client, journalisation détaillée côté serveur uniquement.

---

### 10. FAIBLE — État global partagé
**Fichiers :** `routes/briefings.ts`, `routes/overload.ts` (`briefingCache`, `weeklyCache`, `overloadCache`).

Caches au niveau module, partagés par toutes les requêtes. Sans notion d'utilisateur c'est cohérent avec le mono-tenant actuel, mais cela deviendra un risque de fuite croisée dès l'ajout du multi-utilisateur (les données d'un user serviraient à un autre).

**Remédiation :** clé de cache par utilisateur une fois l'auth en place.

---

## Points positifs

- **Drizzle ORM** : requêtes paramétrées, y compris `ilike(\`%${search}%\`)` → pas d'injection SQL.
- **`.npmrc` `minimumReleaseAge: 1440`** : bonne défense supply-chain npm.
- **Validation d'entrée Zod** présente sur les bodies/params (à compléter par des bornes hautes).
- **Secrets** lus depuis l'environnement, non committés ; `.gitignore` correct.
- Frontend : pas de `dangerouslySetInnerHTML` sur des données utilisateur (seul usage = composant chart shadcn générant du CSS).

---

## Plan de remédiation priorisé

1. **Immédiat (P0)** : authentification + middleware appliqué à tout `/api` ; ajouter `userId` à chaque table et filtrer toutes les requêtes.
2. **Court terme (P1)** : durcir CORS (origines exactes) ; rate limiting + quotas LLM ; `helmet`.
3. **Moyen terme (P2)** : revalider la sortie LLM ; bornes de taille (`express.json` + `maxLength` Zod) ; handler d'erreur global + messages génériques.
4. **Durcissement (P3)** : caches par utilisateur ; durcissement prompt (séparation instructions/données) ; CSP.
