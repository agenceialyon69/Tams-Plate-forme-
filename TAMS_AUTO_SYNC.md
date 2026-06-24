# 🚀 TAMS Auto-Sync - Zéro Config

**C'est automatique. Tu n'as rien à configurer.**

## Comment ça marche ?

```
1. Tu ouvres Bolt/Lovable/Replit/Base44
2. Tu fais des changements
3. ↓
4. TAMS Auto-Sync détecte auto les changements
5. ↓
6. Commit auto sur GitHub
7. ↓
8. Merge auto sur main
9. ↓
10. Railway déploie auto
```

**Zéro interaction. Zéro configuration.**

---

## ⚡ Installation rapide (30 secondes)

### Option 1 : Replit (Recommandé)
```bash
npm install
npm start
```
✅ C'est fait ! Le script tourne et surveille les changements.

### Option 2 : Ton ordi (Linux/Mac/Windows)
```bash
node tams-auto-sync.js
```
✅ Le script tourne en arrière-plan et surveille ton dossier.

### Option 3 : Laisser tourner en permanence
```bash
npm run install-daemon
```
✅ Le script se lance automatiquement au démarrage.

---

## 🎯 C'est tout !

À partir de maintenant :
- ✅ Chaque changement dans Bolt/Lovable/Replit/Base44 → Auto-sync
- ✅ Auto-commit sur la branche dédiée (bolt-ai, lovable-ui, etc.)
- ✅ Auto-merge vers main
- ✅ Railway auto-déploie

**Aucune configuration. Aucun token. Aucun webhook.**

---

## 📊 Branches automatiques

| Outil | Branche |
|-------|---------|
| Bolt | `bolt-ai` |
| Lovable | `lovable-ui` |
| Replit | `replit-backend` |
| Base44 | `base44-data` |

Si tu crées un dossier avec un autre nom, on crée une branche `auto-update`.

---

## ❓ Ça ne marche pas ?

**"Le script s'arrête"**
- Lance-le à nouveau : `npm start`

**"Je ne vois pas de changements sur GitHub"**
- Vérifie que tu es bien dans le dossier du projet
- Lance le script avec `npm start`

**"Comment je l'arrête ?"**
- Press **Ctrl+C**

---

**Voilà ! C'est vraiment tout ce qu'il y a à faire.** 🎉
