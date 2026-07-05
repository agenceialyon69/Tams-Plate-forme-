# RED TEAM — Lire-URL (free-first, anti-SSRF)

## Objectif
Donner à Mon Agent la capacité de **lire une page web** : récupérer, nettoyer en
texte lisible, puis résumer via le LLM gratuit. Sans clé, sans provider payant.

## Verdict
PASS local (typecheck + build + anti-SSRF + lecture réelle d'example.com). CI
teste l'anti-SSRF et la validation de façon déterministe. **Aucune action
utilisateur : gratuit.**

## Fichiers
| Fichier | Rôle |
|---|---|
| `lib/web-read.ts` | `readUrl()` (fetch borné + suivi de redirections re-validé), `htmlToText()`, `findUrl()`, garde anti-SSRF `assertPublicUrl()` |
| `routes/web.ts` | `POST /api/web/read { url }` |
| `routes/index.ts` | Montage |
| `lib/operator.ts` | Intent `research` : URL détectée → lecture + résumé LLM citant l'URL. `detectIntent` : une URL → research |
| `.github/workflows/ci.yml` | Smoke anti-SSRF |

## Sécurité — anti-SSRF (analyse adversariale)
| Menace | Mitigation |
|---|---|
| Accès réseau interne (SSRF) | Rejet de `localhost`, `*.local/.internal`, IPv4 privées (`127.`, `10.`, `172.16-31.`, `192.168.`, `169.254.`, `0.`, multicast `≥224`), IPv6 loopback/ULA/link-local |
| **Metadata cloud** (`169.254.169.254`) | Bloqué (plage `169.254.`) |
| Contournement par redirection | Redirections suivies **manuellement**, chaque saut **re-validé** (max 3) |
| Protocole dangereux (`file:`, `ftp:`, `gopher:`) | http/https **uniquement** |
| Réponse énorme (DoS) | Lecture **bornée à 2 Mo** (stream coupé) + texte 100k chars + timeout 12 s |
| Faux contenu | Jamais : échec réseau/vide → message clair, pas de résumé inventé |

### Limite honnête
Le filtre porte sur l'**URL** (hôte/IP littérale). Un domaine public qui
**résout** vers une IP privée (rebinding DNS) n'est pas couvert (il faudrait
résoudre puis vérifier l'IP). Acceptable pour un usage perso ; durcissable plus
tard (résolution + contrôle de l'IP effective).

## Comportement
- `POST /api/web/read { url }` → `{ ok, url, title, text, chars, truncated }`.
  URL bloquée/invalide → **400** ; échec réseau → **502**.
- Chat : « résume https://… », « lis cette page … » → lecture + résumé (ou refus
  honnête si SSRF / page sans texte / pas de LLM).

## Tests
- Local : `127.0.0.1`, `169.254.169.254`, `192.168.1.1`, `ftp://`, sans url → **400** ;
  **example.com** → titre « Example Domain » + texte propre ; chat SSRF → `blocked`.
- CI : anti-SSRF (IP privée + metadata) + proto invalide + sans url → 400 (déterministe).

## Prochaine étape
**Veille RSS** : agréger des flux RSS (gratuit, keyless) + **digest quotidien**
via cron GitHub Actions gratuit.

## Rollback
Retirer le routeur (additif) ou revert.
