/**
 * MON AGENT — Operator core (control plane du Chat).
 *
 * TAMS = UN agent personnel privé, free-first, pilotable depuis le chat.
 * Ce module NE recrée aucun système : il route les demandes vers les briques
 * existantes (dev-agent-ci-operator pour GitHub/CI, runTool pour tâches/mémoire/
 * décisions/studio, lib/ai pour l'analyse Red Team) et impose :
 *   - des réponses STRUCTURÉES (intent, actionPlan, evidence, warnings, nextStep) ;
 *   - une CONFIRMATION obligatoire pour toute action sensible (dispatch CI,
 *     rerun jobs, création de PR) via un store TTL + /operator/confirm ;
 *   - l'HONNÊTETÉ : une capacité non connectée (Gmail, Calendar, fichiers,
 *     Telegram/Sheet) est annoncée comme telle, jamais simulée.
 *
 * Interdits (Constitution) : multi-tenant, paiement/crédits, providers payants.
 */
import { randomUUID } from "node:crypto";
import {
  ciOperatorStatus,
  dispatchWorkflow,
  listRuns,
  readJobLogs,
  rerunFailedJobs,
  createPullRequest,
  runRepairLoop,
  type RunKind,
} from "./dev-agent-ci-operator.js";

// ─── Types du contrat de réponse (voir issue #94) ────────────────────────────

export type OperatorIntent =
  | "status" | "capabilities" | "github_ci" | "github_code" | "red_team"
  | "memory" | "task" | "decision" | "file" | "studio"
  | "gmail" | "calendar" | "telegram_sheet" | "automation" | "unknown";

export type ExecutionStatus = "pending" | "running" | "completed" | "failed" | "blocked";

export interface OperatorReply {
  message: string;
  intent: OperatorIntent;
  capabilityId: string | null;
  actionPlan: string[];
  requiresConfirmation: boolean;
  confirmationId: string | null;
  executionStatus: ExecutionStatus;
  evidence: unknown[];
  warnings: string[];
  nextStep: string;
}

function reply(partial: Partial<OperatorReply> & { message: string; intent: OperatorIntent }): OperatorReply {
  return {
    capabilityId: null,
    actionPlan: [],
    requiresConfirmation: false,
    confirmationId: null,
    executionStatus: "completed",
    evidence: [],
    warnings: [],
    nextStep: "",
    ...partial,
  };
}

// ─── Store des actions sensibles en attente de confirmation ──────────────────
// En mémoire + TTL 15 min : suffisant pour un usage personnel mono-instance.
// Limitation assumée (documentée) : perdu au redéploiement.

export interface PendingAction {
  id: string;
  capabilityId: string;
  action: string;
  params: Record<string, unknown>;
  summary: string;
  createdAt: number;
  status: "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
  result?: unknown;
  error?: string;
}

const PENDING = new Map<string, PendingAction>();
const PENDING_TTL_MS = 15 * 60 * 1000;

function prunePending(): void {
  const now = Date.now();
  for (const [id, action] of PENDING) {
    if (action.status === "pending" && now - action.createdAt > PENDING_TTL_MS) action.status = "expired";
    // Garde l'historique 1 h pour GET /operator/actions/:id, puis purge.
    if (now - action.createdAt > 4 * PENDING_TTL_MS) PENDING.delete(id);
  }
}

function createPending(capabilityId: string, action: string, params: Record<string, unknown>, summary: string): PendingAction {
  prunePending();
  const entry: PendingAction = { id: randomUUID(), capabilityId, action, params, summary, createdAt: Date.now(), status: "pending" };
  PENDING.set(entry.id, entry);
  return entry;
}

export function getAction(id: string): PendingAction | null {
  prunePending();
  return PENDING.get(id) ?? null;
}

export function cancelAction(id: string): PendingAction | null {
  const entry = getAction(id);
  if (!entry) return null;
  if (entry.status === "pending") entry.status = "cancelled";
  return entry;
}

