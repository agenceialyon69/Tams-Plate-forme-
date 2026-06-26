# 10 — Standard Red Team

> Chaque module doit passer ce test. Ne jamais considérer un module comme terminé sans preuve runtime.

## Questions par module

Pour chaque module :
1. **Pourquoi existe-t-il ?** — Valeur quotidienne réelle.
2. **Que se passe-t-il s'il disparaît ?** — Impact réel.
3. **Quel problème résout-il ?** — Problème concret, pas hypothétique.
4. **Peut-il être fusionné ?** — Avec un autre module existant ?
5. **Apporte-t-il une vraie valeur quotidienne ?** — Ou existe-t-il par habitude ?

## Checklist module prêt pour production

- [ ] Route API testée et répondant correctement.
- [ ] UI frontend sans état d'erreur non géré.
- [ ] Fallback gracieux si IA indisponible.
- [ ] Pas de N+1 DB identifiable.
- [ ] Input validé avec Zod.
- [ ] Erreur visible à l'utilisateur si opération échoue.
- [ ] Pas de secret exposé côté client.

## Audit modules — état actuel

| Module | Statut | Issue principale |
|---|---|---|
| Chief of Staff | Fonctionnel | Briefing IA OK, streaming manquant |
| Chat OS | Fonctionnel | Tool-use OK, streaming manquant |
| Memory Graph | Backend OK | Visualisation frontend manquante, `memory_edges` non pushée DB |
| Decision OS | Fonctionnel | Timeline décisions manquante |
| Work OS | Fonctionnel | Vue Kanban manquante, liens contacts↔projets absents |
| Studio | Fonctionnel | Pas de génération media réelle |
| Système | Fonctionnel | UI audit/stats à compléter |
| Mobile | Acceptable | Safe areas, gestes, keyboard non finalisés |

## 5 risques majeurs actuels

1. `memory_edges` non pushée sur Railway DB — le Memory Graph backend est mort en production.
2. Chat sans streaming — UX dégradée sur réponses longues.
3. `middlewares/` vide — pas de rate-limit sur routes IA (coût et abus).
4. Pas de migrations Drizzle — schéma uniquement en code, dérive silencieuse possible.
5. `SESSION_SECRET` non utilisé — surface d'attaque ouverte si sessions activées.
