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
| Chief of Staff | Fonctionnel | Briefing IA OK, fallback gracieux |
| Chat OS | Fonctionnel | Tool-use OK, streaming SSE implémenté |
| Memory Graph | Backend OK | Visualisation frontend manquante, `memory_edges` non pushée DB |
| Decision OS | Fonctionnel | Score analytique implémenté, lien tâches OK |
| Work OS | Fonctionnel | Vue Kanban implémentée, liens contacts↔projets absents |
| Studio | Fonctionnel | CRUD assets OK, génération scripts IA OK |
| Système | Fonctionnel | UI audit/stats implémentée, export OK |
| Mobile | Partiel | Safe areas framework présent, pas pleinement appliqué |

## 5 risques majeurs actuels

1. `memory_edges` non pushée sur Railway DB — le Memory Graph backend est mort en production.
2. Zod validation inconsistante — certains endpoints POST manquent de validation.
3. N+1 queries — routes `/projects` et `/tasks` chargent toute la table, pas de pagination.
4. Pas de migrations Drizzle — schéma uniquement en code, dérive silencieuse possible.
5. Helmet.js non installé — headers de sécurité manquants (X-Frame-Options, CSP, HSTS).
