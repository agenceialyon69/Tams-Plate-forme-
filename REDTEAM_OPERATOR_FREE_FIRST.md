# RED TEAM — Mon Agent / Operator free-first (PR #1)

> Référence : issues #93 (plan) et #94 (scope de cette PR).
> Objectif : TAMS = **UN** agent personnel privé, free-first, pilotable depuis le chat.
> Chat = cockpit · Mon Agent = opérateur central · Outils = capacités internes contrôlées.

## 1. Ce qui a été audité

- `lib/dev-agent-ci-operator.ts` + `routes/dev-agent-ci.ts` : base GitHub/CI **réutilisée telle quelle**
  (status, dispatch, runs, jobs, logs, rerun-failed, create PR, repair-loop timeboxée, flags
  `TAMS_DEV_AGENT_CI_WRITE`/`TAMS_DEV_AGENT_PR_WRITE`, redaction des secrets, head `main/master` interdit).
- `routes/capability-registry.ts`, `chat-capabilities.ts`, `system-readiness.ts` : existants, non dupliqués.
- Auth : Supabase + gate global `REQUIRE_AUTH` (=true en prod). **Aucun personal gate `TAMS_PERSONAL_ACCESS_*`
  n'existe dans le repo ni dans les branches** (`fix/personal-hardening` = hardening Supabase, pas un gate cookie).
- Mémoire/tâches/décisions/projets : routes + `runTool` (Tool Orchestrator) existants.
- Aucune route `/api/operator/*` ni page « Mon Agent » n'existait avant cette PR.

## 2. Ce qui existe déjà (et n'a PAS été reconstruit)

| Brique | Réutilisation |
|---|---|
| Dev Agent CI Operator | importé directement dans `lib/operator.ts` (aucun 2ᵉ opérateur CI) |
| `dev.agent.ci` (capability execute) | conservé tel quel ; l'operator y renvoie |
| Tool Orchestrator (`runTool`) | tâches / mémoire / décisions / image Studio |
| `lib/ai.ts` (routeur free-first) | analyse Red Team |
| Gate `REQUIRE_AUTH` | les routes operator héritent de la protection globale — **non modifié** |

## 3. Ce qui a été ajouté

- `artifacts/api-server/src/lib/operator.ts` — cœur de Mon Agent :
  - détection d'intent **déterministe** (15 intents : status, capabilities, github_ci, github_code,
    red_team, memory, task, decision, file, studio, gmail, calendar, telegram_sheet, automation, unknown) ;
  - réponses **structurées** (message, intent, capabilityId, actionPlan, requiresConfirmation,
    confirmationId, executionStatus, evidence, warnings, nextStep) ;
  - store de **confirmations** en mémoire (TTL 15 min) pour les actions sensibles ;
  - 22 capacités déclarées avec status honnête (`available/configured/missing/disabled`) + nextSetupStep ;
  - readiness 13 volets PASS/WARN/FAIL avec cause/risque/prochaine action.
- `artifacts/api-server/src/routes/operator.ts` — `GET status|capabilities|readiness|actions/:id`,
  `POST chat|confirm|cancel`.
- `artifacts/tams/src/pages/mon-agent.tsx` + route `/mon-agent` — cockpit minimal (chat + boutons
  Confirmer/Annuler + readiness + capacités). **Pas de nouvel item de nav mobile** (déjà 8 items ;
  précédent existant : `/dev-agent-pro` est aussi une route sans item de nav).
- Ce rapport.

## 4. Règles appliquées

- **Actions sensibles ⇒ confirmation obligatoire** : dispatch CI, rerun jobs échoués, création de PR
  (v1 : seules les actions `dev.agent.ci` sont exécutables après confirmation). Double garde-fou :
  même confirmées, elles échouent proprement si les flags d'écriture sont off.
