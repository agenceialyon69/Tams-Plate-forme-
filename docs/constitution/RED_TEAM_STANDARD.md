# TAMS — Standard Red Team

> Chaque module doit passer ce test. Ne jamais considérer un module comme terminé sans preuve.

## Questions par module

Pour chaque module, vérifier :
1. **Pourquoi existe-t-il ?** — Quelle valeur quotidienne apporte-t-il ?
2. **Que se passe-t-il s'il disparaît ?** — Impact réel sur l'utilisateur ?
3. **Quel problème résout-il ?** — Problème concret, pas hypothétique.
4. **Peut-il être fusionné ?** — Avec un autre module ?
5. **Apporte-t-il une vraie valeur quotidienne ?** — Ou existe-t-il par habitude ?

## Règles

- Ne pas garder un module par habitude.
- Chercher les doublons, la complexité inutile, les fausses urgences.
- Ne jamais considérer un module comme terminé sans preuve runtime.
- Si une zone fait cheap, la refaire.
- Si une zone est floue, la simplifier.

## Audit actuel (commit efb038ac)

### Accueil — Chief of Staff
- **Pourquoi ?** Centraliser la vue quotidienne.
- **Problème** : Le briefing est hardcoded, pas IA. Contredit "AI OS".
- **Verdict** : Existe légitimement, mais le contenu doit devenir intelligent.

### Chat
- **Pourquoi ?** Cœur du système, 90% des actions.
- **Problème** : Pas de tool-use, pas d'injection mémoire. L'IA ne peut pas agir.
- **Verdict** : Existe légitimement, mais sous-exploité.

### Travail — Work OS
- **Pourquoi ?** Tâches + projets + contacts quotidiens.
- **Problème** : List only, pas de vue Kanban, pas de liens contacts ↔ projets.
- **Verdict** : Existe légitimement. Améliorer l'intégration.

### Studio
- **Pourquoi ?** Centraliser les assets créatifs.
- **Problème** : Pas de génération de média réel, seulement des scripts.
- **Verdict** : Légitime mais à connecter au reste du système.

### Système — Memory Graph + Decision OS
- **Pourquoi ?** Mémoire et décisions sont le cœur d'un AI OS.
- **Problème** : Memory Graph est plat (pas un graphe). Decision OS a un score aléatoire.
- **Verdict** : Légitime, mais le cœur est sous-exploité.
