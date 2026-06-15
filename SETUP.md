# Mettre KORE en service — guide pas à pas

Ce guide liste **tout ce que tu dois faire toi-même**. Tout le reste (code, sécurité,
scripts) est déjà prêt dans le dépôt.

Deux options : **A) tester en local** (le plus simple pour commencer) ou
**B) déployer en ligne** (Railway pour l'API + Vercel pour le site).

---

## Ce dont tu as besoin avant de commencer

1. **Node.js 24** et **pnpm** installés (`npm install -g pnpm`).
2. **Une base PostgreSQL.** Gratuit et rapide : [Neon](https://neon.tech) ou
   [Supabase](https://supabase.com). Tu récupères une *connection string* qui
   ressemble à `postgres://user:motdepasse@host:5432/nom_de_base`.
3. **(Optionnel, pour l'IA)** une clé **Google Gemini**
   ([aistudio.google.com](https://aistudio.google.com/app/apikey)) et une clé
   **Groq** ([console.groq.com/keys](https://console.groq.com/keys)) pour la dictée vocale.

---

## Option A — Lancer en local (recommandé pour démarrer)

### Étape 1 — Récupérer le code
```bash
git clone <url-du-repo>
cd Tams-Plate-forme-
git checkout claude/red-team-audit-qbtht9   # tant que la PR n'est pas mergée
```

### Étape 2 — Créer ton fichier de configuration
```bash
cp .env.example .env
```
Ouvre `.env` et remplis **au minimum** :
- `DATABASE_URL` → ta connection string Postgres (étape « besoin » n°2).
- `API_AUTH_TOKEN` → ton mot de passe d'accès. Génère-le avec :
  ```bash
  openssl rand -hex 32
  ```
  Copie le résultat dans `.env`. **C'est ce token que tu colleras dans l'app.**
- `PORT` → laisse `8080`.
- (Optionnel) `GEMINI_API_KEY` et `GROQ_API_KEY` si tu veux l'IA et la voix.

> `.env` est ignoré par git : tes secrets ne partiront jamais dans le dépôt.

### Étape 3 — Installer + créer les tables + construire (une commande)
```bash
bash scripts/setup.sh
```
Ce script vérifie ta config, installe les dépendances, **crée les tables dans la
base** et compile tout. Relançable sans risque.

### Étape 4 — Démarrer l'application
```bash
bash scripts/dev.sh
```
- L'API démarre sur `http://localhost:8080`.
- Le site démarre (Vite affiche l'URL, en général `http://localhost:5173`).

### Étape 5 — Première connexion
1. Ouvre l'URL du site dans ton navigateur.
2. Un écran « KORE — Accès » s'affiche : colle ton `API_AUTH_TOKEN`.
3. C'est tout — tu es dedans. Le token reste mémorisé dans ce navigateur.

---

## Option B — Déployer en ligne

### B.1 — L'API (Railway, déjà configurée via `railway.toml`)
1. Crée un projet sur [Railway](https://railway.app) à partir du dépôt.
2. Dans **Variables**, ajoute :
   - `DATABASE_URL` (ta base Postgres ; Railway peut aussi en provisionner une)
   - `API_AUTH_TOKEN` (ton `openssl rand -hex 32`)
   - `FRONTEND_URL` = l'URL exacte de ton site Vercel (ex. `https://kore.vercel.app`)
   - `GEMINI_API_KEY`, `GROQ_API_KEY` (optionnels)
   - `PORT` = `8080`
3. **Crée les tables une fois** : depuis ton poste, avec le `DATABASE_URL` de prod
   dans `.env`, lance `pnpm --filter @workspace/db run push`.
4. Déploie. Vérifie que `https://<ton-api>/api/healthz` répond `{"status":"ok"}`.

### B.2 — Le site (Vercel)
1. Importe le dépôt sur [Vercel](https://vercel.com), dossier racine
   `artifacts/kore`.
2. Build command : `pnpm --filter @workspace/kore run build` — output : `dist`.
3. Variable d'environnement : `VITE_API_URL` = l'URL de ton API Railway
   (ex. `https://kore-api.up.railway.app`).
4. Déploie, ouvre le site, colle ton token. Fini.

> **Important CORS** : `FRONTEND_URL` (sur l'API) doit correspondre **exactement**
> à l'origine du site, sinon le navigateur bloque les appels.

---

## Récapitulatif des variables

| Variable | Où | Obligatoire | Rôle |
|---|---|---|---|
| `DATABASE_URL` | API | ✅ | Connexion Postgres |
| `API_AUTH_TOKEN` | API | ✅ | Token d'accès (≥ 16 car.) |
| `PORT` | API | ✅ | Port d'écoute (8080) |
| `FRONTEND_URL` | API | recommandé | Origine autorisée (CORS) |
| `GEMINI_API_KEY` | API | pour l'IA | Extraction / analyse / bilans |
| `GROQ_API_KEY` | API | pour la voix | Transcription audio |
| `VITE_API_URL` | Site | ✅ | URL de l'API à appeler |

---

## En cas de souci

- **L'API ne démarre pas, message « API_AUTH_TOKEN must be set »** → la variable
  est absente ou trop courte. C'est volontaire (sécurité).
- **Le site affiche l'écran d'accès en boucle** → token incorrect, ou l'API
  renvoie 401. Vérifie que le token collé est exactement celui de `.env`.
- **Les appels échouent avec une erreur CORS** → `FRONTEND_URL` ne correspond pas
  à l'origine du site.
- **Pas d'analyse IA / pas de dictée** → `GEMINI_API_KEY` / `GROQ_API_KEY` manquantes
  (l'app fonctionne quand même, sans l'IA).