- **Lecture sans confirmation** : status, capabilities, readiness, runs, logs, plans.
- **Honnêteté** : Gmail / Calendar / fichiers / Telegram-Sheet non connectés ⇒ réponse explicite
  « pas encore connecté » + étape de setup. Un échec DB (ex. `create_task`) est **remonté tel quel**.
- **Jamais** main/master en head, jamais de merge, free-first uniquement, zéro multi-tenant/paiement.

## 5. Fichiers modifiés

- `artifacts/api-server/src/lib/operator.ts` (nouveau)
- `artifacts/api-server/src/routes/operator.ts` (nouveau)
- `artifacts/api-server/src/routes/index.ts` (+2 lignes de montage)
- `artifacts/tams/src/pages/mon-agent.tsx` (nouveau) + `App.tsx` (+2 lignes de route)
- `REDTEAM_OPERATOR_FREE_FIRST.md` (nouveau)

## 6. Tests lancés (preuves)

- `pnpm --filter @workspace/api-server run typecheck` ✅ · `run build` ✅
- `pnpm --filter @workspace/tams run typecheck` ✅ · `run build` ✅
- Smoke test local (serveur bootée, DB volontairement coupée pour tester l'honnêteté) :
  - `GET /api/operator/status` → 9/22 capacités actives, gate détecté ✅
  - `GET /api/operator/capabilities` → 22 capacités ✅
  - `GET /api/operator/readiness` → FAIL global avec causes exactes (DB down, personal gate absent) ✅
  - chat « statut CI » → intent github_ci, lecture des vrais runs GitHub ✅
  - chat « prépare une PR » → requiresConfirmation=true + confirmationId ✅
  - `POST /operator/confirm` (flag PR off) → échec **propre** « TAMS_DEV_AGENT_PR_WRITE=true requis » ✅
  - `POST /operator/cancel` → cancelled ✅ · `GET /operator/actions/:id` → pending ✅
  - chat « ajoute une tâche » avec DB down → erreur remontée honnêtement ✅
  - chat gmail/calendar/telegram → « pas encore connecté » ✅ · « blorp zork » → unknown ✅
- Bug trouvé et corrigé pendant l'auto-red-team : les regex d'intent ne matchaient pas les pluriels
  (« résume mes **emails** » → unknown). Corrigé + re-testé.

## 7. Risques restants / limites assumées

- **Confirmations en mémoire** : perdues au redéploiement (usage personnel mono-instance : acceptable v1 ;
  persistance DB possible en PR ultérieure).
- **Détection d'intent par mots-clés** : déterministe et testable mais limitée ; un étage LLM optionnel
  pourra affiner (free-first) sans changer le contrat de réponse.
- **`create_task`/`create_memory` peuvent échouer en prod** (erreur DB observée au diagnostic — probable
  contrainte ajoutée par le scoping user) : l'operator remonte l'erreur, il ne la masque pas. À corriger
  dans une PR dédiée (hors scope ici).
- **Page `/mon-agent` sans item de nav** : accessible par URL directe (comme `/dev-agent-pro`). Ajout
  d'un lien après validation du gate personnel, pour ne pas surcharger la nav mobile.
- **REQUIRE_AUTH=true en prod** : les routes operator exigent un JWT Supabase, comme tout `/api`.
  Non modifié volontairement (consigne). La page héritera du même comportement que le reste de l'UI.

## 8. Prochaine PR recommandée (ordre issue #93)

1. **Personal access gate** (`TAMS_PERSONAL_ACCESS_ENABLED/USERNAME/PASSWORD/SECRET`, cookie
   HttpOnly/SameSite, login simple) → validation en prod → alors seulement `REQUIRE_AUTH=false`.
2. Telegram + Google Sheet capture (webhook + import CSV, anti-duplication par hash).
3. Fichiers (upload + extraction PDF/Word/CSV + résumé).
4. Gmail OAuth (lecture + brouillons, jamais d'envoi auto).
5. Calendar OAuth (lecture, création confirmée).
6. Automatisations gratuites (scheduler interne / GitHub Actions cron).
