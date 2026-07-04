# Mon Agent — Capacites maximum free-first

## Objectif

Ce document complete la PR #95 pour eviter que `Mon Agent` reste limite a quelques intentions. Il donne a Claude Code la carte complete des capacites a integrer progressivement, en restant free-first et sans mentir sur ce qui est deja operationnel.

Regle produit :

```text
Chat = cockpit principal
Mon Agent = operateur central
Outils = capacites internes controlees
```

TAMS reste un agent personnel prive : pas de SaaS, pas de multi-tenant, pas de credits, pas de paiement, pas de marketplace.

## Regle de verite

Ne jamais afficher une capacite comme active si elle n'est pas connectee et testee.

Chaque capacite doit avoir un statut clair :

- `available` : fonctionne maintenant sans configuration supplementaire critique.
- `configured` : fonctionne car les variables/providers sont presents.
- `missing` : pas encore connecte.
- `disabled` : volontairement bloque par securite ou flag.
- `future` : possible plus tard, mais pas prioritaire/free-first incertain.

Chaque capacite doit aussi exposer :

- `id`
- `label`
- `description`
- `group`
- `status`
- `freeFirst`
- `provider`
- `toolsUsed`
- `requiresConfirmation`
- `riskLevel`
- `setupNeeded`
- `fallback`
- `nextAction`
- `evidence`

## Message produit cible dans /mon-agent

```text
Voici ce que je peux faire :

Recherche & analyse
- Recherche approfondie sur n'importe quel sujet
- Comparatifs, syntheses, rapports documentes
- Veille concurrentielle ou sectorielle
- Analyse Red Team de decisions, risques, projets, offres, concurrents
- Resumes sources, plans d'action, detection d'angles morts

Emails & communication
- Lire et rechercher Gmail si connecte
- Resumer les emails importants
- Preparer des reponses professionnelles ou casual
- Creer des brouillons Gmail
- Adapter le ton selon le contexte
- Preparer relances, reclamations et messages administratifs
- Envoi uniquement avec confirmation explicite

Agenda & organisation
- Lire Google Calendar si connecte
- Resumer journee/semaine
- Detecter conflits
- Proposer des creneaux
- Creer evenements uniquement apres confirmation
- Creer rappels et taches
- Prioriser selon sante, famille, admin, travail, projets

Code & technique
- Ecrire scripts Python, JavaScript, TypeScript
- Analyser du code
- Analyser CSV/Excel
- Creer dashboards simples
- Gerer repos GitHub
- Creer branches
- Modifier fichiers avec confirmation
- Ouvrir PR avec confirmation
- Lire CI GitHub Actions, logs, corriger echecs CI

Automatisation
- Programmer briefings matin
- Programmer revues soir
- Suivre projets
- Suivre PR/CI GitHub
- Creer alertes simples
- Connecter Telegram, Google Sheet, GitHub, Gmail, Calendar, fichiers, webhooks
- Notion/Slack seulement si gratuits et configures

Fichiers & documents
- Lire/analyser PDF, Word, Excel, CSV, images
- Extraire infos cles
- Resumer
- Detecter risques
- Transformer en checklist, tache, decision, email ou plan d'action

Creation / Studio
- Generer images si provider gratuit disponible
- Creer scripts video
- Creer storyboards
- Creer hooks TikTok/UGC
- Creer captions
- Creer prompts pour generateurs externes
- Creer packs d'assets marketing
- Produire courtes videos simples si possible
- Faire montage basique via FFmpeg
- Composer video avec images + texte + transitions + audio si vraie video IA gratuite absente

Disponible via
- Web maintenant
- Telegram via bot + Google Sheet existant
- WhatsApp plus tard seulement si solution gratuite fiable ou cout explicitement valide

Memoire & apprentissage
- Retenir preferences validees
- Retenir projets
- Retenir decisions importantes
- Relier captures, taches, fichiers et projets
- Ameliorer le contexte avec le temps
- Demander confirmation avant memoire sensible durable
```

## Capabilities cible

### 1. Recherche & analyse

- `research_deep`
- `research_source_based`
- `compare_options`
- `synthesize_report`
- `competitive_watch`
- `sector_watch`
- `red_team_analysis`
- `decision_analysis`
- `market_research`
- `job_offer_analysis`
- `legal_admin_draft_support`
- `product_research`

Free-first : utiliser les providers IA deja configures, recherche web seulement si un connecteur gratuit est disponible. Toujours afficher les sources quand il y a recherche externe.

### 2. Emails & communication

- `gmail_oauth_status`
- `gmail_search`
- `gmail_read`
- `gmail_summarize`
- `gmail_draft_reply`
- `gmail_professional_tone`
- `gmail_casual_tone`
- `gmail_followup_draft`
- `gmail_admin_claim_draft`
- `gmail_send_confirmed`
- `communication_rewrite`
- `communication_translate`
- `communication_summarize_thread`

Regles : OAuth Google, scopes minimaux, drafts d'abord, envoi uniquement avec confirmation. Ne jamais inventer des emails.

### 3. Agenda & organisation

- `calendar_oauth_status`
- `calendar_read`
- `calendar_day_summary`
- `calendar_week_summary`
- `calendar_find_slots`
- `calendar_conflict_detection`
- `calendar_create_event_confirmed`
- `calendar_update_event_confirmed`
- `reminders_create`
- `task_create`
- `task_prioritize`
- `daily_planning`
- `weekly_planning`

Regles : lecture d'abord, creation/modification/suppression uniquement avec confirmation.

### 4. Code & technique