/** Exécute une action confirmée. Seules les actions dev.agent.ci sont câblées en v1. */
export async function confirmAction(id: string): Promise<PendingAction | null> {
  const entry = getAction(id);
  if (!entry) return null;
  if (entry.status !== "pending") return entry;
  entry.status = "running";
  try {
    const p = entry.params;
    switch (entry.action) {
      case "dispatch":
        entry.result = await dispatchWorkflow({ repo: asStr(p.repo), ref: asStr(p.ref), runKind: asRunKind(p.runKind) });
        break;
      case "rerun_failed":
        entry.result = await rerunFailedJobs({ repo: asStr(p.repo), runId: Number(p.runId) });
        break;
      case "create_pr":
        entry.result = await createPullRequest({
          repo: asStr(p.repo),
          head: asStr(p.head) || "tams-dev",
          base: asStr(p.base),
          title: asStr(p.title) || "Mon Agent: proposition de changements",
          body: asStr(p.body),
        });
        break;
      case "repair_loop_rerun":
        entry.result = await runRepairLoop({ repo: asStr(p.repo), runId: Number(p.runId), rerun: true });
        break;
      default:
        throw new Error(`action inconnue: ${entry.action}`);
    }
    entry.status = "completed";
  } catch (err) {
    entry.status = "failed";
    entry.error = err instanceof Error ? err.message : String(err);
  }
  return entry;
}

function asStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function asRunKind(v: unknown): RunKind | undefined {
  return v === "typecheck" || v === "e2e_playwright" || v === "full_validation" ? v : undefined;
}

// ─── Détection d'intent (déterministe, gratuite, testable) ────────────────────

export function detectIntent(text: string): OperatorIntent {
  const t = text.toLowerCase();
  if (/\b(statut|status|état|etat)\b.*\b(ci|pipeline|build|workflow|déploiement|deploiement)\b|\bci\b.*\b(statut|status)\b/.test(t)) return "github_ci";
  if (/\b(logs?|jobs?|runs?|relance|rerun|dispatch|validation ci|workflow)\b/.test(t) && /\b(ci|github|pr|pipeline|job|run|workflow)\b/.test(t)) return "github_ci";
  if (/\b(pr|pull request)\b/.test(t) && /\b(prépare|prepare|crée|cree|ouvre|fais|créer|creer)\b/.test(t)) return "github_ci";
  if (/\b(repo|dépôt|depot|code|refactor|bug|corrige|correction|patch)\b/.test(t) && /\b(analyse|audit|risques?|propose|plan|corrige)\b/.test(t)) return "github_code";
  if (/\bred[ -]?team\b|\bavocat du diable\b|\bcritique?\b.*\b(décision|decision|plan|idée|idee)\b/.test(t)) return "red_team";
  if (/\b(tâches?|taches?|todos?|à faire|a faire)\b/.test(t)) return "task";
  if (/\b(mémoires?|memoires?|retiens|souviens|garde ça|garde ca|note ça|note ca|mémorise|memorise)\b/.test(t)) return "memory";
  if (/\b(décisions?|decisions?|trancher|choisir entre)\b/.test(t)) return "decision";
  if (/\b(fichiers?|documents?|pdfs?|docx?|excel|csv|factures?|cv)\b/.test(t) && /\b(lis|résume|resume|analyse|extrais|extrait)\b/.test(t)) return "file";
  if (/\b(images?|visuels?|logos?|affiches?|vidéos?|videos?|clips?|musiques?|studio|covers?)\b/.test(t)) return "studio";
  if (/\b(e-?mails?|mails?|gmail|boîte|boite de réception|inbox)\b/.test(t)) return "gmail";
  if (/\b(agenda|calendrier|calendar|rendez-vous|rdv|réunion|reunion|créneau|creneau)\b/.test(t)) return "calendar";
  if (/\b(telegram|google sheet|sheet|capture)\b/.test(t)) return "telegram_sheet";
  if (/\b(automatis|briefing|récurrent|recurrent|tous les jours|chaque matin|chaque soir|rappelle-moi|rappel)\b/.test(t)) return "automation";
  if (/\b(capacités|capacites|capabilities|que peux-tu|que sais-tu faire|tes modes|aide)\b/.test(t)) return "capabilities";
  if (/\b(readiness|prêt|pret|santé|sante|diagnostic|système|systeme)\b/.test(t)) return "status";
  return "unknown";
}

