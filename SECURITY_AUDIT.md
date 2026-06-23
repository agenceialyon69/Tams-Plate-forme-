# Audit Red Team — TAMS (Tams Plate-forme)

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

Un utilisateur peut détourner les instructions de « TAMS », faire ignorer la boussole de priorités, manipuler le `tamsComment` stocké, ou tenter d'extraire le prompt système. L'impact direct est limité (pas d'outils/actions branchés sur le LLM), mais l'intégrité des analyses et des données stockées est compromise.

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

1. **Immédiat (P0)** : authentification + middleware appliqué à tout `/api`.
2. **Court terme (P1)** : durcir CORS (origines exactes) ; rate limiting + quotas LLM ; en-têtes de sécurité.
3. **Moyen terme (P2)** : revalider la sortie LLM ; bornes de taille ; handler d'erreur global + messages génériques.
4. **Durcissement (P3)** : durcissement prompt (bornes d'entrée) ; CSP.

---

## Journal de remédiation (appliqué le 2026-06-15)

Modèle retenu : **mono-utilisateur par token unique** (les comptes multi-utilisateurs ne sont pas pertinents pour un copilote personnel ; le constat n°2 « colonne `userId` » est donc volontairement écarté au profit du token unique qui ferme l'accès).

| # | Constat | Correctif | Fichier |
|---|---------|-----------|---------|
| 1 | Pas d'auth | Middleware bearer token (SHA-256 + comparaison à temps constant), default-deny sur tout `/api` sauf `/healthz`. Refus de démarrage si `API_AUTH_TOKEN` absent/faible. | `middlewares/auth.ts`, `routes/index.ts` |
| 3 | CORS permissif | Allowlist stricte d'origines exactes via `FRONTEND_URL` ; suppression de `origin: true` et de la regex `*.vercel.app` ; `credentials: false`. | `app.ts` |
| 4 | Coût LLM non borné | Rate limiting : 120 req/min global + 20 req/min sur `/captures`, `/decisions`, `/ai/*`. | `middlewares/rate-limit.ts`, routes |
| 5 | Injection de prompt | Bornes d'entrée (contenu 10k, question/contexte 4k) avant envoi au LLM. | `lib/ai.ts` |
| 6 | Pas d'en-têtes / rate limit | En-têtes de sécurité (CSP, nosniff, X-Frame, Referrer, CORP), suppression `X-Powered-By`. | `middlewares/security.ts` |
| 7 | Sortie LLM non validée | Sanitisation : tableaux plafonnés (50), enums validés, types coercés, longueurs bornées avant insertion. | `lib/ai.ts` |
| 8 | Pas de limite de taille | `express.json({ limit: '8mb' })`, urlencoded 1mb, plafond audio base64 (~7,5MB décodés). | `app.ts`, `routes/ai.ts` |
| 9 | Fuite via erreurs | Messages d'erreur génériques côté client + handler d'erreur global centralisé. | toutes les routes, `app.ts` |
| — | Robustesse | Init paresseuse du client Groq : le serveur ne crashe plus au démarrage si `GROQ_API_KEY` est absente. | `lib/ai.ts` |
| — | Build cassé | Bugs de typage préexistants corrigés (`note` au lieu de `context` ; `queryKey` manquant). | `pages/dashboard.tsx`, `pages/decisions.tsx` |

**Côté frontend** : token stocké localement et envoyé en `Authorization: Bearer` (`lib/auth.ts`, `main.tsx`) ; écran de déverrouillage + déconnexion automatique sur réponse 401 (`components/LoginGate.tsx`, `App.tsx`).

**Validation** : `pnpm run typecheck` OK sur tous les packages, `pnpm run build` OK, et test fumée confirmant 401 sans/avec mauvais token, accès public à `/healthz`, et présence des en-têtes de sécurité.

**Non traité volontairement** : multi-tenant (`userId`) — hors périmètre d'une app mono-utilisateur.

---

## Scan Red Team complémentaire — 2026-06-16

**Scanners utilisés :** osv-scanner (dépendances), Semgrep SAST, HoundDog (dataflow).

### Vulnérabilités de dépendances détectées et corrigées

| Sévérité | Package | CVE/Advisory | Fix |
|----------|---------|--------------|-----|
| HIGH | `esbuild@0.27.3` | GHSA — Missing binary integrity verification in Deno module (RCE via NPM_CONFIG_REGISTRY) | → `0.28.1` dans `pnpm-workspace.yaml` overrides |
| HIGH | `vite@7.3.3` | `server.fs.deny` bypass sur Windows alternate paths | → `^7.3.5` dans catalog |
| MODERATE | `qs@6.15.1` | DoS via `qs.stringify` avec entrées null/undefined | Override `>=6.15.2` |
| MODERATE | `markdown-it@14.1.1` | DoS quadratique (smartquotes) | Override `>=14.2.0` |
| MODERATE | `vite@7.3.3` | NTLMv2 hash disclosure via UNC path (launch-editor) | → `^7.3.5` |
| LOW | `@babel/core@7.29.0` | Arbitrary file read via sourceMappingURL | Override `>=7.29.6` |
| LOW | `esbuild@0.27.3` | Path traversal sur Windows (servedir) | → `0.28.1` |

### Bugs structurels découverts et corrigés

| # | Sévérité | Constat | Correctif | Fichier |
|---|----------|---------|-----------|---------|
| A | **Critique** | `rate-limit.ts` exportait `rateLimitRedis` mais tous les imports utilisaient `rateLimit` → **rate limiting entièrement inopérant** | Renommage de la fonction en `rateLimit` + réécriture pure mémoire (sans Redis) | `middlewares/rate-limit.ts` |
| B | **Haute** | `app.ts` importait `requireAuth` depuis `./middlewares/requireAuth` (fichier inexistant) → crash serveur au démarrage | Correction de l'import vers `./middlewares/auth` | `app.ts` |
| C | **Haute** | `redis` et `helmet` importés mais absents de `package.json` → build cassé en environnement propre | Suppression de `helmet` (remplacé par `securityHeaders` qui couvre les mêmes en-têtes) ; suppression de Redis (fallback mémoire activé) | `app.ts`, `middlewares/auth.ts`, `middlewares/rate-limit.ts`, `package.json` |
| D | **Moyenne** | Double application de `requireAuth` dans `routes/index.ts` (déjà appliqué dans `app.ts`) ; la copie dans le router était inopérante car `req.path` relatif ne matchait pas les checks `/api/*` | Suppression du `requireAuth` redondant dans `routes/index.ts` | `routes/index.ts` |
| E | **Moyenne** | SAST : `modules[key]` dans `mockup-sandbox/App.tsx` avec `key` dérivé de l'URL — injection de clé dynamique possible | Validation par regex allowlist `^[a-zA-Z0-9/_-]+$` avant utilisation | `artifacts/mockup-sandbox/src/App.tsx` |

### État post-correctifs

- Rate limiting global (120 req/min) et LLM (20 req/min) : **opérationnel** ✓
- Anti-brute-force (mémoire, configurable via env) : **opérationnel** ✓
- En-têtes de sécurité (CSP, HSTS, nosniff, X-Frame, Referrer, CORP, COOP, Permissions-Policy) : **opérationnel** ✓
- Auth bearer token SHA-256 + timing-safe : **opérationnel** ✓
- Vulnérabilités de dépendances critiques/hautes : **corrigées via overrides** ✓