- `code_python_script`
- `code_javascript_script`
- `code_typescript_script`
- `code_debug`
- `repo_architecture_analysis`
- `data_analysis_csv`
- `dashboard_create`
- `github_repo_analyze`
- `github_branch_create`
- `github_file_edit_confirmed`
- `github_pr_create_confirmed`
- `github_ci_status`
- `github_ci_logs`
- `github_ci_rerun_confirmed`
- `github_ci_repair_loop`
- `github_actions_dispatch_confirmed`
- `code_red_team_review`
- `security_audit_basic`

Regles : GitHub + PR + CI, jamais main, jamais merge automatique, confirmations obligatoires pour ecriture.

### 5. Automatisation

- `automation_daily_briefing`
- `automation_evening_review`
- `automation_weekly_report`
- `automation_project_followup`
- `automation_github_ci_watch`
- `automation_email_summary`
- `automation_telegram_digest`
- `automation_reminders`
- `automation_alerts`
- `webhook_integrations`
- `google_sheet_sync`
- `telegram_capture`
- `scheduled_workflows`
- `n8n_self_host_future`
- `app_connector_registry`

Free-first : scheduler interne, GitHub Actions scheduled workflows, Telegram capture, Google Sheet sync/import. Pas Zapier/Make/n8n Cloud payant.

### 6. Fichiers & documents

- `file_upload`
- `file_index`
- `pdf_analyze`
- `word_analyze`
- `excel_csv_analyze`
- `image_analyze`
- `document_key_info_extract`
- `document_risk_extract`
- `document_action_extract`
- `document_summary`
- `document_to_email`
- `document_to_task`
- `document_to_decision`
- `document_to_project_note`
- `invoice_extract`
- `admin_document_review`
- `cv_review`

Free-first : commencer par upload + extraction texte + CSV/Excel. OCR/images seulement si deja disponible ou quota gratuit.

### 7. Studio / creation multimedia

Le Studio ne doit pas etre limite aux images.

- `studio_image_generate`
- `studio_image_edit_if_available`
- `studio_video_short_generate`
- `studio_video_basic_edit`
- `studio_photo_to_video_basic`
- `studio_images_to_video`
- `studio_text_to_video_basic`
- `studio_script_generate`
- `studio_storyboard_generate`
- `studio_hook_generate`
- `studio_caption_generate`
- `studio_prompt_generate`
- `studio_asset_pack_generate`
- `studio_product_ad_concept`
- `studio_ugc_script`
- `studio_subtitles_basic`
- `studio_audio_attach_if_available`
- `studio_voice_if_available`
- `studio_ffmpeg_export_mp4`

V1 free-first : images + scripts + storyboards + hooks + captions + prompts + video composee FFmpeg.

Si vraie generation video IA gratuite absente, reponse attendue :

```text
Video IA non configuree gratuitement. Je peux creer une video composee free-first avec images, texte, transitions, storyboard, script et prompts prets pour outil externe.
```

### 8. Canaux

- `web_app`
- `mobile_web`
- `telegram_bot_capture`
- `telegram_bot_commands`
- `google_sheet_workflow`
- `email_channel_future`
- `whatsapp_future_only`
- `api_webhook_channel`

Web = maintenant. Telegram + Google Sheet = priorite immediate. WhatsApp = futur, pas disponible maintenant.

### 9. Memoire & apprentissage

- `memory_read`
- `memory_write_confirmed`
- `memory_search`
- `memory_project_context`
- `memory_user_preferences`
- `memory_decision_history`
- `memory_task_history`
- `memory_capture_to_context`
- `personal_context_learning`
- `sensitive_memory_confirmation`

Confirmation avant memoire sensible durable.

### 10. Readiness & securite

- `personal_access_gate`
- `auth_required_status`
- `operator_readiness`
- `provider_readiness`
- `database_readiness`
- `github_readiness`
- `gmail_readiness`
- `calendar_readiness`
- `telegram_sheet_readiness`
- `studio_readiness`
- `files_readiness`
- `automations_readiness`
- `security_red_team`
- `secrets_redaction`
- `action_confirmation_system`

## Readiness cible

Ajouter PASS/WARN/FAIL/FUTURE pour :

- Personal access
- Auth required
- Operator chat
- GitHub CI
- GitHub PR
- GitHub code edit
- Memory
- Tasks
- Decisions
- Projects
- Files
- PDF
- Word
- Excel/CSV
- Image analysis
- Studio image
- Studio video basic
- Studio FFmpeg
- Studio storyboard/script
- Studio UGC assets
- Studio audio/voice
- Telegram capture
- Google Sheet sync
- Gmail
- Calendar
- Automations
- Database
- AI providers
- Security
- Deployment
- Web app
- WhatsApp future

Chaque item doit exposer : status, cause, risk, nextAction, provider/tool, freeFirst, evidence.

## Ordre d'integration recommande apres PR #95

1. Personal Access Gate.
2. Capabilities maximum free-first + readiness complet + UI Mon Agent.
3. Operator hardening + confirmations plus robustes.
4. Correction memoire/taches/decisions DB scoping.
5. GitHub Code Operator : branch/file edit/PR/CI loop.
6. Telegram + Google Sheet capture.
7. Files/documents analysis.
8. Studio multimedia pilote depuis Mon Agent.
9. Gmail OAuth + drafts.
10. Calendar OAuth.
11. Automatisations gratuites.
12. Readiness global + Runbook final.

## Critere PASS

Mon Agent est conforme quand :

1. Toutes les capacites ci-dessus existent dans capabilities/readiness.
2. Les capacites connectees fonctionnent vraiment.
3. Les capacites non connectees sont affichees honnetement.
4. Studio n'est pas limite aux images.
5. Telegram/Google Sheet est prioritaire.
6. WhatsApp n'est pas presente comme disponible maintenant.
7. Aucun service payant n'est obligatoire.
8. L'utilisateur peut piloter depuis /mon-agent.
9. Actions sensibles = confirmation.
10. CI verte.
