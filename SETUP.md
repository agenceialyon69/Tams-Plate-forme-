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

## Option A — Lancer en local (le plus simple : 3 commandes)

> **Mode service unique** : un seul programme sert à la fois l'API et le site,
> sur **une seule URL**. Pas de CORS, pas de second serveur à gérer.

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
- `DATABASE_URL` → ta connection string Postgres (préalable n°1).
- `API_AUTH_TOKEN` → ton mot de passe d'accès. Génère-le avec :
  ```bash
  openssl rand -hex 32
  ```
  Copie le résultat dans `.env`. **C'est ce token que tu colleras dans l'app.**
- Laisse `PORT=8080` et `BASE_PATH=/`.
- Laisse `VITE_API_URL` **vide** (mode service unique).
- (Optionnel) `GEMINI_API_KEY` et `GROQ_API_KEY` pour l'IA et la voix.

> `.env` est ignoré par git : tes secrets ne partiront jamais dans le dépôt.

### Étape 3 — Tout préparer (une commande)
```bash
bash scripts/setup.sh
```
Vérifie la config, installe, **crée les tables** et compile l'API + le site.
Relançable sans risque.

### Étape 4 — Démarrer (une commande, une URL)
```bash
bash scripts/start.sh
```
Ouvre **http://localhost:8080**, colle ton `API_AUTH_TOKEN` dans l'écran
« KORE — Accès ». C'est tout — le token reste mémorisé dans ce navigateur.

> **Tu développes le code ?** Utilise plutôt `bash scripts/dev.sh` (rechargement
> à chaud ; le site est sur `http://localhost:5173` et l'API sur `:8080`).

---

## Option B — Déployer en ligne (un seul service, recommandé)

Le dépôt est déjà configuré pour **Railway** (`railway.toml`) en mode service
unique : Railway construit le site **et** l'API, puis l'API sert tout sur une
seule URL.

1. Crée un projet sur [Railway](https://railway.app) à partir du dépôt.
2. Ajoute une base **PostgreSQL** au projet (Railway fournit `DATABASE_URL`),
   ou colle la tienne.
3. Dans **Variables**, ajoute :
   - `API_AUTH_TOKEN` (ton `openssl rand -hex 32`)
   - `GEMINI_API_KEY`, `GROQ_API_KEY` (optionnels)
   - (`PORT`, `NODE_ENV`, `BASE_PATH` sont déjà fournis par `railway.toml`)
4. **Crée les tables une fois** : depuis ton poste, avec le `DATABASE_URL` de prod
   dans `.env`, lance `pnpm --filter @workspace/db run push`.
5. Déploie. Ouvre l'URL Railway, colle ton token. Fini — **pas de CORS, pas de
   second hébergement.**

> Vérifie au passage que `https://<ton-app>/api/healthz` répond `{"status":"ok"}`.

> **Hébergement séparé (avancé)** : tu peux toujours héberger le site à part
> (ex. Vercel). Dans ce cas, définis `VITE_API_URL` (côté site) = URL de l'API,
> et `FRONTEND_URL` (côté API) = origine exacte du site, pour le CORS.

---

## Récapitulatif des variables

| Variable | Où | Obligatoire | Rôle |
|---|---|---|---|
| `DATABASE_URL` | serveur | ✅ | Connexion Postgres |
| `API_AUTH_TOKEN` | serveur | ✅ | Token d'accès (≥ 16 car.) |
| `PORT` | serveur | ✅ | Port d'écoute (8080) |
| `BASE_PATH` | build | ✅ | Chemin du site (`/`) |
| `GEMINI_API_KEY` | serveur | pour l'IA | Extraction / analyse / bilans |
| `GROQ_API_KEY` | serveur | pour la voix | Transcription audio |
| `FRONTEND_URL` | serveur | seulement si site séparé | Origine autorisée (CORS) |
| `VITE_API_URL` | site | seulement si site séparé | URL de l'API à appeler |

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