// ─── Capabilities (contrat du prompt : id, label, status, freeFirst, …) ───────

export interface OperatorCapability {
  id: string;
  label: string;
  status: "available" | "configured" | "missing" | "disabled";
  freeFirst: boolean;
  riskLevel: "low" | "medium" | "high";
  requiresConfirmation: boolean;
  toolsUsed: string[];
  fallback: string;
  nextSetupStep: string | null;
}

export function operatorCapabilities(): OperatorCapability[] {
  const github = Boolean(process.env.GITHUB_TOKEN);
  const ciWrite = process.env.TAMS_DEV_AGENT_CI_WRITE === "true";
  const prWrite = process.env.TAMS_DEV_AGENT_PR_WRITE === "true";
  const hf = Boolean(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY);
  const ai = Boolean(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OLLAMA_BASE_URL || hf);
  const scheduler = process.env.TAMS_DEV_AGENT_SCHEDULER === "true";

  const cap = (
    id: string, label: string, status: OperatorCapability["status"], riskLevel: OperatorCapability["riskLevel"],
    requiresConfirmation: boolean, toolsUsed: string[], fallback: string, nextSetupStep: string | null = null,
  ): OperatorCapability => ({ id, label, status, freeFirst: true, riskLevel, requiresConfirmation, toolsUsed, fallback, nextSetupStep });

  return [
    cap("chat_text", "Conversation & analyse", ai ? "configured" : "missing", "low", false, ["ai-router (Groq/Gemini/HF/Ollama)"], "réponse dégradée sans LLM", ai ? null : "Configurer GROQ_API_KEY ou GEMINI_API_KEY"),
    cap("red_team_decision", "Analyse Red Team d'une décision", ai ? "configured" : "missing", "low", false, ["ai-router"], "checklist statique", ai ? null : "Configurer un provider IA gratuit"),
    cap("system_readiness", "Diagnostic de la plateforme", "available", "low", false, ["operator readiness", "/api/system/readiness"], "—"),
    cap("memory_read", "Lire la mémoire", "available", "low", false, ["runTool search_memories"], "—"),
    cap("memory_write", "Écrire en mémoire", "available", "medium", false, ["runTool create_memory"], "—"),
    cap("task_create", "Créer une tâche", "available", "low", false, ["runTool create_task"], "—"),
    cap("decision_create", "Créer une décision", "available", "low", false, ["runTool create_decision"], "—"),
    cap("github_ci_status", "Statut CI GitHub", github ? "configured" : "missing", "low", false, ["dev.agent.ci status/runs"], "—", github ? null : "Ajouter GITHUB_TOKEN"),
    cap("github_ci_logs", "Lire les logs CI", github ? "configured" : "missing", "low", false, ["dev.agent.ci jobs/logs"], "—", github ? null : "Ajouter GITHUB_TOKEN"),
    cap("github_pr_create", "Créer une PR", github && prWrite ? "configured" : github ? "disabled" : "missing", "high", true, ["dev.agent.ci create_pr"], "plan de PR sans exécution", prWrite ? null : "Mettre TAMS_DEV_AGENT_PR_WRITE=true"),
    cap("github_code_plan", "Plan d'analyse/correction du repo", ai ? "configured" : "missing", "medium", true, ["ai-router", "dev.agent.ci"], "plan manuel", null),
    cap("files_read", "Lire un fichier (PDF/Word/CSV)", "missing", "low", false, [], "—", "PR fichiers : upload + extraction texte"),
    cap("files_extract", "Extraire/résumer un document", "missing", "low", false, [], "—", "PR fichiers : upload + extraction texte"),
    cap("studio_image", "Générer une image", "available", "low", false, ["Pollinations (sans clé)", "runTool generate_image"], "—"),
    cap("studio_video_basic", "Vidéo basique 9:16", "available", "medium", false, ["FFmpeg slideshow"], "vidéo texte", null),
    cap("telegram_sheet_capture", "Capture Telegram → Google Sheet", "missing", "low", false, [], "import CSV manuel", "PR capture : endpoint /api/integrations/telegram-capture + import CSV"),
    cap("gmail_read", "Lire/résumer les emails", "missing", "medium", false, [], "—", "PR Gmail : OAuth Google scopes minimaux (lecture)"),
    cap("gmail_draft", "Créer des brouillons d'email", "missing", "high", true, [], "—", "PR Gmail : OAuth + drafts (jamais d'envoi auto)"),
    cap("calendar_read", "Lire l'agenda", "missing", "medium", false, [], "—", "PR Calendar : OAuth Google (lecture)"),
    cap("calendar_create_event", "Créer un événement", "missing", "high", true, [], "—", "PR Calendar : OAuth + création confirmée"),
    cap("automation_schedule", "Automatisations récurrentes", scheduler ? "configured" : "disabled", "high", true, ["dev-agent-scheduler", "GitHub Actions cron"], "—", scheduler ? null : "Mettre TAMS_DEV_AGENT_SCHEDULER=true"),
    cap("briefing_daily", "Briefing quotidien", ai ? "configured" : "missing", "low", false, ["/api/briefing"], "briefing statique", null),
  ];
}

