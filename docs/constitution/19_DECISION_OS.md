# 19 — Decision OS

## Rôle

Structurer les décisions importantes. Pas juste « noter » une décision — l'analyser, la critiquer, la lier à des actions.

## Structure d'une décision

```typescript
{
  id: uuid,
  title: string,
  context: string,
  options: string[],
  chosen_option: string,
  ai_advice: string,        // Strategic advisor
  red_team_advice: string,  // Red Team critic
  confidence_score: number, // 0-100, analytique (pas aléatoire)
  status: 'draft' | 'active' | 'archived',
  created_at: timestamp
}
```

## Appels IA

Double appel parallèle :
1. **Strategic advisor** → `ai_advice` : recommandation, risques, opportunités.
2. **Red Team critic** → `red_team_advice` : failles, contre-arguments, hypothèses fragiles.
3. **Confidence score** : analytique sur 4 critères (clarté contexte, qualité options, données disponibles, cohérence interne).

## Route

`POST /api/decisions/:id/analyze` — déclenche les 3 appels IA.
`POST /api/decisions/:id/tasks` — crée des tâches à partir de la décision.

## État actuel

- Confidence score analytique fonctionnel (commit `eb9fa72`).
- Lien décisions → tâches opérationnel.
- Timeline / historique : non implémentée.

## Manquant

- Timeline des décisions (vue chronologique avec statuts).
- Export d'une décision en PDF / Markdown.
- Lien décision → contacts impliqués.
