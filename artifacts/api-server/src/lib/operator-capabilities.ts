/**
 * MON AGENT — Carte des capacités MAXIMUM free-first.
 * Source de vérité : OPERATOR_CAPABILITIES_MAX_FREE_FIRST.md (racine du repo).
 *
 * RÈGLE DE VÉRITÉ : chaque statut est calculé depuis l'environnement réel.
 *   available  = fonctionne maintenant, sans configuration supplémentaire
 *   configured = fonctionne car un provider/env gratuit est configuré
 *   missing    = pas encore connecté (setupNeeded dit quoi faire)
 *   disabled   = volontairement désactivé (flag de sécurité off)
 *   future     = possible plus tard, pas prioritaire ou pas free-first fiable
 *
 * Aucun provider payant obligatoire. WhatsApp officiel payant = future only.
 */

export type CapStatus = "available" | "configured" | "missing" | "disabled" | "future";
export type CapRisk = "low" | "medium" | "high";

export interface OperatorCapability {
  id: string;
  label: string;
  description: string;
  group: string;
  status: CapStatus;
  freeFirst: boolean;
  provider: string;
  toolsUsed: string[];
  requiresConfirmation: boolean;
  riskLevel: CapRisk;
  setupNeeded: string | null;
  fallback: string;
  nextAction: string | null;
  evidence: string;
}

interface Env {
  ai: boolean;          // au moins un LLM gratuit configuré
  vision: boolean;      // Gemini (analyse d'images via pièces jointes du Chat)
  github: boolean;      // GITHUB_TOKEN
  ciWrite: boolean;     // TAMS_DEV_AGENT_CI_WRITE
  prWrite: boolean;     // TAMS_DEV_AGENT_PR_WRITE
  scheduler: boolean;   // TAMS_DEV_AGENT_SCHEDULER
  hf: boolean;          // HF_TOKEN (musique/voix HuggingFace)
  telegramCapture: boolean; // TAMS_TELEGRAM_CAPTURE_SECRET (webhook n8n → TAMS)
}

function readEnv(): Env {
  const hf = Boolean(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY);
  return {
    ai: Boolean(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OLLAMA_BASE_URL || hf),
    vision: Boolean(process.env.GEMINI_API_KEY),
    github: Boolean(process.env.GITHUB_TOKEN),
    ciWrite: process.env.TAMS_DEV_AGENT_CI_WRITE === "true",
    prWrite: process.env.TAMS_DEV_AGENT_PR_WRITE === "true",
    scheduler: process.env.TAMS_DEV_AGENT_SCHEDULER === "true",
    hf,
    telegramCapture: Boolean(process.env.TAMS_TELEGRAM_CAPTURE_SECRET),
  };
}

type Partial9 = Partial<Omit<OperatorCapability, "id" | "label" | "description" | "group" | "status">>;

function makeGroup(group: string, base: Partial9) {
  return (id: string, label: string, description: string, status: CapStatus, over: Partial9 = {}): OperatorCapability => ({
    id, label, description, group, status,
    freeFirst: over.freeFirst ?? base.freeFirst ?? true,
    provider: over.provider ?? base.provider ?? "—",
    toolsUsed: over.toolsUsed ?? base.toolsUsed ?? [],
    requiresConfirmation: over.requiresConfirmation ?? base.requiresConfirmation ?? false,
    riskLevel: over.riskLevel ?? base.riskLevel ?? "low",
    setupNeeded: over.setupNeeded ?? base.setupNeeded ?? null,
    fallback: over.fallback ?? base.fallback ?? "—",
    nextAction: over.nextAction ?? base.nextAction ?? null,
    evidence: over.evidence ?? base.evidence ?? "",
  });
}