// ─── Readiness operator (PASS/WARN/FAIL + cause/risque/prochaine action) ──────

export interface ReadinessEntry {
  id: string;
  verdict: "PASS" | "WARN" | "FAIL";
  cause?: string;
  risk?: string;
  nextAction?: string;
}

export async function operatorReadiness(): Promise<{ overall: "PASS" | "WARN" | "FAIL"; checks: ReadinessEntry[]; generatedAt: string }> {
  const checks: ReadinessEntry[] = [];
  const pass = (id: string): ReadinessEntry => ({ id, verdict: "PASS" });
  const warn = (id: string, cause: string, risk: string, nextAction: string): ReadinessEntry => ({ id, verdict: "WARN", cause, risk, nextAction });
  const fail = (id: string, cause: string, risk: string, nextAction: string): ReadinessEntry => ({ id, verdict: "FAIL", cause, risk, nextAction });

  // Personal access : REQUIRE_AUTH protège tout /api aujourd'hui.
  if (process.env.TAMS_PERSONAL_ACCESS_ENABLED === "true") checks.push(pass("personal_access"));
  else if (process.env.REQUIRE_AUTH === "true") checks.push({ id: "personal_access", verdict: "WARN", cause: "Protégé via REQUIRE_AUTH (Supabase), personal gate dédié absent", risk: "dépend de Supabase pour un usage mono-utilisateur", nextAction: "PR personal access gate (TAMS_PERSONAL_ACCESS_*) puis REQUIRE_AUTH=false" });
  else checks.push(fail("personal_access", "Ni REQUIRE_AUTH ni personal gate actifs", "plateforme personnelle exposée publiquement", "Activer REQUIRE_AUTH=true ou livrer le personal gate"));

  checks.push(pass("operator_chat"));

  const github = Boolean(process.env.GITHUB_TOKEN);
  checks.push(github ? pass("github_ci") : fail("github_ci", "GITHUB_TOKEN absent", "mode GitHub/CI inopérant", "Ajouter GITHUB_TOKEN (fine-grained, repo TAMS)"));
  checks.push(github && process.env.TAMS_DEV_AGENT_PR_WRITE === "true"
    ? pass("github_pr")
    : warn("github_pr", "TAMS_DEV_AGENT_PR_WRITE≠true ou token absent", "création de PR bloquée (volontaire par défaut)", "Activer le flag quand tu veux autoriser les PR depuis le chat"));

  // DB (mémoire/tâches/décisions partagent la même base).
  let dbOk = false;
  try {
    const { pool } = await import("@workspace/db");
    await pool.query("SELECT 1");
    dbOk = true;
  } catch { /* down */ }
  checks.push(dbOk ? pass("memory") : fail("memory", "Base de données injoignable", "mémoire/tâches/décisions indisponibles", "Vérifier DATABASE_URL"));
  checks.push(dbOk ? pass("tasks") : fail("tasks", "Base de données injoignable", "création de tâches impossible", "Vérifier DATABASE_URL"));
  checks.push(dbOk ? pass("decisions") : fail("decisions", "Base de données injoignable", "création de décisions impossible", "Vérifier DATABASE_URL"));

  checks.push(warn("files", "Extraction de fichiers non implémentée", "PDF/Word/CSV non exploitables par l'agent", "PR fichiers (upload + extraction + résumé)"));
  checks.push(pass("studio"));
  checks.push(warn("telegram_sheet", "Endpoint de capture absent", "les captures Telegram/Sheet ne remontent pas dans TAMS", "PR capture : webhook + import CSV"));
  checks.push(warn("gmail", "OAuth Google non configuré", "lecture/brouillons email indisponibles", "PR Gmail OAuth (scopes minimaux, drafts seulement)"));
  checks.push(warn("calendar", "OAuth Google non configuré", "lecture agenda indisponible", "PR Calendar OAuth (lecture d'abord)"));
  checks.push(process.env.TAMS_DEV_AGENT_SCHEDULER === "true"
    ? pass("automations")
    : warn("automations", "TAMS_DEV_AGENT_SCHEDULER≠true", "aucune automatisation récurrente active", "Activer le flag ou utiliser GitHub Actions cron"));

  const overall = checks.some(c => c.verdict === "FAIL") ? "FAIL" : checks.some(c => c.verdict === "WARN") ? "WARN" : "PASS";
  return { overall, checks, generatedAt: new Date().toISOString() };
}

