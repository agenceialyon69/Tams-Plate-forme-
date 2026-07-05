# RED TEAM — Analyse de documents (Tier 1 free-first)

## Objectif
Lire et analyser des documents (txt, csv, md, json, **docx**, **pdf**) : extraction
**locale, gratuite, sans dépendance native ni clé**, puis résumé / points clés /
risques / actions via le LLM gratuit déjà en prod.

## Verdict
PASS local (typecheck + build + smoke round-trip CSV **et DOCX réel**, 400 sur
type non supporté / vide). CI teste l'extraction sans dépendre du LLM. **Aucune
action utilisateur requise : 100 % gratuit et local.**

## Ce qui a été fait / fichiers
| Fichier | Rôle |
|---|---|
| `lib/document-extract.ts` | `extractText()` : txt/csv/md/json (direct), **docx** (lecture ZIP + `inflateRawSync`, pur Node), **pdf** (best-effort : `inflateSync` des flux + extraction `Tj`) |
| `routes/documents.ts` | `POST /api/documents/analyze` (`{filename, contentBase64}` ou `{text}`) → extraction + analyse LLM optionnelle |
| `app.ts` | Parseur JSON 12 Mo **scopé à `/api/documents`** (fichier base64), avant le parseur global 100kb |
| `routes/index.ts` | Montage |
| `lib/operator.ts` | Intent `file` : `params.document` → extraction + synthèse LLM ; sinon mode d'emploi |
| `lib/operator-capabilities.ts` | `file_upload` / `pdf_analyze` / `word_analyze` → **available** (honnête) |

## Zéro dépendance ajoutée
Vérifié `package.json` : aucune lib pdf/docx/csv. Tout est fait avec `node:zlib`
built-in. Pas de binaire natif, pas de provider payant.

## Contrat & honnêteté
- `POST /api/documents/analyze` → `{ ok, extraction:{type,chars,truncated,note,preview}, analysis?, analysisAvailable }`.
- **Jamais de faux texte** : extraction réelle des octets. PDF scanné / non
  extractible → `note` explicite + `analysis:null` (on ne résume pas du vide).
- Type non supporté → **400** ; document vide / trop gros (> 8 Mo) → **400**.
- Analyse LLM **optionnelle** : sans clé IA, on renvoie quand même le texte extrait.

## Sécurité (analyse adversariale)
| Menace | Mitigation |
|---|---|
| Zip bomb / gros fichier | Borne d'entrée 8 Mo + sortie 100k chars ; ≤ 200 flux PDF |
| Faux résumé | Analyse basée UNIQUEMENT sur le texte extrait ; vide → pas d'analyse |
| DoS via gros corps | Limite 12 Mo scopée à cette seule route |
| Accès non autorisé | Sous `/api` → gate admin |
| Contenu binaire mal typé | Détection par extension **et** magic bytes (`%PDF`, signature ZIP) |

## Limites honnêtes
- **PDF** : extraction best-effort (texte des flux `FlateDecode`). Fiable pour
  beaucoup de PDF « texte » ; **PDF scanné (image) = non extractible** → message
  clair, jamais d'invention. Mise en page non préservée.
- **DOCX** : texte des paragraphes (pas les tableaux complexes / images).
- Pas d'OCR (viendra éventuellement via Tesseract local, gratuit).

## Tests
- Local : typecheck + build OK. CSV → texte exact. **DOCX réel** (ZIP généré) →
  « Bonjour facture urgente 1200 euros » extrait via pur Node. `.exe` → 400.
  Corps vide → 400. Intent `file` (sans doc) → mode d'emploi.
- CI : CSV base64 → `type:"csv"` + contenu `1200` ; `.exe` → 400 ; vide → 400.

## Prochaine étape
**Lire-URL** (récupère + nettoie une page web, résume) puis **veille RSS**
(digest quotidien via cron GitHub Actions gratuit).

## Rollback
Retirer le routeur (additif, isolé) ou revert de la PR.
