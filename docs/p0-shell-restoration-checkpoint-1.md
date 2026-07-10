# P0 Shell Restoration - Checkpoint 1

Date: 2026-07-10
Branch: `fix/p0-restore-tams-shell-chat-core-v3`

## Incident

The reported regression is that Chat Core V3 became the primary shell instead of
being contained inside the Agent Chat section. The target outcome is not a choice
between the former TAMS shell and Chat Core V3: both must coexist.

## Historical reference status

Requested reference:

- `web/src/App.tsx`
- commit `1de53d1c678373f888724e0a9c3903adf5235894`

Verification result:

- Current repository tree has `src/App.tsx` and `artifacts/tams/src/App.tsx`;
  no `web/src/App.tsx` exists in the current checkout.
- GitHub contents API returned `No commit found for the ref`.
- `git fetch origin 1de53d1c678373f888724e0a9c3903adf5235894` returned
  `upload-pack: not our ref`.

Conclusion: the exact historical file is not available from the current
`agenceialyon69/Tams-Plate-forme-` remote. The restoration therefore uses the
current product files and existing backend routes as the source of truth.

## Current frontend shell audit

Deployed frontend source of truth:

- `artifacts/tams/src/App.tsx`
- `artifacts/tams/src/components/navigation.tsx`

Existing global navigation:

- `/` Accueil
- `/mon-agent` Mon Agent
- `/chat` Chat
- `/travail` Travail
- `/vie` Vie
- `/studio` Studio
- `/systeme` Systeme
- `/capabilities` Capacites
- `/dev-agent-pro` available in router but not visible in sidebar

Gap vs expected shell:

- Missing grouped global sidebar labels:
  - Aujourd'hui
  - Agent Chat
  - Capture rapide
  - Dossiers & Taches
  - Memoire & Decisions
  - Missions
  - Approbations
  - Systeme & Audit
  - Parametres
  - Logout
- Provider status is not shown in the global sidebar.
- Approval count is not shown in the global sidebar.
- Mobile bottom navigation does not expose all required sections.
- Hash-style persistence is not used; Wouter routes already preserve URL state,
  so the fix should use route aliases rather than add a heavy dependency.

## Current Chat Core V3 audit

Chat Core V3 lives in:

- `artifacts/tams/src/pages/chat.tsx`

It already contains:

- conversation list/sidebar inside Chat
- persistent conversations
- new conversation flow
- history
- modes
- attachments
- memory/context panel
- provider/tool result rendering

Important architectural rule: this conversation sidebar must stay inside
`/chat` only and must not replace the global sidebar.

## Existing backend routes to reuse

The following routes already exist and should be reused instead of inventing
fake UI data:

- Today/dashboard:
  - `/api/briefing/today`
  - `/api/dashboard/summary`
  - `/api/dashboard/workload`
  - `/api/dashboard/activity`
- Work/dossiers/tasks:
  - `/api/tasks`
  - `/api/projects`
  - `/api/contacts`
- Memory/decisions:
  - `/api/memories`
  - `/api/decisions`
  - `/api/memories/graph`
- Missions:
  - `/api/missions`
  - `/api/missions/:id`
  - `/api/missions/runtime`
  - `/api/missions/:id/cancel`
  - `/api/missions/:id/approve`
- Approvals/security:
  - `/api/permissions/actions`
  - `/api/permissions/check`
  - `/api/permissions/approve`
  - `/api/permissions/audit`
- System/audit:
  - `/api/healthz`
  - `/api/system/readiness`
  - `/api/system/audit`
  - `/api/system/stats`
  - `/api/system/ai`
  - `/api/version`
- Capture:
  - `/api/life-os/v5/capture`

## Fusion plan

Checkpoint 2:

- Create a real layout layer:
  - `artifacts/tams/src/components/layout/AppShell.tsx`
  - `artifacts/tams/src/components/layout/GlobalSidebar.tsx`
  - `artifacts/tams/src/components/layout/MobileNavigation.tsx`
- Keep `Chat` intact and route it inside the shell.
- Keep existing `navigation.tsx` as a compatibility re-export if needed.

Checkpoint 3:

- Restore route aliases/pages:
  - `/today`
  - `/capture`
  - `/dossiers`
  - `/memory`
- Reuse existing Accueil, Travail and Systeme surfaces where possible.
- Use independent loaders or existing React Query hooks so one failing resource
  does not blank all sections.

Checkpoint 4:

- Add Missions, Approvals and Settings pages using existing backend routes.
- Keep System & Audit backed by the existing Systeme page/routes.

Checkpoint 5:

- Ensure Chat Core V3 remains reachable only under Agent Chat.
- Ensure conversation sidebar is not rendered on business pages.

Checkpoint 6:

- Restore mobile navigation:
  - Today
  - Chat
  - Dossiers
  - Missions
  - Approvals
  - Menu for remaining sections

Checkpoint 7:

- Add Playwright regression coverage:
  - all global nav entries exist
  - all required sections open
  - ChatWorkspace still functions
  - ConversationSidebar absent outside `/chat`
  - mobile menu exposes all sections
  - reload preserves route
- Run typecheck/build/E2E as available.

## Non-goals

- No backend refactor.
- No fake provider status.
- No duplicate Chat implementation.
- No direct work on `main`.
- No merge to `main`.