// ─── Handlers d'intent ────────────────────────────────────────────────────────

async function handleGithubCi(text: string, params: Record<string, unknown>): Promise<OperatorReply> {
  const t = text.toLowerCase();
  const status = ciOperatorStatus();
  const base = { capabilityId: "dev.agent.ci" as const };

  // Écriture → confirmation obligatoire (dispatch / rerun / PR).
  if (/\b(prépare|prepare|crée|cree|créer|creer|ouvre)\b.*\b(pr|pull request)\b|\b(pr|pull request)\b.*\b(prépare|prepare|crée|cree)\b/.test(t)) {
    const pending = createPending("dev.agent.ci", "create_pr", {
      head: asStr(params.head) || "tams-dev",
      base: asStr(params.base),
      title: asStr(params.title) || "Mon Agent: proposition de changements",
      body: asStr(params.body),
    }, "Créer une pull request (head ≠ main, jamais de merge)");
    return reply({
      message: `Je peux créer une PR depuis la branche « ${pending.params.head} » (jamais main, jamais de merge auto). Confirme pour exécuter.`,
      intent: "github_ci", ...base,
      actionPlan: ["Vérifier TAMS_DEV_AGENT_PR_WRITE=true", `createPullRequest(head=${pending.params.head})`, "Retourner l'URL de la PR + suivre la CI"],
      requiresConfirmation: true, confirmationId: pending.id, executionStatus: "pending",
      evidence: [{ ciOperator: status }],
      warnings: status.prWriteEnabled ? [] : ["TAMS_DEV_AGENT_PR_WRITE n'est pas activé : la confirmation échouera tant que le flag est off (garde-fou volontaire)."],
      nextStep: `POST /api/operator/confirm { "confirmationId": "${pending.id}" } — ou /api/operator/cancel pour annuler.`,
    });
  }
  if (/\brelance|rerun\b/.test(t)) {
    const runId = Number(params.runId) || undefined;
    if (!runId) {
      return reply({
        message: "Pour relancer les jobs échoués il me faut le runId. Donne-le dans params.runId (visible via « statut CI »).",
        intent: "github_ci", ...base, executionStatus: "blocked",
        actionPlan: ["Lister les runs (lecture)", "Identifier le run échoué", "Relancer avec confirmation"],
        nextStep: "Renvoie le message avec params: { runId: <id> }.",
      });
    }
    const pending = createPending("dev.agent.ci", "rerun_failed", { runId }, `Relancer les jobs échoués du run ${runId}`);
    return reply({
      message: `Relancer les jobs échoués du run ${runId} ? Action d'écriture GitHub → confirmation requise.`,
      intent: "github_ci", ...base,
      actionPlan: [`rerunFailedJobs(runId=${runId})`],
      requiresConfirmation: true, confirmationId: pending.id, executionStatus: "pending",
      warnings: status.ciWriteEnabled ? [] : ["TAMS_DEV_AGENT_CI_WRITE off : la confirmation échouera (garde-fou)."],
      nextStep: `POST /api/operator/confirm { "confirmationId": "${pending.id}" }`,
    });
  }
  if (/\b(lance|démarre|demarre|dispatch)\b.*\b(validation|ci|workflow|build)\b/.test(t)) {
    const pending = createPending("dev.agent.ci", "dispatch", { ref: asStr(params.ref), runKind: asStr(params.runKind) }, "Dispatch du workflow de validation");
    return reply({
      message: "Lancer le workflow de validation (dev-agent-sandbox.yml) ? Action d'écriture → confirmation requise.",
      intent: "github_ci", ...base,
      actionPlan: ["dispatchWorkflow(ref=tams-dev par défaut)", "Suivre le run", "Lire les logs si échec"],
      requiresConfirmation: true, confirmationId: pending.id, executionStatus: "pending",
      warnings: status.ciWriteEnabled ? [] : ["TAMS_DEV_AGENT_CI_WRITE off : la confirmation échouera (garde-fou)."],
      nextStep: `POST /api/operator/confirm { "confirmationId": "${pending.id}" }`,
    });
  }

  // Logs (lecture, autorisé sans confirmation).
  if (/\blogs?\b/.test(t)) {
    const jobId = Number(params.jobId) || undefined;
    if (jobId) {
      try {
        const logs = await readJobLogs({ jobId });
        return reply({
          message: `Logs du job ${jobId} récupérés (${logs.log.length} caractères, secrets caviardés).`,
          intent: "github_ci", ...base, evidence: [{ jobId, excerpt: logs.log.slice(-4000) }],
          nextStep: "Analyse l'extrait ou demande « relance les jobs échoués » (confirmation).",
        });
      } catch (err) {
        return reply({
          message: `Lecture des logs impossible : ${err instanceof Error ? err.message : "erreur"}`,
          intent: "github_ci", ...base, executionStatus: "failed",
          warnings: ["Vérifier GITHUB_TOKEN."], nextStep: "Corriger le token puis réessayer.",
        });
      }
    }
    // Sans jobId : lister les runs pour guider (lecture seule).
  }

  // Défaut : statut CI (lecture seule) — config + derniers runs si token présent.
  const evidence: unknown[] = [{ ciOperator: status }];
  const warnings: string[] = [];
  if (status.githubConfigured) {
    try {
      const runs = await listRuns({});
      evidence.push({ latestRuns: runs.runs.slice(0, 5).map(r => { const j = r as Record<string, unknown>; return { id: j.id, branch: j.head_branch, status: j.status, conclusion: j.conclusion, title: j.display_title }; }) });
    } catch (err) {
      warnings.push(`Lecture des runs échouée: ${err instanceof Error ? err.message : "erreur"}`);
    }
  } else {
    warnings.push("GITHUB_TOKEN absent : je ne peux pas lire les runs.");
  }
  return reply({
    message: status.githubConfigured
      ? "Statut CI récupéré (lecture seule) — voir evidence pour les derniers runs."
      : "GitHub n'est pas encore connecté (GITHUB_TOKEN absent). Je peux te guider pour l'ajouter.",
    intent: "github_ci", ...base, evidence, warnings,
    actionPlan: ["status (fait)", "runs (fait si token)", "jobs/logs sur demande", "rerun/dispatch/PR avec confirmation"],
    nextStep: status.githubConfigured ? "Demande « lis les logs » avec params.jobId, ou « relance les jobs échoués » avec params.runId." : "Ajouter GITHUB_TOKEN dans Railway.",
  });
}

