# RED TEAM — Personal Access Gate (PR #2)

**Objectif** : rendre TAMS **privé** avec un accès personnel simple, robuste et
free-first, sans casser l'existant ni exiger de provider payant.

**Verdict** : PASS local (typecheck + build front/back + 11 smoke checks du gate
+ non-régression du mode désactivé). Reste à confirmer en CI GitHub Actions et
en production Railway (SHA + test navigateur réel).

---

## 1. Ce qui est ajouté

| Élément | Fichier | Rôle |
|---|---|---|
| Middleware + handlers | `artifacts/api-server/src/middlewares/personal-access.ts` | Gate, login page, submit, logout |
| Câblage | `artifacts/api-server/src/app.ts` | Routes `/personal-access*` + `app.use(personalAccessGate)` |
| Smoke CI | `.github/workflows/ci.yml` | Étape « Smoke Personal Access Gate » |
| Doc env | `.env.example` | Variables `TAMS_PERSONAL_ACCESS_*` |

**Réutilisation, pas réécriture** : le middleware provient de la branche
`redteam/personal-access-gate` (travail déjà commencé), finalisé + câblé ici.

## 2. Comportement

- **Actif uniquement si `TAMS_PERSONAL_ACCESS_ENABLED=true`.** Sinon 100 % no-op :
  comportement historique strictement inchangé (prouvé : `/mon-agent`=200,
  `/api/operator/status`=200 en mode désactivé).
- Quand actif, le gate protège **tout** sauf les chemins publics.

### Chemins toujours publics (`isPublicPath`)
- `/personal-access`, `/personal-access/logout`, `/favicon.ico`
- `/api/health`, `/api/healthz` (+ sous-chemins) — health checks Railway
- `/api/auth` (+ sous-chemins) — flux Supabase

### Routes
- `GET /personal-access` → page de login (HTML autoportée, inline CSS).
- `POST /personal-access` → vérifie identifiants, pose le cookie, redirige `next`.
- `POST /personal-access/logout` → efface le cookie, redirige vers le login.

### Réponses du gate sans session
- Chemin `/api/*` → **401 JSON** `{ error: "Acces personnel requis", login: "/personal-access" }`.
- Autre chemin (UI/SPA) → **302** vers `/personal-access?next=…`.

## 3. Sécurité (analyse adversariale)

| Menace | Mitigation |
|---|---|
| Vol de session / lecture JS du cookie | Cookie **HttpOnly** |
| CSRF | **SameSite=Strict** |
| Interception réseau | **Secure** en production (`NODE_ENV==='production'`) |
| Forge de token | Token signé **HMAC-SHA256** (`TAMS_PERSONAL_ACCESS_SECRET`), vérifié à chaque requête |
| Timing attack sur mdp/username | `crypto.timingSafeEqual` (comparaison à temps constant) |
| Session éternelle | Expiration `iat + MAX_AGE_MS` (défaut 12 h), configurable |
| Open redirect via `?next=` | `internalNext()` : refuse tout ce qui ne commence pas par `/`, bloque `//`, borne à 256 chars, exclut `/personal-access` |
| XSS dans le message d'erreur | Échappement `< > & "` avant rendu |
| Fail-open si mal configuré | **Fail-closed** : `ENABLED=true` sans PASSWORD+SECRET → 503 partout, jamais d'accès |
| Fuite de secret | Aucun secret rendu ni loggé (vérifié : grep sur les logs du serveur = 0 occurrence) |

### Limites honnêtes / résidus
- **Un seul utilisateur** (username/password unique) — c'est voulu (projet
  personnel, pas multi-tenant).
- Pas de rate-limit dédié sur le login au-delà du `defaultRateLimit` global —
  acceptable pour un usage perso ; à durcir si l'URL devient publiquement connue.
- Le mdp est comparé en clair via `timingSafeEqual` (pas de hash type bcrypt) :
  suffisant pour un secret d'env perso, mais ce n'est pas une base d'utilisateurs.
- Le token n'a pas de révocation côté serveur (stateless HMAC) : un logout efface
  le cookie mais un token volé reste valide jusqu'à expiration. Réduire
  `TAMS_PERSONAL_ACCESS_MAX_AGE_MS` si besoin.

## 4. `REQUIRE_AUTH` — NON touché (règle critique)

Ce gate est **indépendant** de `REQUIRE_AUTH` (auth Supabase par JWT). Le code
**ne met PAS** `REQUIRE_AUTH=false`.

**Quand mettre `REQUIRE_AUTH=false` ?** Seulement **après** avoir validé le
Personal Access Gate **en production** (login OK, cookie posé, `/mon-agent`
accessible connecté, `/api/operator/*` en 401 sans session). Le gate devient
alors la couche de confidentialité, et `REQUIRE_AUTH` (JWT) peut rester off tant
qu'il n'y a pas d'UI de login Supabase — sans exposer TAMS publiquement. À ne
faire qu'après le test prod réel.

## 5. Preuves (local, ce commit)

- `pnpm run typecheck` → **Done** (api-server inclus).
- Build frontend (`@workspace/tams`) → **built**. Build API → **Done**.
- Serveur `NODE_ENV=production` **gate activé** (port 4002), 11/11 checks PASS :
  - `/api/healthz` public (200)
  - `/personal-access` affiche le login
  - `/mon-agent` sans session → 302
  - `/api/operator/status` sans session → 401
  - mauvais mot de passe → 401
  - login OK → `Set-Cookie: tams_personal_session … HttpOnly; Secure; SameSite=Strict`
  - avec session → `/api/operator/status` ≠ 401
  - logout → 302
  - aucun secret dans les logs
- Serveur **gate désactivé** (port 4003) : `/mon-agent`=200, `/api/operator/status`=200,
  `/personal-access`→302 vers `/` → **non-régression confirmée**.

## 6. Configuration Railway (à faire par le propriétaire)

```
TAMS_PERSONAL_ACCESS_ENABLED=true
TAMS_PERSONAL_ACCESS_USERNAME=admin
TAMS_PERSONAL_ACCESS_PASSWORD=<un mot de passe fort>
TAMS_PERSONAL_ACCESS_SECRET=<openssl rand -base64 48>
# optionnel :
TAMS_PERSONAL_ACCESS_MAX_AGE_MS=43200000
```

Ne jamais committer les vraies valeurs. `NODE_ENV=production` garantit le flag
`Secure` sur le cookie (donc HTTPS obligatoire).
