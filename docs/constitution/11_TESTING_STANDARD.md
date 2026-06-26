# 11 — Tests

## Niveau actuel

Aucun test automatisé committé. Tests manuels uniquement.

## Objectif minimal

### Backend
- Tests unitaires pour les handlers critiques : `briefing.ts`, `chat.ts`, `decisions.ts`.
- Tests d'intégration sur les routes API : statut HTTP, forme de réponse, validation Zod.
- Outil : Vitest + Supertest.

### Frontend
- Tests unitaires sur les hooks React Query custom.
- Tests de composants sur les composants partagés (`navigation.tsx`).
- Outil : Vitest + React Testing Library.

### Contrat OpenAPI
- Valider que le codegen Orval correspond toujours à `openapi.yaml`.
- Valider que les routes Express matchent les paths OpenAPI.

## CI minimum

```yaml
# .github/workflows/ci.yml
steps:
  - pnpm install --frozen-lockfile
  - pnpm run typecheck
  - pnpm run test
  - pnpm --filter @workspace/tams run build
  - pnpm --filter @workspace/api-server run build
```

## Règles

- Ne jamais committer un test qui passe à vide (`expect(true).toBe(true)`).
- Un test qui ne peut pas échouer n'est pas un test.
- Prioriser les tests sur les chemins critiques : briefing IA, chat tool-use, memory graph edges.
