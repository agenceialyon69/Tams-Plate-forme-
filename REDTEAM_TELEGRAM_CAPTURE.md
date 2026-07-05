# RED TEAM — Capture Telegram / Google Sheet (PR #3)

## Objectif
Brancher le canal **free-first prioritaire** : le bot Telegram → Google Sheet
(workflow n8n **existant** de l'utilisateur) peut envoyer une capture (note /
idée / tâche) à TAMS, qui la range en **tâche** ou **mémoire**. On **réutilise**
le bot + le Sheet, on ne les remplace pas.

## Verdict
PASS local (typecheck + build API + smoke : 503 non configuré, 401 mauvais
secret, 400 sans texte, **502 honnête si DB indisponible**). CI vérifie en plus
le chemin `ok:true` (DB up en CI). Reste : CI GitHub + config prod.

## Ce qui a été fait / fichiers
| Fichier | Rôle |
|---|---|
| `routes/integrations.ts` | `POST /api/integrations/telegram-capture` (ingestion) |
| `app.ts` | Exemption du JWT gate (webhook authentifié par son propre secret) |
| `middlewares/personal-access.ts` | Ajout du endpoint aux chemins publics du gate admin |
| `lib/operator-capabilities.ts` | `telegram_capture` / `telegram_bot_capture` → `configured` si secret défini |
| `lib/operator.ts` | Intent `telegram_sheet` : statut honnête + étapes n8n |
| `.env.example` | `TAMS_TELEGRAM_CAPTURE_SECRET` |
| `docs/n8n-console-setup.md` | Nœud HTTP « Capture TAMS » à ajouter au workflow |

## Contrat de l'endpoint
`POST /api/integrations/telegram-capture`
- **Auth** : secret partagé `TAMS_TELEGRAM_CAPTURE_SECRET`, via en-tête
  `x-tams-capture-secret` (ou champ `secret`), comparé en temps constant.
- **Body** : `{ text: string, kind?: "task"|"note"|"idea"|"auto", source?: string }`
- **Classement** : `kind` explicite, sinon auto (texte type « rappelle-moi / todo /
  tâche » → tâche ; sinon note ; `idea` → mémoire type `goal`).
- **Réponses** :
  - `503 CAPTURE_NOT_CONFIGURED` si secret serveur absent (canal non connecté).
  - `401` secret invalide · `400` `text` manquant.
  - `200 { ok:true, stored:{ type, id, title }, source }` **seulement** si un vrai
    enregistrement a été créé.
  - `502 { ok:false, error, detail }` si le stockage échoue (DB) — **jamais** de
    faux succès.

## Sécurité (analyse adversariale)
| Menace | Mitigation |
|---|---|
| N'importe qui poste des captures | Secret partagé obligatoire (`timingSafeEqual`) |
| Canal présenté comme actif alors qu'il ne l'est pas | `503` explicite tant que le secret n'est pas défini |
| Faux succès si DB down | On ne renvoie `ok:true` **que** si un `id` réel existe, sinon `502` |
| Exécution d'action sensible via capture | **Impossible** : l'endpoint ne fait QUE stocker (tâche/mémoire). Aucun email/calendrier. Toute action reste à confirmer via Mon Agent |
| Contournement du gate admin | Endpoint volontairement public MAIS authentifié par son secret ; aucune autre route sensible ouverte |
| Fuite de secret | Secret jamais loggé (vérifié en CI) |

## Limites honnêtes
- **Sens unique** : n8n → TAMS. TAMS ne **lit** pas encore la Google Sheet
  (import Sheet = `google_sheet_sync`, resté `missing`). Le Sheet reste le journal
  tenu par n8n.
- Classement task/note **déterministe simple** (regex), pas d'IA — suffisant et
  gratuit ; affinable plus tard.
- Pas d'anti-duplication (si n8n renvoie deux fois, deux entrées).

## Tests
- Local : typecheck ✅, build API ✅, smoke (503 / 401 / 400 / 502 honnête) ✅.
- CI : capture non configurée = 503 (serveur 4000) ; configurée = 401 mauvais
  secret + `ok:true`/`memory` sur capture valide (serveur 4002, DB up) ; endpoint
  atteignable **malgré le gate admin activé** (preuve de l'exemption).

## Configuration prod (utilisateur)
1. Railway : `TAMS_TELEGRAM_CAPTURE_SECRET=<openssl rand -base64 32>`.
2. n8n : ajouter un nœud **HTTP Request** (voir `docs/n8n-console-setup.md`) :
   `POST https://<tams>/api/integrations/telegram-capture`, en-tête
   `x-tams-capture-secret: <le secret>`, body `{ "text": "={{ $json.message.text }}" }`.
3. Tester : envoyer un message au bot → vérifier la tâche/mémoire dans TAMS + la
   ligne dans la Sheet.

## Rollback
Retirer `TAMS_TELEGRAM_CAPTURE_SECRET` → endpoint renvoie `503` (canal désactivé),
aucune autre incidence. Ou revert de la PR (additif, isolé).