async function handleRedTeam(text: string): Promise<OperatorReply> {
  try {
    const { aiConfigured, aiChat } = await import("./ai.js");
    if (!aiConfigured()) {
      return reply({
        message: "Aucun provider IA gratuit configuré : je ne peux pas produire l'analyse Red Team maintenant.",
        intent: "red_team", capabilityId: "red_team_decision", executionStatus: "blocked",
        warnings: ["GROQ_API_KEY / GEMINI_API_KEY absents"], nextStep: "Configurer un provider gratuit puis relancer.",
      });
    }
    const completion = await aiChat({
      messages: [
        { role: "system", content: "Tu es le Red Team de l'utilisateur. Analyse sa décision/idée sans complaisance : risques majeurs, angles morts, hypothèses fragiles, coût d'opportunité, et UNE recommandation claire. Français, concis, structuré." },
        { role: "user", content: text },
      ],
      max_tokens: 700,
    }, "reasoning");
    const content: string = completion?.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) throw new Error("réponse vide");
    return reply({
      message: content, intent: "red_team", capabilityId: "red_team_decision",
      evidence: [{ provider: "ai-router free-first" }],
      nextStep: "Si tu veux, je transforme la recommandation en décision tracée (« crée une décision : … »).",
    });
  } catch (err) {
    return reply({
      message: `Analyse Red Team indisponible: ${err instanceof Error ? err.message : "erreur"}`,
      intent: "red_team", capabilityId: "red_team_decision", executionStatus: "failed",
      nextStep: "Réessayer dans un instant (quota gratuit possiblement saturé).",
    });
  }
}

