# Free-stack — politique « gratuit d'abord » & outils retenus

## Principe (ADR-008)
Pour **chaque besoin**, on privilégie dans l'ordre :
1. **gratuit**, 2. sans abonnement, 3. sans crédit caché, 4. simple à maintenir,
5. compatible avec le repo actuel.

> Le **payant est une exception** : seulement si l'alternative gratuite est
> insuffisante, trop instable, ou incompatible avec une contrainte technique ou
> de sécurité **documentée** (à inscrire dans `decisions.md`).

## Stack du projet (déjà en place)
TypeScript · Node.js · Express · React · Vite · Tailwind · Drizzle ORM ·
PostgreSQL · Zod · pnpm · GitHub Actions (CI) · déploiement Railway service unique.

## IA & outils intégrés (tous gratuits)
| Besoin | Outil retenu (gratuit) |
|---|---|
| LLM Copilot | Gemini / Groq / OpenRouter (DeepSeek R1, Qwen) / Ollama — gateway + fallback |
| Transcription audio | Groq Whisper |
| Recherche web | DuckDuckGo (sans clé) · Tavily / Brave / SearXNG (clé gratuite) |
| Génération d'images | Pollinations (sans clé) · Hugging Face (token gratuit) |
| Vidéo (montage, vidéo produit) | **FFmpeg** (alternative libre à CapCut/Premiere) |
| Dépôt + CI | GitHub + GitHub Actions |

## Alternatives gratuites de référence (poste de travail)
À utiliser plutôt que les équivalents payants quand le besoin se présente.
| Payant | Alternative gratuite |
|---|---|
| Photoshop | **GIMP**, **Photopea** (navigateur) |
| Illustrator | **Inkscape** |
| Premiere Pro | **DaVinci Resolve**, **Shotcut** |
| After Effects | **Blender** |
| MS Office | **LibreOffice** |
| 1Password / Dashlane | **KeePass** / KeeWeb |
| WinRAR / WinZip | **7-Zip** / PeaZip |
| Snagit | **ShareX** / Greenshot |
| TeamViewer | **AnyDesk** / UltraVNC |
| Evernote | **Joplin** / Google Keep |
| IDM | **JDownloader** |

## Stack dev gratuite recommandée (référence)
- **Édition** : VS Code (ou VSCodium), Notepad++.
- **Frontend** : Vite, Tailwind, shadcn/ui, Storybook, Playwright (e2e).
- **Backend** : Node + TypeScript, Express (ou Fastify), Zod, Drizzle.
- **DB** : PostgreSQL (prod), SQLite (proto), DBeaver Community (client).
- **API/test** : Bruno (versionnable dans le repo), Hoppscotch, Swagger/OpenAPI.
- **Qualité/Git** : GitHub Actions, Husky + lint-staged, ESLint + Prettier, Vitest.
- **Observabilité** : Sentry free, Umami (self-host), UptimeRobot free.
- **Design/assets** : Figma free / Penpot, Excalidraw, Canva free, Photopea.
- **Déploiement** : Railway (actuel) ; Render / Vercel / Netlify selon le cas.

## Bonus « seulement si utile »
shadcn/ui, React Query (déjà utilisé), Sentry free, Umami, Docker (si besoin clair
de reproductibilité locale ou de déploiement hors Railway).
