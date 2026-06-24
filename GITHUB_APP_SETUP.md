# 🔐 GitHub App Setup (Optionnel - Plus sécurisé)

## ⚠️ Si tu veux utiliser une GitHub App au lieu des tokens

### Créer la GitHub App

1. Va sur https://github.com/settings/apps/new
2. Remplis comme ceci :
   - **GitHub App name**: `TAMS-Automation`
   - **Homepage URL**: `https://github.com/agenceialyon69/Tams-Plate-forme-`
   - **Webhook URL**: (laisse vide)
   - **Permissions**:
     - ✅ Contents: Read & write
     - ✅ Pull requests: Read & write
     - ✅ Metadata: Read-only

3. Clique **Create GitHub App**

### Installer l'app sur ton repo

1. Dans la page de l'app, clique **Install App**
2. Sélectionne **Only select repositories**
3. Choisis `Tams-Plate-forme-`
4. Clique **Install**

### Récupérer la clé privée

1. Scroll down → **Private keys**
2. Clique **Generate a private key**
3. Un fichier `.pem` se télécharge
4. **Garde-le secret !** (comme un mot de passe)

---

## 📌 Note

**Pour commencer, les tokens suffisent. La GitHub App c'est pour plus tard si tu veux plus de sécurité.**

Utilise les tokens pour l'instant, c'est plus simple ! 👍