/** Intents branchés sur les briques internes existantes (runTool = Tool Orchestrator). */
async function handleInternalTool(intent: OperatorIntent, tool: string, args: Record<string, unknown>, successMessage: string, capabilityId: string): Promise<OperatorReply> {
  try {
    const { runTool } = await import("./agents/orchestrator.js");
    const result = await runTool(tool, args);
    const failed = /échoué|echoue|failed|erreur/i.test(result) && !/IMAGE:|VIDEO:|AUDIO:/.test(result);
    return reply({
      message: failed ? result : `${successMessage}\n${result}`,
      intent, capabilityId,
      executionStatus: failed ? "failed" : "completed",
      evidence: [{ tool, result: result.slice(0, 500) }],
      warnings: failed ? ["L'outil interne a renvoyé une erreur — remontée telle quelle (pas de simulation)."] : [],
      nextStep: failed ? "Vérifier /api/system/readiness (base de données) puis réessayer." : "",
    });
  } catch (err) {
    return reply({
      message: `Échec de l'outil ${tool}: ${err instanceof Error ? err.message : "erreur"}`,
      intent, capabilityId, executionStatus: "failed",
      nextStep: "Vérifier la readiness puis réessayer.",
    });
  }
}

function notConnected(intent: OperatorIntent, capabilityId: string, label: string, setup: string): OperatorReply {
  return reply({
    message: `${label} n'est pas encore connecté. Je ne simule jamais une capacité absente. Je peux préparer l'intégration ou te guider.`,
    intent, capabilityId, executionStatus: "blocked",
    warnings: [`${capabilityId}: missing`],
    nextStep: setup,
  });
}

// ─── Point d'entrée du control plane ─────────────────────────────────────────

