# RED TEAM — Personal Admin Access Gate (PR #2)

## Objectif
Rendre TAMS **privé** derrière **UN SEUL accès admin** : email + mot de passe,
session par cookie sécurisé. UX simple : j'ouvre TAMS, je me connecte, j'utilise
`/mon-agent`. Aligné direction produit : agent personnel privé — **pas** de
multi-tenant, **pas** de token utilisateur, **pas** de JWT public comme gate.

## Verdict
PASS local (typecheck + build API + build frontend + 12 smoke checks, chemin
hash scrypt inclus). Reste : CI GitHub success + validation prod Railway.

## Fichiers modifiés / ajoutés
| Fichier | Rôle |
|---|---|
| `artifacts/api-server/src/middlewares/personal-access.ts` | Gate + login/submit/logout, email + hash scrypt, cookie signé |
| `artifacts/api-server/src/app.ts` | (déjà câblé) routes `/personal-access*` + `app.use(personalAccessGate)` |
| `scripts/hash-admin-password.mjs` | Génère `TAMS_ADMIN_PASSWORD_HASH` (scrypt) |
| `.github/workflows/ci.yml` | Smoke gate admin (email + hash + logout) |
| `.env.example` | Variables `TAMS_ADMIN_*` / `TAMS_SESSION_*` |

## Variables Railway à configurer
```
TAMS_PERSONAL_ACCESS_ENABLED=true
TAMS_ADMIN_EMAIL=<ton-email-admin>
TAMS_ADMIN_PASSWORD_HASH=<sortie de: node scripts/hash-admin-password.mjs 'mdp'>
TAMS_SESSION_SECRET=<openssl rand -base64 48>
TAMS_SESSION_MAX_AGE_MS=43200000   # optionnel (défaut 12h)
```
Dev local seulement (déconseillé en prod) : `TAMS_ADMIN_PASSWORD=<clair>` à la
place du hash. Le hash est prioritaire s'il est présent.

## Comportement
- **Actif uniquement** si `TAMS_PERSONAL_ACCESS_ENABLED=true` ; sinon **no-op**
  total (aucune régression).
- Publics : `/api/health`, `/api/healthz` (+ sous-chemins), la page de login,
  `/favicon.ico`. La page de login est **autoportée** (CSS inline) → aucun asset
  statique à ouvrir.
- Protégés : `/mon-agent`, `/api/operator/*`, Studio, tout le reste.
- Sans session : `/api/*` → **401** `Acces admin requis` ; UI → **302** vers
  `/personal-access?next=…`.
- `GET /personal-access` (login), `POST /personal-access` (connexion),
  `POST /personal-access/logout` (déconnexion, efface le cookie).

## Sécurité (analyse adversariale)
| Menace | Mitigation |
|---|---|
| Mot de passe en clair au repos | **scrypt** (`TAMS_ADMIN_PASSWORD_HASH`), clair seulement en dev |
| Vol de cookie via JS | **HttpOnly** |
| CSRF | **SameSite=Strict** |
| Interception réseau | **Secure** en production (HTTPS obligatoire) |
| Forge de session | Token **HMAC-SHA256** (`TAMS_SESSION_SECRET`), vérifié à chaque requête |
| Timing attack email/mdp | `timingSafeEqual` + email et mot de passe **toujours** vérifiés (pas de court-circuit révélateur) |
| Énumération (quel champ est faux ?) | Message unique « Email ou mot de passe incorrect » |
| Session éternelle | Expiration `iat + MAX_AGE_MS` (défaut 12h) |
| Open redirect via `?next=` | `internalNext()` : interne relatif only, bloque `//`, borne 256, exclut `/personal-access` |
| XSS message d'erreur | Échappement `< > & "` |
| Mauvaise config = ouvert | **Fail-closed** : 503 partout, jamais d'accès |
| Fuite de secret | Aucun secret rendu ni loggé (vérifié par grep sur logs serveur) |
| Hash mal formé | Fail-closed (refus) |

## Direction produit — conformité
- ✅ 1 seul admin (email + mot de passe) · ✅ pas de JWT public comme gate
- ✅ pas de token/x-api-key utilisateur · ✅ pas de multi-tenant / tenantId
- ✅ pas de register / invite / rôles owner/admin/member/viewer
- Inspiration de l'ancien `auth-jwt.ts` limitée à : `timingSafeEqual`, logs
  unauthorized, public paths. Rien repris de tenant/role/register/invite/x-api-key.

## Tests lancés (local)
`typecheck API` · `build API` · `build frontend` · serveur gate activé :
- GET `/personal-access` = 200 (login admin)
- POST mauvais mot de passe = 401 · POST mauvais email = 401
- POST bon email + **hash scrypt** = 200 + `Set-Cookie tams_admin_session … HttpOnly; Secure; SameSite=Strict`
- `/api/operator/readiness` sans session = 401 · avec session ≠ 401
- `/mon-agent` sans session = 302 · `/api/health` public = 200
- logout = 302 · **aucun secret loggé**
- non-régression (gate off) : `/mon-agent`=200, `/api/operator/*`=200
- `/api/operator/capabilities` + `/api/operator/readiness` intacts · Studio intact

## Limites
- **Un seul admin** (voulu). Pas de reset mot de passe self-service (régénérer le
  hash + redéployer). Token stateless : logout efface le cookie mais un token
  volé reste valide jusqu'à expiration → réduire `TAMS_SESSION_MAX_AGE_MS` si besoin.
- Pas de rate-limit dédié au login au-delà du `defaultRateLimit` global.

## Procédure de validation production
1. Générer le hash : `node scripts/hash-admin-password.mjs 'mdp-fort'`.
2. Poser les variables `TAMS_*` sur Railway (ci-dessus), `NODE_ENV=production`.
3. Redéployer. Vérifier : `/mon-agent` → redirige login ; login → accès OK ;
   `/api/operator/readiness` sans cookie = 401 ; `/api/healthz` = 200.
4. Vérifier le cookie `tams_admin_session` : `HttpOnly; Secure; SameSite=Strict`.

## Quand basculer REQUIRE_AUTH=false
`REQUIRE_AUTH` (auth Supabase JWT) et ce gate sont **indépendants**. Le code ne
met **jamais** `REQUIRE_AUTH=false`. Ne le passer à `false` **sur Railway
uniquement** qu'**après** avoir validé le gate admin en prod (étape 3 ci-dessus).
Le gate admin devient alors la couche de confidentialité ; `REQUIRE_AUTH` peut
rester off sans exposer TAMS publiquement.

## Rollback
- Immédiat : `TAMS_PERSONAL_ACCESS_ENABLED=false` sur Railway → gate no-op,
  comportement d'avant restauré (aucun redéploiement de code requis).
- Code : revert du commit / de la PR #2 (le gate est additif et isolé).
