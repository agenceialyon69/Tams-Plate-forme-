# 🚀 TAMS Automation Setup - Guide Ultra Simple

## Ce qui se passe automatiquement maintenant :

```
[Bolt] ──┐
[Lovable]├──→ Branche dédiée ──→ Auto-merge main ──→ Railway Deploy
[Replit] ├──────────────────────────────────────→ Auto-deploy
[Base44] ┘
```

---

## 📋 ÉTAPE 1 : Créer un GitHub Token (une seule fois)

### Pour chaque outil, tu as besoin d'un TOKEN :

1. Va sur **https://github.com/settings/tokens/new**
2. Clique sur **Generate new token** → **Generate new token (classic)**
3. Remplis comme ceci :
   - **Token name** : `TAMS-Bolt-Token` (ou le nom de ton outil)
   - **Expiration** : `No expiration`
   - **Scopes** : Coche uniquement ✅ `repo` (accès complet au repo)
4. Clique **Generate token**
5. **COPIE le token** (tu le verras qu'une seule fois !)

**Répète pour chaque outil :**
- `TAMS-Bolt-Token`
- `TAMS-Lovable-Token`
- `TAMS-Replit-Token`
- `TAMS-Base44-Token`

---

## 🔧 ÉTAPE 2 : Configurer chaque outil

### **BOLT.new**
1. Ouvre ton projet Bolt
2. Va dans **Settings** → **GitHub**
3. Configure comme ceci :
   ```
   Repository URL: https://github.com/agenceialyon69/Tams-Plate-forme-
   Branch: bolt-ai
   GitHub Token: [Colle ton TAMS-Bolt-Token]
   Auto-commit: ON
   Commit message: Auto: Bolt update
   ```
4. Clique **Save**

### **Lovable.dev**
1. Ouvre ton projet Lovable
2. Va dans **Settings** → **Integration** → **GitHub**
3. Configure comme ceci :
   ```
   Repository: agenceialyon69/Tams-Plate-forme-
   Branch: lovable-ui
   Token: [Colle ton TAMS-Lovable-Token]
   Auto-sync: ON
   ```
4. Sauvegarde

### **Replit**
1. Ouvre ton projet Replit
2. Clique sur **Settings** (roue engrenage)
3. Cherche **Version Control** → **GitHub**
4. Configure :
   ```
   Repository: https://github.com/agenceialyon69/Tams-Plate-forme-
   Branch: replit-backend
   Token: [Colle ton TAMS-Replit-Token]
   ```
5. Active **Auto-push** et **Auto-commit**

### **Base44** (ou autre)
1. Va dans **Settings** → **Integrations**
2. Configure :
   ```
   Repo: agenceialyon69/Tams-Plate-forme-
   Branch: base44-data
   GitHub Token: [Colle ton TAMS-Base44-Token]
   Auto-sync: YES
   ```

---

## ⚙️ ÉTAPE 3 : Connecter Railway (3 clics)

1. Va sur **https://railway.app**
2. Connecte-toi avec GitHub
3. Clique **+ New Project** → **Deploy from GitHub repo**
4. Sélectionne **agenceialyon69/Tams-Plate-forme-**
5. Railway détecte auto la config
6. Clique **Deploy**

**C'est tout ! À partir de maintenant :**
- Quand tu push sur une branche (bolt-ai, lovable-ui, etc.)
- ↓
- GitHub Actions merge auto sur `main`
- ↓
- Railway voit le push et déploie auto

---

## 📊 Vue d'ensemble des branches

| Outil | Branche | Utilité |
|-------|---------|---------|
| **Bolt** | `bolt-ai` | Front-end AI |
| **Lovable** | `lovable-ui` | Interface |
| **Replit** | `replit-backend` | Backend |
| **Base44** | `base44-data` | Données/Config |

---

## 🆘 Si quelque chose ne fonctionne pas

### ❌ "Token invalid" ou "Access denied"
- Vérifie que le token est valide : https://github.com/settings/tokens
- Régénère-le si besoin

### ❌ "Branche introuvable"
- La branche se crée auto. Si elle n'existe pas :
  ```bash
  git checkout -b bolt-ai
  git push origin bolt-ai
  ```

### ❌ "Railway ne déploie pas"
- Va sur https://railway.app
- Clique sur ton projet
- Vérifie que le **"Deploy on push"** est activé
- Regarde les logs en cas d'erreur

---

## ✅ Vérifier que tout fonctionne

1. Fais un petit changement dans Bolt/Lovable/Replit
2. Regarde sur **GitHub** → **Actions** (devrait montrer un workflow en cours)
3. Attends ~2 min
4. Regarde sur **Railway** → Ton projet devrait se déployer

---

## 🎯 Résumé final

| Étape | Action | Temps |
|-------|--------|-------|
| 1️⃣ | Créer 4 tokens GitHub | 5 min |
| 2️⃣ | Configurer Bolt/Lovable/Replit/Base44 | 10 min |
| 3️⃣ | Connecter Railway | 2 min |
| **Total** | **Et c'est automatique à partir de là !** | **17 min** |

Après ça, plus de soucis de branches, de commits ou de deploy manuels. C'est 100% automatique ! 🚀

---

*Besoin d'aide ? Reviens me voir si un outil ne fonctionne pas.*
