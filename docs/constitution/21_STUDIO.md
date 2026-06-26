# 21 — Studio

## Rôle

Centraliser les assets créatifs et les outils de génération de contenu.  
Non un outil de design — un outil de production de contenu assisté par IA.

## Catégories d'assets

- Documents (prompts, templates, notes structurées)
- Scripts (vidéo, audio, présentation)
- Images (générées ou importées)
- Références (URLs, citations, sources)

## Fonctionnalités actuelles

- CRUD assets (`GET/POST/DELETE /api/assets`).
- Catégorisation par type.
- Affichage liste avec filtres.

## Intégration IA

- Génération de contenu : depuis le Chat OS (tool-use).
- Refinement : IA peut améliorer un asset existant via le chat.

## Manquant

- Génération d'images réelle (DALL-E / Stable Diffusion local).
- Transcription audio (Whisper).
- Export vers format final (PDF, DOCX, etc.).
- Lien Studio ↔ Workspace (asset attaché à un projet).

## Règle

Le Studio existe uniquement si l'utilisateur produit régulièrement du contenu.  
Si un asset n'est jamais réutilisé, il n'a pas sa place ici.