export async function handleOperatorChat(message: string, params: Record<string, unknown> = {}): Promise<OperatorReply> {
  const intent = detectIntent(message);

  switch (intent) {
    case "status": {
      const readiness = await operatorReadiness();
      return reply({
        message: `Readiness globale: ${readiness.overall}. ${readiness.checks.filter(c => c.verdict !== "PASS").length} point(s) à traiter — voir evidence.`,
        intent, capabilityId: "system_readiness", evidence: [readiness],
        nextStep: "Traiter les WARN/FAIL dans l'ordre (chaque entrée contient nextAction).",
      });
    }
    case "capabilities": {
      const caps = operatorCapabilities();
      return reply({
        message: `Je suis Mon Agent : ${caps.filter(c => c.status === "available" || c.status === "configured").length}/${caps.length} capacités actives (free-first). Voir evidence pour le détail et les étapes de setup restantes.`,
        intent, capabilityId: null, evidence: [caps],
        nextStep: "Exemples : « statut CI », « crée une image de… », « ajoute une tâche : … », « analyse red team : … ».",
      });
    }
    case "github_ci": return handleGithubCi(message, params);
    case "github_code": {
      return reply({
        message: "Voici mon plan pour travailler sur le repo. Aucune modification sans ta confirmation — et toujours via une branche dédiée + PR, jamais main.",
        intent, capabilityId: "dev.agent.ci",
        actionPlan: [
          "1. Lire le statut CI + derniers runs (lecture)",
          "2. Identifier fichiers/risques concernés",
          "3. Te proposer le diff minimal + plan de rollback",
          "4. Sur confirmation : branche dédiée → commit → PR (dev.agent.ci create_pr)",
          "5. Suivre la CI, lire les logs, proposer correction si échec",
        ],
        requiresConfirmation: false,
        evidence: [{ ciOperator: ciOperatorStatus() }],
        nextStep: "Dis « prépare une PR » pour lancer l'étape 4 (confirmation demandée).",
      });
    }
    case "red_team": return handleRedTeam(message);
    case "task": return handleInternalTool(intent, "create_task", { title: message.replace(/^.*?(tâche|tache|todo)\s*:?\s*/i, "").trim() || message }, "Tâche créée ✅", "task_create");
    case "memory": return handleInternalTool(intent, "create_memory", { title: message.slice(0, 120), content: message }, "Gardé en mémoire ✅", "memory_write");
    case "decision": return handleInternalTool(intent, "create_decision", { title: message.replace(/^.*?(décision|decision)\s*:?\s*/i, "").trim().slice(0, 150) || message.slice(0, 150) }, "Décision créée ✅", "decision_create");
    case "studio": {
      if (/\b(vidéo|video|clip)\b/i.test(message)) {
        return reply({
          message: "Le Studio peut générer une vidéo 9:16 basique (FFmpeg, gratuit). Utilise la page Studio ou POST /api/capabilities/execute { capabilityId: video.generate }. Depuis le chat classique, « crée une vidéo de… » fonctionne aussi.",
          intent, capabilityId: "studio_video_basic",
          nextStep: "Précise le sujet et je prépare la génération.",
        });
      }
      return handleInternalTool(intent, "generate_image", { prompt: message }, "Image générée ✅ (Pollinations, gratuit)", "studio_image");
    }
    case "file": return notConnected(intent, "files_read", "L'analyse de fichiers", "Prochaine PR : upload + extraction PDF/Word/CSV. En attendant, colle le texte dans le chat et je l'analyse.");
    case "gmail": return notConnected(intent, "gmail_read", "Gmail", "Je peux préparer l'intégration OAuth (scopes minimaux, lecture + brouillons, jamais d'envoi auto) — PR dédiée.");
    case "calendar": return notConnected(intent, "calendar_read", "Google Calendar", "Je peux préparer l'intégration OAuth (lecture d'abord, création d'événement avec confirmation) — PR dédiée.");
    case "telegram_sheet": return notConnected(intent, "telegram_sheet_capture", "La capture Telegram/Google Sheet", "Ton bot Telegram → Sheet existant sera branché tel quel (webhook + import CSV) — PR dédiée, sans le remplacer.");
    case "automation": {
      const enabled = process.env.TAMS_DEV_AGENT_SCHEDULER === "true";
      return reply({
        message: enabled
          ? "Le scheduler interne est actif. Les automatisations récurrentes (briefing, revue, rapports) sont des actions sensibles : chacune demandera confirmation à la création."
          : "Les automatisations ne sont pas activées (TAMS_DEV_AGENT_SCHEDULER off — garde-fou volontaire).",
        intent, capabilityId: "automation_schedule",
        executionStatus: enabled ? "completed" : "blocked",
        requiresConfirmation: false,
        nextStep: enabled ? "Dis-moi quelle automatisation créer (confirmation demandée)." : "Activer TAMS_DEV_AGENT_SCHEDULER=true, ou utiliser un workflow GitHub Actions cron (gratuit).",
      });
    }
    default:
      return reply({
        message: "Je n'ai pas identifié d'action précise. Je suis UN agent avec plusieurs modes : Recherche, GitHub/CI, Red Team, Mémoire, Tâches, Décisions, Studio, Fichiers (bientôt), Gmail/Calendar (bientôt), Automatisations.",
        intent: "unknown",
        nextStep: "Reformule, ou demande « mes capacités » pour la liste complète.",
      });
  }
}