export function operatorCapabilitiesMax(): OperatorCapability[] {
  const e = readEnv();
  const llm = (ok: boolean): CapStatus => (ok ? "configured" : "missing");
  const LLM_SETUP = "Configurer un provider IA gratuit (GROQ_API_KEY ou GEMINI_API_KEY)";
  const NO_WEB = "Analyse LLM sans navigation web en direct (limite annoncée dans la réponse)";
  const caps: OperatorCapability[] = [];

  // ── 1. Recherche & analyse ──────────────────────────────────────────────────
  const r = makeGroup("Recherche & analyse", {
    provider: "ai-router free-first (Groq/Gemini/HF/OpenRouter/Ollama)",
    toolsUsed: ["/api/operator/chat"],
    evidence: NO_WEB,
    setupNeeded: e.ai ? null : LLM_SETUP,
  });
  caps.push(
    r("research_deep", "Recherche approfondie", "Analyse structurée d'un sujet (LLM, sans web live)", llm(e.ai)),
    r("research_source_based", "Rapport sourcé (web)", "Recherche avec sources réelles + synthèse", "available", { provider: "Wikipedia (plein-texte, sans clé) + DuckDuckGo entités + ai-router", toolsUsed: ["/api/operator/chat (intent research)", "searchWeb"], setupNeeded: null, evidence: "Sources réelles et fiables (Wikipedia FR/EN + entités DDG) ; sans LLM = sources brutes ; jamais de fausse source. Limite honnête : web général temps réel = couverture partielle (clé gratuite Tavily/Brave possible plus tard)." }),
    r("compare_options", "Comparer des options", "Comparatif structuré avantages/risques/reco", llm(e.ai)),
    r("synthesize_report", "Synthèse / rapport", "Rapport structuré à partir des éléments fournis", llm(e.ai)),
    r("competitive_watch", "Veille concurrentielle", "Veille récurrente concurrents", "future", { setupNeeded: "Nécessite web + automatisation récurrente" }),
    r("sector_watch", "Veille sectorielle", "Veille récurrente d'un secteur", "future", { setupNeeded: "Nécessite web + automatisation récurrente" }),
    r("red_team_analysis", "Analyse Red Team", "Risques, angles morts, hypothèses fragiles, reco", llm(e.ai), { toolsUsed: ["operator chat (intent red_team)"] }),
    r("decision_analysis", "Analyse de décision", "Options, critères, risques, recommandation", llm(e.ai)),
    r("market_research", "Étude de marché (LLM)", "Cadrage marché à partir de tes données", llm(e.ai)),
    r("job_offer_analysis", "Analyse d'offre d'emploi", "Décrypte une offre, points forts/risques", llm(e.ai)),
    r("legal_admin_draft_support", "Aide courrier admin/légal", "Brouillon de courrier administratif (non juridique)", llm(e.ai), { riskLevel: "medium", evidence: "Aide rédactionnelle — pas un avis juridique" }),
    r("product_research", "Recherche produit", "Analyse produit/offre à partir des infos fournies", llm(e.ai)),
  );

  // ── 2. Emails & communication ───────────────────────────────────────────────
  const g = makeGroup("Emails & communication", {
    provider: "Google OAuth (gratuit) — non connecté",
    setupNeeded: "PR Gmail OAuth : scopes minimaux, lecture + brouillons seulement",
    evidence: "Jamais d'emails inventés : refus honnête tant que non connecté",
    riskLevel: "medium",
  });
  caps.push(
    g("gmail_oauth_status", "Statut connexion Gmail", "Indique si Gmail est connecté", "available", { provider: "operator", setupNeeded: null, evidence: "Renvoie missing tant que l'OAuth n'existe pas" }),
    g("gmail_search", "Rechercher des emails", "Recherche dans la boîte Gmail", "missing"),
    g("gmail_read", "Lire des emails", "Lecture des emails", "missing"),
    g("gmail_summarize", "Résumer les emails importants", "Résumé quotidien des emails", "missing"),
    g("gmail_draft_reply", "Brouillon de réponse", "Prépare une réponse en brouillon (jamais d'envoi auto)", "missing"),
    g("gmail_professional_tone", "Ton professionnel", "Réécriture pro d'un message (colle le texte)", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP, evidence: "Fonctionne dès maintenant en collant le texte dans le chat" }),
    g("gmail_casual_tone", "Ton casual", "Réécriture décontractée d'un message", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP, evidence: "Fonctionne en collant le texte dans le chat" }),
    g("gmail_followup_draft", "Brouillon de relance", "Prépare une relance polie", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP, evidence: "Texte généré dans le chat ; dépôt en brouillon Gmail après OAuth" }),
    g("gmail_admin_claim_draft", "Brouillon réclamation admin", "Prépare une réclamation structurée", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP }),
    g("gmail_send_confirmed", "Envoi d'email (confirmé)", "Envoi réel après confirmation explicite", "future", { requiresConfirmation: true, riskLevel: "high", setupNeeded: "Après validation des brouillons OAuth" }),
    g("communication_rewrite", "Réécrire un message", "Clarifie/adapte n'importe quel texte", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP, riskLevel: "low" }),
    g("communication_translate", "Traduire", "Traduction de messages/documents collés", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP, riskLevel: "low" }),
    g("communication_summarize_thread", "Résumer un fil", "Résume un fil de discussion collé", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP, riskLevel: "low" }),
  );

  // ── 3. Agenda & organisation ────────────────────────────────────────────────
  const c = makeGroup("Agenda & organisation", {
    provider: "Google Calendar OAuth (gratuit) — non connecté",
    setupNeeded: "PR Calendar OAuth : lecture d'abord, écriture confirmée",
    riskLevel: "medium",
  });
  caps.push(
    c("calendar_oauth_status", "Statut connexion Calendar", "Indique si Calendar est connecté", "available", { provider: "operator", setupNeeded: null }),
    c("calendar_read", "Lire l'agenda", "Lecture des événements", "missing"),
    c("calendar_day_summary", "Résumé de la journée", "Synthèse du jour", "missing"),
    c("calendar_week_summary", "Résumé de la semaine", "Synthèse hebdo", "missing"),
    c("calendar_find_slots", "Trouver des créneaux", "Propose des créneaux libres", "missing"),
    c("calendar_conflict_detection", "Détecter les conflits", "Repère les chevauchements", "missing"),
    c("calendar_create_event_confirmed", "Créer un événement (confirmé)", "Création après confirmation", "missing", { requiresConfirmation: true, riskLevel: "high" }),
    c("calendar_update_event_confirmed", "Modifier un événement (confirmé)", "Modification/suppression confirmée", "missing", { requiresConfirmation: true, riskLevel: "high" }),
    c("reminders_create", "Créer un rappel", "Rappel = tâche avec échéance (dueDate)", "available", { provider: "TAMS tasks (DB)", toolsUsed: ["runTool create_task"], setupNeeded: null, evidence: "Tâche datée créée en base" }),
    c("task_create", "Créer une tâche", "Création de tâche depuis le chat", "available", { provider: "TAMS tasks (DB)", toolsUsed: ["runTool create_task"], setupNeeded: null, evidence: "Voir readiness tasks (erreur DB remontée si échec)" }),
    c("task_prioritize", "Prioriser les tâches", "Aide à prioriser (LLM + liste des tâches)", llm(e.ai), { provider: "ai-router + tasks", setupNeeded: e.ai ? null : LLM_SETUP }),
    c("daily_planning", "Plan de journée", "Plan structuré du jour", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP }),
    c("weekly_planning", "Plan de semaine", "Plan structuré de la semaine", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP }),
  );

  // ── 4. Code & technique ─────────────────────────────────────────────────────
  const gh = makeGroup("Code & technique", {
    provider: "GitHub API + dev.agent.ci (réutilisé)",
    toolsUsed: ["dev.agent.ci"],
    setupNeeded: e.github ? null : "Ajouter GITHUB_TOKEN (fine-grained, repo TAMS)",
  });
  const ciStatus: CapStatus = e.github ? "configured" : "missing";
  const writeStatus = (flag: boolean): CapStatus => (e.github ? (flag ? "configured" : "disabled") : "missing");
  caps.push(
    gh("code_python_script", "Script Python", "Écrit un script Python complet", llm(e.ai), { provider: "ai-router", toolsUsed: ["operator chat"], setupNeeded: e.ai ? null : LLM_SETUP }),
    gh("code_javascript_script", "Script JavaScript", "Écrit un script JS complet", llm(e.ai), { provider: "ai-router", toolsUsed: ["operator chat"], setupNeeded: e.ai ? null : LLM_SETUP }),
    gh("code_typescript_script", "Script TypeScript", "Écrit un script TS complet", llm(e.ai), { provider: "ai-router", toolsUsed: ["operator chat"], setupNeeded: e.ai ? null : LLM_SETUP }),
    gh("code_debug", "Debug de code", "Analyse une erreur/du code collé", llm(e.ai), { provider: "ai-router", toolsUsed: ["operator chat"], setupNeeded: e.ai ? null : LLM_SETUP }),
    gh("repo_architecture_analysis", "Analyse d'architecture repo", "Plan d'analyse + risques (mode github_code)", llm(e.ai && e.github), { setupNeeded: e.github ? (e.ai ? null : LLM_SETUP) : "GITHUB_TOKEN requis" }),
    gh("data_analysis_csv", "Analyse de données CSV", "Analyse un CSV collé dans le chat", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP, fallback: "coller un extrait du CSV" }),
    gh("dashboard_create", "Créer un dashboard", "Dashboard simple généré", "future", { setupNeeded: "PR dédiée (génération HTML/graphiques)" }),
    gh("github_repo_analyze", "Analyser le repo", "Statut + runs + plan d'action", ciStatus, { evidence: "Lit les vrais runs GitHub (lecture seule)" }),
    gh("github_branch_create", "Créer une branche", "Branche dédiée (jamais main)", "future", { requiresConfirmation: true, riskLevel: "medium", setupNeeded: "PR GitHub Code Operator (Contents API)" }),
    gh("github_file_edit_confirmed", "Modifier un fichier (confirmé)", "Édition via Contents API + plan de patch", "future", { requiresConfirmation: true, riskLevel: "high", setupNeeded: "PR GitHub Code Operator (Contents API)" }),
    gh("github_pr_create_confirmed", "Créer une PR (confirmé)", "PR head≠main, jamais de merge", writeStatus(e.prWrite), { requiresConfirmation: true, riskLevel: "high", setupNeeded: e.prWrite ? null : "Activer TAMS_DEV_AGENT_PR_WRITE=true" }),
    gh("github_ci_status", "Statut CI", "Config opérateur + derniers runs", ciStatus),
    gh("github_ci_logs", "Logs CI", "Logs des jobs (secrets caviardés)", ciStatus),
    gh("github_ci_rerun_confirmed", "Relancer jobs échoués (confirmé)", "Rerun failed après confirmation", writeStatus(e.ciWrite), { requiresConfirmation: true, riskLevel: "medium", setupNeeded: e.ciWrite ? null : "Activer TAMS_DEV_AGENT_CI_WRITE=true" }),
    gh("github_ci_repair_loop", "Boucle de réparation CI", "Lit les logs échoués + diagnostic timeboxé", ciStatus, { evidence: "Relance réelle uniquement avec flag + confirmation" }),
    gh("github_actions_dispatch_confirmed", "Lancer un workflow (confirmé)", "Dispatch GitHub Actions confirmé", writeStatus(e.ciWrite), { requiresConfirmation: true, riskLevel: "medium", setupNeeded: e.ciWrite ? null : "Activer TAMS_DEV_AGENT_CI_WRITE=true" }),
    gh("code_red_team_review", "Revue Red Team du code", "Critique du code fourni (failles, dette)", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP }),
    gh("security_audit_basic", "Audit sécurité basique", "Analyse de risques sur code/config fournis", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP, riskLevel: "medium" }),
  );

  // ── 5. Automatisation ───────────────────────────────────────────────────────
  const a = makeGroup("Automatisation", {
    provider: "scheduler interne / GitHub Actions cron (gratuits)",
    riskLevel: "medium",
    requiresConfirmation: true,
  });
  const sched: CapStatus = e.scheduler ? "configured" : "disabled";
  const SCHED_SETUP = e.scheduler ? null : "Activer TAMS_DEV_AGENT_SCHEDULER=true (garde-fou volontaire)";
  caps.push(
    a("automation_daily_briefing", "Briefing du matin", "Briefing quotidien automatique", sched, { setupNeeded: SCHED_SETUP, fallback: "GET /api/briefing manuel disponible maintenant" }),
    a("automation_evening_review", "Revue du soir", "Bilan de journée automatique", "future", { setupNeeded: "Après activation scheduler" }),
    a("automation_weekly_report", "Rapport hebdo", "Rapport de semaine automatique", "future", { setupNeeded: "Après activation scheduler" }),
    a("automation_project_followup", "Suivi de projets", "Relances/résumés projets", "future"),
    a("automation_github_ci_watch", "Veille PR/CI GitHub", "Alerte sur CI rouge/PR en attente", "future", { setupNeeded: "GitHub Actions scheduled workflow (gratuit)" }),
    a("automation_email_summary", "Résumé emails auto", "Résumé récurrent des emails", "future", { setupNeeded: "Après Gmail OAuth" }),
    a("automation_telegram_digest", "Digest des captures Telegram", "Résumé des captures", "future", { setupNeeded: "Après PR capture Telegram/Sheet" }),
    a("automation_reminders", "Rappels", "Rappels via tâches datées", "available", { provider: "TAMS tasks (DB)", requiresConfirmation: false, setupNeeded: null, riskLevel: "low" }),
    a("automation_alerts", "Alertes simples", "Alertes readiness/erreurs", "future"),
    a("webhook_integrations", "Intégrations webhook", "Webhook entrant n8n self-host/gratuit", "available", { provider: "n8n-webhook route (self-host/webhook only)", requiresConfirmation: false, setupNeeded: null, evidence: "Route /api/n8n-webhook présente — jamais n8n Cloud payant" }),
    a("google_sheet_sync", "Sync Google Sheet", "Import des lignes du Sheet de capture", "missing", { setupNeeded: "PR capture : import CSV/Sheet + anti-duplication", requiresConfirmation: false }),
    a("telegram_capture", "Capture Telegram", "Bot existant → Sheet → TAMS (endpoint d'ingestion)", e.telegramCapture ? "configured" : "missing", { provider: "POST /api/integrations/telegram-capture (secret partagé)", requiresConfirmation: false, setupNeeded: e.telegramCapture ? null : "Définir TAMS_TELEGRAM_CAPTURE_SECRET + pointer le workflow n8n vers le endpoint", evidence: e.telegramCapture ? "Endpoint actif : capture → tâche/mémoire (ne stocke que, aucune action sensible auto)" : "Endpoint prêt ; en attente de TAMS_TELEGRAM_CAPTURE_SECRET" }),
    a("scheduled_workflows", "Workflows planifiés GitHub", "Cron gratuit via GitHub Actions", "available", { provider: "GitHub Actions (gratuit)", requiresConfirmation: false, setupNeeded: null }),
    a("n8n_self_host_future", "n8n self-host", "Orchestrations avancées auto-hébergées", "future", { setupNeeded: "Uniquement self-host — jamais n8n Cloud payant" }),
    a("app_connector_registry", "Registre de connecteurs", "Connecter d'autres apps gratuites", "future"),
  );

  // ── 6. Fichiers & documents ─────────────────────────────────────────────────
  const f = makeGroup("Fichiers & documents", {
    provider: "extraction locale (gratuite) — non branchée",
    setupNeeded: "PR fichiers : upload documents + extraction texte",
    fallback: "colle le texte dans le chat : analyse immédiate",
  });
  caps.push(
    f("file_upload", "Upload de document", "Upload PDF/Word/CSV/txt pour analyse", "available", { provider: "extraction locale (zlib pur Node, sans clé)", toolsUsed: ["POST /api/documents/analyze"], setupNeeded: null, evidence: "txt/csv/md/json/docx OK ; pdf best-effort (scanné = message honnête)" }),
    f("file_index", "Index des fichiers", "Retrouver ses documents analysés", "future"),
    f("pdf_analyze", "Analyser un PDF", "Extraction + résumé d'un PDF (texte)", e.ai ? "available" : "available", { provider: "extraction locale + ai-router", toolsUsed: ["POST /api/documents/analyze"], setupNeeded: null, evidence: "PDF texte extrait localement (best-effort) ; PDF scanné = message honnête, jamais de faux texte" }),
    f("word_analyze", "Analyser un Word", "Extraction + résumé d'un .docx", "available", { provider: "extraction locale (ZIP pur Node) + ai-router", toolsUsed: ["POST /api/documents/analyze"], setupNeeded: null }),
    f("excel_csv_analyze", "Analyser Excel/CSV", "Analyse de tableur (colle le contenu : dispo maintenant)", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP, evidence: "Contenu collé = analyse immédiate ; upload natif en PR fichiers" }),
    f("image_analyze", "Analyser une image", "Vision sur pièces jointes du Chat", e.vision ? "configured" : "missing", { provider: "Gemini vision (quota gratuit)", toolsUsed: ["Chat pièces jointes"], setupNeeded: e.vision ? null : "GEMINI_API_KEY requis", evidence: "Pièces jointes image du Chat analysées par Gemini" }),
    f("document_key_info_extract", "Extraire les infos clés", "Points clés d'un document collé", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP }),
    f("document_risk_extract", "Extraire les risques", "Risques d'un contrat/document collé", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP, riskLevel: "medium" }),
    f("document_action_extract", "Extraire les actions", "Actions à faire depuis un document", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP }),
    f("document_summary", "Résumer un document", "Résumé structuré d'un texte collé", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP }),
    f("document_to_email", "Document → email", "Transforme un document en email prêt", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP }),
    f("document_to_task", "Document → tâche", "Crée des tâches depuis un document", llm(e.ai), { provider: "ai-router + tasks", setupNeeded: e.ai ? null : LLM_SETUP }),
    f("document_to_decision", "Document → décision", "Trace une décision depuis un document", llm(e.ai), { provider: "ai-router + decisions", setupNeeded: e.ai ? null : LLM_SETUP }),
    f("document_to_project_note", "Document → note projet", "Note liée à un projet", "future"),
    f("invoice_extract", "Extraire une facture", "Montants/dates/références d'une facture", "future", { setupNeeded: "Après PR fichiers (PDF)" }),
    f("admin_document_review", "Relire un doc administratif", "Relecture + points d'attention (texte collé)", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP }),
    f("cv_review", "Relire un CV", "Critique constructive d'un CV collé", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP }),
  );

  // ── 7. Studio / création multimédia (PAS image-only) ───────────────────────
  const s = makeGroup("Studio / création multimédia", {
    provider: "FFmpeg + Pollinations + ai-router (gratuits)",
    toolsUsed: ["Studio", "operator chat"],
  });
  caps.push(
    s("studio_image_generate", "Générer une image", "Image réelle via Pollinations (sans clé)", "available", { evidence: "IMAGE:url rendue dans le chat" }),
    s("studio_image_edit_if_available", "Retoucher une image", "Édition d'image IA", "future", { setupNeeded: "Provider gratuit d'édition à brancher" }),
    s("studio_video_short_generate", "Courte vidéo (composée)", "Vidéo 9:16 composée images+texte via FFmpeg — pas de text-to-video IA", "available", { evidence: "MP4 réel produit ; honnêteté : composition, pas Runway/Veo" }),
    s("studio_video_basic_edit", "Montage vidéo basique", "Concat/resize/export MP4 sur uploads", "available", { provider: "FFmpeg", evidence: "Routes montage Studio (upload → assemble → MP4)" }),
    s("studio_photo_to_video_basic", "Photo → vidéo", "Diaporama animé depuis tes photos", "available", { provider: "FFmpeg" }),
    s("studio_images_to_video", "Images → vidéo", "Assemble des images en MP4", "available", { provider: "FFmpeg" }),
    s("studio_text_to_video_basic", "Texte → vidéo basique", "Vidéo titre/texte sur fond (FFmpeg)", "available", { provider: "FFmpeg" }),
    s("studio_script_generate", "Script vidéo", "Script complet prêt à tourner", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP }),
    s("studio_storyboard_generate", "Storyboard", "Storyboard scène par scène", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP }),
    s("studio_hook_generate", "Hooks TikTok/UGC", "Accroches virales prêtes", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP }),
    s("studio_caption_generate", "Captions", "Légendes + hashtags", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP }),
    s("studio_prompt_generate", "Prompts pour générateurs externes", "Prompts prêts pour outil externe", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP }),
    s("studio_asset_pack_generate", "Pack d'assets marketing", "Script + hooks + captions + prompts + visuel", llm(e.ai), { provider: "ai-router + Pollinations", setupNeeded: e.ai ? null : LLM_SETUP }),
    s("studio_product_ad_concept", "Concept pub produit", "Concept publicitaire complet", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP }),
    s("studio_ugc_script", "Script UGC", "Script UGC authentique", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP }),
    s("studio_subtitles_basic", "Sous-titres basiques", "Incrustation de sous-titres simples", "future", { setupNeeded: "Whisper/transcription à brancher sur le montage" }),
    s("studio_audio_attach_if_available", "Attacher un audio", "Musique/voix ajoutée à la vidéo", "available", { provider: "FFmpeg (musicUrl)" }),
    s("studio_voice_if_available", "Voix (TTS)", "Voix HF si token, sinon fallback WAV local honnête", e.hf ? "configured" : "available", { provider: e.hf ? "HuggingFace TTS" : "fallback WAV local (dégradé, annoncé)", evidence: "Jamais présenté comme voix premium si fallback" }),
    s("studio_ffmpeg_export_mp4", "Export MP4", "Export final MP4 (faststart)", "available", { provider: "FFmpeg" }),
  );

  // ── 8. Canaux ───────────────────────────────────────────────────────────────
  const ch = makeGroup("Canaux", { provider: "—" });
  caps.push(
    ch("web_app", "Web app TAMS", "Cockpit web (maintenant)", "available", { provider: "Railway (plan actuel)" }),
    ch("mobile_web", "Web mobile", "Utilisable sur mobile (safe-area, nav intacte)", "available"),
    ch("telegram_bot_capture", "Capture via bot Telegram", "Ton bot existant → Sheet → TAMS", e.telegramCapture ? "configured" : "missing", { provider: "POST /api/integrations/telegram-capture", setupNeeded: e.telegramCapture ? null : "TAMS_TELEGRAM_CAPTURE_SECRET + noeud HTTP n8n", evidence: "Bot + workflow existants : réutilisés, pas remplacés" }),
    ch("telegram_bot_commands", "Commandes bot Telegram", "Piloter Mon Agent depuis Telegram", "future"),
    ch("google_sheet_workflow", "Workflow Google Sheet", "Sheet de capture existant", "missing", { setupNeeded: "PR capture : import CSV/Sheet", evidence: "Le workflow externe existe ; TAMS ne le lit pas encore" }),
    ch("email_channel_future", "Canal email", "Piloter par email", "future"),
    ch("whatsapp_future_only", "WhatsApp", "Futur uniquement : API officielle payante/complexe", "future", { freeFirst: false, setupNeeded: "Attendre solution gratuite fiable OU validation explicite d'un coût par l'utilisateur", evidence: "Jamais présenté comme disponible maintenant" }),
    ch("api_webhook_channel", "Canal API/webhook", "Entrées via webhooks gratuits", "available", { provider: "n8n-webhook route", evidence: "Route existante" }),
  );

  // ── 9. Mémoire & apprentissage ──────────────────────────────────────────────
  const m = makeGroup("Mémoire & apprentissage", {
    provider: "TAMS memories/tasks/decisions (DB + pgvector)",
    toolsUsed: ["runTool"],
  });
  caps.push(
    m("memory_read", "Lire la mémoire", "Recherche dans les mémoires", "available"),
    m("memory_write_confirmed", "Écrire en mémoire", "Mémorisation depuis le chat", "available", { riskLevel: "medium", evidence: "Voir readiness memory (erreur DB remontée si échec)" }),
    m("memory_search", "Recherche mémoire", "Full-text + sémantique (pgvector)", "available"),
    m("memory_project_context", "Contexte projet", "Mémoires liées à un projet", "available"),
    m("memory_user_preferences", "Préférences utilisateur", "Apprentissage des préférences validées", "future"),
    m("memory_decision_history", "Historique des décisions", "Décisions tracées en base", "available"),
    m("memory_task_history", "Historique des tâches", "Tâches passées consultables", "available"),
    m("memory_capture_to_context", "Captures → contexte", "Captures Telegram intégrées au contexte", "future", { setupNeeded: "Après PR capture" }),
    m("personal_context_learning", "Apprentissage du contexte", "Amélioration continue du contexte perso", "future"),
    m("sensitive_memory_confirmation", "Confirmation mémoire sensible", "Confirmation avant mémoire durable sensible", "future", { requiresConfirmation: true, riskLevel: "medium", setupNeeded: "Heuristique de sensibilité à implémenter" }),
  );

  // ── 10. Readiness & sécurité ────────────────────────────────────────────────
  const rs = makeGroup("Readiness & sécurité", { provider: "operator" });
  caps.push(
    rs("personal_access_gate", "Personal access gate", "Login personnel cookie HttpOnly", "missing", { setupNeeded: "PR #2 : TAMS_PERSONAL_ACCESS_* + cookie sécurisé", riskLevel: "high", evidence: "REQUIRE_AUTH protège /api en attendant" }),
    rs("auth_required_status", "Statut REQUIRE_AUTH", "Gate global actuel", "available", { evidence: process.env.REQUIRE_AUTH === "true" ? "REQUIRE_AUTH=true actif" : "REQUIRE_AUTH inactif dans cet environnement" }),
    rs("operator_readiness", "Readiness operator", "PASS/WARN/FAIL/FUTURE détaillé", "available"),
    rs("provider_readiness", "Readiness providers", "Registry des providers gratuits", "available", { toolsUsed: ["/api/capabilities (registry existant)"] }),
    rs("database_readiness", "Readiness base de données", "Connexion + tables", "available"),
    rs("github_readiness", "Readiness GitHub", "Token + flags d'écriture", "available"),
    rs("gmail_readiness", "Readiness Gmail", "Honnête : missing tant que pas d'OAuth", "available"),
    rs("calendar_readiness", "Readiness Calendar", "Honnête : missing tant que pas d'OAuth", "available"),
    rs("telegram_sheet_readiness", "Readiness Telegram/Sheet", "Capture non branchée = missing", "available"),
    rs("studio_readiness", "Readiness Studio", "Image/vidéo/FFmpeg/voix détaillés", "available"),
    rs("files_readiness", "Readiness fichiers", "Docs non branchés = missing honnête", "available"),
    rs("automations_readiness", "Readiness automatisations", "Flags scheduler visibles", "available"),
    rs("security_red_team", "Red Team sécurité", "Analyse de risques sur demande", llm(e.ai), { provider: "ai-router", setupNeeded: e.ai ? null : LLM_SETUP }),
    rs("secrets_redaction", "Redaction des secrets", "Logs CI caviardés (tokens masqués)", "available", { toolsUsed: ["dev-agent-ci-operator redact()"], evidence: "ghp_/shpat_/clés remplacés par [redacted]" }),
    rs("action_confirmation_system", "Système de confirmation", "Actions sensibles = confirmationId + confirm/cancel", "available", { toolsUsed: ["/api/operator/confirm", "/api/operator/cancel"] }),
  );

  return caps;
}

/** Message produit court affiché dans /mon-agent (règle de vérité incluse). */
export const OPERATOR_PRODUCT_MESSAGE =
  "Je suis ton agent personnel privé. Je peux rechercher, analyser, organiser, coder, " +
  "travailler sur GitHub, lire tes fichiers, utiliser le Studio, préparer tes communications " +
  "et automatiser progressivement tes tâches. Je privilégie toujours le gratuit et je " +
  "t'indique honnêtement ce qui est connecté ou non.";
