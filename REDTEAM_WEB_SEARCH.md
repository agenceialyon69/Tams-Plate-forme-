# RED TEAM — Recherche web sourcée dans Mon Agent (PR #3)

**Objectif** : rendre la recherche de Mon Agent **réellement sourcée, opérationnelle
et fiable**, en free-first (sans clé API), sans mentir sur la couverture.

**Verdict** : PASS local (typecheck + build API + preuve end-to-end : le serveur
renvoie 5 sources réelles pour une requête générale, `research_source_based` =
`available`). Couverture temps-réel = partielle, annoncée honnêtement.

---

## Le problème trouvé (red team sur l'existant)

La brique `searchWeb` (agent-tools.ts) était **peu fiable** :
- **DuckDuckGo Instant Answer** ne répond que pour des **entités nommées**
  (OpenAI, Python… ✅) mais renvoie **vide** pour les requêtes générales
  (« intelligence artificielle open source » → 0).
- Les 3 fallbacks **SearXNG publics étaient morts** (testés : `403`, timeout,
  `429`). Donc pour la majorité des requêtes : **0 source**, puis un placeholder.

La livrer telle quelle et l'annoncer « recherche web fiable » aurait été du
**survente** — exactement le travers du pitch concurrent. Refusé.

## Le correctif

1. **Couche fiable et sans clé : recherche plein-texte Wikipedia** (FR puis EN
   en complément) via `action=query&list=search`. Renvoie des sources réelles,
   stables, avec titre + URL + extrait. Testé : 5 résultats FR pour une requête
   générale, fallback EN quand FR insuffisant (ex. « best free CRM » → HubSpot,
   SuiteCRM).
2. **DuckDuckGo Instant Answer conservé** en bonus (entités).
3. **SearXNG rétrogradé** en best-effort non bloquant (ne casse plus rien s'il
   est mort).
4. **Câblage dans Mon Agent** (`operator.ts`, intent `research`) :
   - lance une vraie recherche → construit une liste de sources ;
   - **avec** LLM gratuit : synthèse structurée **citant les sources [n]**,
     interdiction de fabriquer un fait/URL absent des sources ;
   - **sans** LLM : renvoie les **sources brutes** (utile + honnête) au lieu
     d'un blocage sec ;
   - **0 source + 0 LLM** : dit clairement qu'il ne fabrique rien.
5. `searchWeb` exporté et **réutilisé** (pas de doublon) — profite aussi à
   l'outil `web_search` du Chat.

## Sécurité / honnêteté

| Point | Traitement |
|---|---|
| Fausses sources | Impossible : la synthèse part **uniquement** des sources récupérées ; sans source, on le dit |
| Fausse fiabilité | Couverture temps-réel annoncée comme **partielle** (Wikipedia = encyclopédique/entités ; web général = limité sans clé) |
| Dépendance à un service mort | SearXNG best-effort, jamais bloquant ; Wikipedia = source primaire stable |
| Coût | 0 € : aucune clé requise |
| Fuite | Aucune (pas de secret dans les requêtes) |

## Limite honnête & évolution

Wikipedia couvre très bien concepts/entités/définitions, **moins** les
comparatifs commerciaux et l'actualité du jour. Pour une couverture web
temps-réel, brancher plus tard une clé **gratuite** Tavily/Brave (quota free)
en couche supplémentaire — **optionnel**, jamais obligatoire.

## Preuves (local)

- `pnpm --filter @workspace/api-server typecheck` → OK
- build API → OK
- Serveur lancé, `POST /api/operator/chat {"message":"recherche …"}` →
  `intent=research`, `capabilityId=research_source_based`,
  `executionStatus=completed`, **evidence = 5 sources réelles**.
- `GET /api/operator/capabilities` → `research_source_based` = `available`.
- Wikipedia `list=search` vérifié via réseau : 5 résultats FR + fallback EN.
- CI : étape « Smoke recherche web » ajoutée (valide le contrat, résilient au
  réseau/LLM absents).
