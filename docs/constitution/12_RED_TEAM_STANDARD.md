# 12 — Standard Red Team

> Chaque module doit passer ce test. Ne jamais considérer un module comme terminé sans preuve runtime.

## Checklist module prêt pour production

- [ ] Route API testée et répondant correctement.
- [ ] UI frontend sans état d'erreur non géré.
- [ ] Fallback gracieux si IA indisponible.
- [x] Pas de N+1 DB identifiable.
- [x] Input validé avec Zod.
- [ ] Erreur visible à l'utilisateur si opération échoue.
- [x] Pas de secret exposé côté client.

## Audit modules — état actuel (post-corrections 2026-06-26)

| Module | Statut | Issue principale |
|---|---|---|
| Chief of Staff | Fonctionnel | Briefing IA OK, fallback gracieux OK |
| Chat OS | Fonctionnel | Tool-use OK, streaming SSE OK |
| Memory Graph | Backend OK | Visualisation frontend manquante |
| Decision OS | Fonctionnel | Score analytique implémenté, lien tâches OK |
| Work OS | Fonctionnel | Kanban OK, cascade delete OK, `project_contacts` déployée |
| Studio | Fonctionnel | CRUD assets OK, génération scripts IA OK |
| Système | Fonctionnel | UI audit/stats OK, export OK |
| Mobile | Partiel | Safe areas OK, pull-to-refresh manquant |

## 5 nouveaux risques prioritaires

1. **Pas de CI/CD** — Tests automatisés non implémentés.
2. **Pas de migrations Drizzle commitées** — Schéma uniquement en code.
3. **Memory Graph visualization manquante** — Frontend non implémenté.
4. **Tool-use limité** — `update_task` et `create_memory_edge` non implémentés.
5. **Import/restore manquant** — Export JSON existe, import non implémenté.
