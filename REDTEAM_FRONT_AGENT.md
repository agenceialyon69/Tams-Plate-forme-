# RED TEAM — Surfacer l'agent capable + capacités honnêtes

## Le vrai problème vu par l'utilisateur
Deux plaintes répétées :
1. « Voici la seule capacité des agents : *Mes capacités TAMS AI* … » → une liste
   **périmée et mensongère** (dit que vidéo/audio ne sont pas configurés, ne parle
   ni du web, ni des documents, ni de l'agent codeur).
2. « J'avais demandé UN seul agent capable… il n'est toujours pas dans la
   plateforme, il y a toujours les anciens agents incapables. »

## Cause racine
- L'agent capable (`/mon-agent` — Personal Operator : GitHub/PR, red team, tâches,
  mémoire, Studio, **confirmation avant action sensible**) **existait mais n'était
  pas dans la navigation**. Il était donc injoignable : l'utilisateur ne voyait que
  la page **Agents** (11 rôles « mode plan » = les « anciens agents incapables »).
- La réponse « mes capacités » du Chat (`CAPABILITIES_RESPONSE` dans
  `conversations.ts`) était une chaîne **codée en dur** qui mentait, alors que le
  backend fait réellement : recherche web, lire-URL, analyse de documents, agent
  codeur (PR), vraie vidéo MP4 FFmpeg, musique HF MusicGen (si `HF_TOKEN`).

## Correctif (1 PR ciblée)
| Fichier | Changement |
|---|---|
| `artifacts/tams/src/components/navigation.tsx` | **« Mon Agent » ajouté à la nav** (sidebar + bottom nav), en position hero juste après Accueil. L'agent capable devient joignable. |
| `artifacts/api-server/src/routes/conversations.ts` | Réécriture de `CAPABILITIES_RESPONSE` → **capacités réelles et honnêtes** (web, lire-URL, documents, code/PR, Studio vidéo MP4 réelle, musique HF conditionnelle), et distinction claire de ce qui n'est **pas** branché (Gmail/Agenda, IA vidéo premium, WhatsApp). |
| `artifacts/tams/src/pages/agents.tsx` | Bandeau clarifié : ces rôles sont **plan seul** (aucune action réelle) → renvoi vers **Mon Agent** pour l'agent qui agit. |
| `artifacts/tams/src/pages/mon-agent.tsx` | Commentaire périmé corrigé (« pas de nouvel item de nav » → surfacé dans la nav). |

## Honnêteté (règles projet)
- Aucune capacité affichée comme « faite » sans branchement réel derrière.
- Musique annoncée **conditionnelle** à `HF_TOKEN` (sinon « à connecter »).
- Vidéo = **vrai fichier MP4** mais diaporama FFmpeg, **pas** de l'IA vidéo type
  Veo/Runway (dit explicitement).
- Gmail/Agenda/WhatsApp/IA vidéo premium listés comme **non branchés**.

## Tests
- `typecheck` front + api : **OK**.
- `build` frontend : **OK**.
- Aucune route/test E2E existant modifié (la liste de routes testées reste valable ;
  `/mon-agent` déjà routé dans `App.tsx`).

## Limites honnêtes
- Les 11 rôles « Agents » restent en mode plan (non supprimés pour ne rien casser) ;
  ils sont désormais **cadrés honnêtement** et l'agent capable est mis en avant.
- Le rendu réel (nav visible, vidéo MP4) se confirme **en prod Railway** — à vérifier
  côté utilisateur (capture) pour boucler la boucle.

## Prochaine étape
Veille RSS + digest, puis `RUNBOOK.md` final (variables Railway, états des capacités,
3 actions prioritaires côté utilisateur).

## Rollback
Revert de la PR (changements isolés : 1 fichier nav, 1 réponse backend, 2 libellés UI).
