# Mettre TAMS en service — guide débutant (objectif : l'utiliser sur ton téléphone)

TAMS est une **application web** : une fois mise en ligne, tu obtiens un lien
(une URL). Tu ouvres ce lien sur ton téléphone et tu l'ajoutes à l'écran
d'accueil → elle se comporte comme une vraie app, **sans passer par l'App Store
ni le Play Store**.

Tu n'as **aucune commande à taper** : la base de données crée ses tables toute
seule au premier démarrage.

---

## Le token, c'est quoi ?

C'est un **mot de passe secret** que tu choisis toi-même (tu ne le récupères
nulle part). Il sert à deux endroits, avec **la même valeur** :
1. tu le mets dans la configuration du serveur (une variable `API_AUTH_TOKEN`) ;
2. tu le colles dans l'app, dans la case « TAMS — Accès » au premier lancement.

Un token déjà prêt (tu peux l'utiliser tel quel) :
```
ca262dff8b9b6ca3ffbcdf337df5505b428a18439ee9bdfb9a2d499bdcb09fe5
```

---

## Mettre en ligne avec Railway (recommandé, zéro installation)

Faisable depuis un ordinateur **ou** depuis le navigateur de ton téléphone.

1. **Crée un compte** sur [railway.app](https://railway.app) (connexion avec
   GitHub).
2. **New Project → Deploy from GitHub repo** → choisis ce dépôt
   (`tams-plate-forme-`).
3. **Ajoute une base de données** : dans le projet, bouton **New → Database →
   PostgreSQL**. Railway crée et relie `DATABASE_URL` tout seul.
4. **Ajoute ton token** : ouvre le service de l'app → onglet **Variables** →
   **New Variable** :
   - Nom : `API_AUTH_TOKEN`
   - Valeur : le token ci-dessus (ou le tien)
   - *(facultatif)* `GEMINI_API_KEY` et `GROQ_API_KEY` pour l'IA et la dictée.
5. **Déploie** (Railway le fait automatiquement). Quand c'est vert, ouvre
   l'onglet **Settings → Networking → Generate Domain** : tu obtiens ton URL
   publique (ex. `https://kore-production.up.railway.app`).
6. **Ouvre cette URL**, colle ton token dans « TAMS — Accès ». 🎉

> Les variables `PORT`, `NODE_ENV` et `BASE_PATH` sont déjà fournies par le
> fichier `railway.toml` du dépôt — tu n'as pas à t'en occuper.

---

## Installer TAMS sur ton téléphone (comme une app)

Une fois l'URL ouverte sur le tél et le token saisi :

- **iPhone (Safari)** : bouton **Partager** → **Sur l'écran d'accueil**.
- **Android (Chrome)** : menu **⋮** → **Ajouter à l'écran d'accueil**.

Une icône TAMS apparaît. Tu l'ouvres comme n'importe quelle app, en plein écran.

---

## (Optionnel) Tester sur un ordinateur d'abord

Si tu veux essayer en local avant de mettre en ligne, il te faut **Node.js 24**
et **pnpm**, puis dans un Terminal, à la racine du projet :

```bash
cp .env.example .env          # mets DATABASE_URL + API_AUTH_TOKEN dedans
bash scripts/setup.sh         # installe et compile (une fois)
bash scripts/start.sh         # démarre tout
```
Puis ouvre **http://localhost:8080** et colle ton token.

*(Pour développer avec rechargement à chaud : `bash scripts/dev.sh`, le site est
alors sur `http://localhost:5173`.)*

---

## Récapitulatif des variables

| Variable | Obligatoire | Rôle |
|---|---|---|
| `DATABASE_URL` | ✅ (fournie par Railway) | Connexion à la base |
| `API_AUTH_TOKEN` | ✅ | Ton mot de passe d'accès (≥ 16 caractères) |
| `GEMINI_API_KEY` | pour l'IA | Analyse des captures, décisions, bilans |
| `GROQ_API_KEY` | pour la voix | Dictée vocale |
| `PORT`, `NODE_ENV`, `BASE_PATH` | auto | Déjà réglées par `railway.toml` |
| `FRONTEND_URL`, `VITE_API_URL` | seulement si site hébergé séparément | CORS / URL de l'API |

---

## En cas de souci

- **Le serveur ne démarre pas, « API_AUTH_TOKEN must be set »** → la variable
  est absente ou trop courte (< 16 caractères). C'est voulu (sécurité).
- **L'app redemande sans cesse le token** → la valeur collée ne correspond pas
  exactement à `API_AUTH_TOKEN`. Recopie-la sans espace.
- **Pas d'analyse IA / pas de dictée** → `GEMINI_API_KEY` / `GROQ_API_KEY`
  manquantes. L'app fonctionne quand même, sans ces fonctions.
- **Vérifier que le serveur tourne** : ouvre `https://<ton-url>/api/healthz`,
  ça doit afficher `{"status":"ok","db":"ready"}`.
  Si `db` vaut **`"connecting"`**, le serveur tourne mais **n'arrive pas à
  joindre la base** → vérifie la variable `DATABASE_URL` (et que la base
  PostgreSQL existe et est reliée au service).
