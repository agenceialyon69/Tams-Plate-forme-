# Rules — gouvernance du projet

## Principes absolus
1. Simplicité maximale — la solution la plus simple qui marche. Pas de sur-ingénierie.
2. Scope strict — toute feature non essentielle au MVP est rejetée/reportée.
3. Une action à la fois — une feature = un cycle complet.
4. Stabilité avant intelligence — pas d'optimisation/automatisation prématurée.
5. Template avant expérimentation — base propre d'abord, IA ensuite.

## Red Team checklist (avant toute implémentation)
- Indispensable ? Peut-on la supprimer ? Existe-t-il plus simple ?
- Ajoute-t-elle de la dette ? Est-ce scalable ? Utile à un MVP réel ?
- **≥ 2 réponses négatives → refuser la feature.**

## Decision Gate (avant de coder)
1. Analyse du besoin. 2. Solution simple. 3. Solution avancée.
4. Choix final argumenté. 5. Validation.

## Execution loop
Analyse → Red Team → Decision Gate → Plan → Implémentation → Tests simples →
Commit → Push → Maj `progress.md` → Vérif stabilité → Tâche suivante.

## Self-healing (bug détecté)
Stop → cause racine → fix minimal → test → commit/push → reprise.

## Règles code
- Lire `/ai-context/*` avant action ; le mettre à jour après.
- Ne jamais casser le code existant. Pas de refactor global sans red team.
- Une feature = un commit cohérent. Push obligatoire après chaque feature.
- Toujours documenter ; toujours maintenir `progress.md`.
- GitHub = source de vérité. Le projet doit toujours être exécutable.
- Vérifier `origin/main` avant de modifier ; si un push échoue, stopper et documenter.

## Sécurité (rappels)
- Auth par défaut sur `/api`. Rôles via `requireRole`.
- Pas de secret/token renvoyé au client. `_debug` interdit en prod.
- Avant multi-clients : isolation `tenantId` obligatoire sur toutes les tables data.

## Gouvernance IA (Phase 3)
- Versionner prompts / agents / schémas de sortie ; logger les requêtes IA.
- Mode safe pour actions risquées ; ne jamais inventer de données.
- IA gratuite d'abord (Ollama/Qwen/DeepSeek/Llama) ; gateway remplaçable sans refactor.

## Exceptions techniques documentées
- Dossiers `artifacts/kore` (front) et `artifacts/api-server` (back) **non
  renommés** vers `/frontend` `/backend` (éviter de casser le build/déploiement).
- Identifiants techniques pouvant garder un ancien nom temporairement : préfixe
  secret JWT `gandal-jwt:` (renommer casserait les sessions existantes),
  variable `API_AUTH_TOKEN`. À migrer proprement plus tard si besoin.
