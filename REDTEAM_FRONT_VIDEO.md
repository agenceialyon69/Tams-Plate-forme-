# RED TEAM — Front vidéo réelle dans le Chat

## Objectif
Corriger le vrai bug vu par l'utilisateur : « génère une vidéo TikTok » → le Chat
rendait un **plan seul** avec le message mensonger « génération vidéo réelle pas
encore connectée, aucun fichier généré ». Le backend `video.generate` produit
pourtant un **vrai MP4** (diaporama composé Pollinations + FFmpeg).

## Cause (frontend)
`artifacts/tams/src/pages/chat.tsx` interceptait l'intent `generate_video`,
appelait `/api/studio/orchestrate` (plan) et **fabriquait** une réponse texte
avec le mensonge — **sans jamais appeler** `video.generate`.

## Correctif
- La branche `generate_video/studio_create` appelle maintenant
  **`POST /api/capabilities/execute { capabilityId:"video.generate", input }`** →
  récupère `artifact.url` (MP4) → l'affiche dans le Chat via un marqueur
  `VIDEO:<url>`.
- **Rendu média ajouté** à `StructuredContent`/`parseContent` : les lignes
  `VIDEO:` / `IMAGE:` / `AUDIO:` deviennent un lecteur `<video>` / `<img>` /
  `<audio>`. (Réutilisable partout.)
- Suppression du texte mensonger « pas encore connectée / aucun fichier généré »
  (branche principale ET fallback réseau).
- **Honnêteté maintenue** : « diaporama composé FFmpeg, pas de l'IA vidéo type
  Veo/Runway » — MAIS un vrai fichier est livré. En cas d'échec réel
  (réseau/ffmpeg), message clair, pas de faux plan.

## Fichiers
| Fichier | Rôle |
|---|---|
| `artifacts/tams/src/pages/chat.tsx` | Appel réel `video.generate` + rendu média `VIDEO:/IMAGE:/AUDIO:` + fin des messages mensongers |

## Tests
- Frontend `typecheck` OK · `build` OK (CI construit le front).
- Rendu réel du MP4 (Pollinations + FFmpeg) : **vérifiable en prod Railway**
  (ffmpeg présent au runtime) — non exécutable en CI/sandbox sans ffmpeg. Le
  chemin d'échec renvoie un message honnête (testé par construction).

## Limites honnêtes
- Vidéo = **diaporama composé** (images Pollinations + texte + musique HF), pas
  de génération IA vidéo premium (n'existe pas en gratuit fiable).
- La qualité dépend des images Pollinations ; fournir de vraies photos produit
  améliore nettement le rendu.

## Prochaine étape
Front Brique 2 : remplacer la liste de capacités périmée (`main.tsx`) par les
vraies capacités, et mettre en avant UN agent capable (retirer les anciens).

## Rollback
Revert de la PR (changement isolé au Chat frontend).
