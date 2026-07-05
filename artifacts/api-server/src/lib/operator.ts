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
import { searchWeb, type SearchResult } from "./agent-tools.js";
import { githubConfigured } from "./dev-agent-ci-operator.js";
import { readFile, searchCode, MissingGithubConfig } from "./github-code-operator.js";
import { readUrl, findUrl, BlockedUrl } from "./web-read.js";

// ─── Types du contrat de réponse (voir issue #94) ────────────────────────────

export type OperatorIntent =
  | "status" | "capabilities" | "github_ci" | "github_code" | "red_team"
  | "memory" | "task" | "decision" | "file" | "studio" | "research"
  | "gmail" | "calendar" | "telegram_sheet" | "automation" | "briefing" | "unknown";

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
      case "code_propose": {
        const { proposeChange } = await import("./github-code-operator.js");
        entry.result = await proposeChange({
          repo: asStr(p.repo),
          branch: asStr(p.branch) || "",
          files: Array.isArray(p.files) ? p.files as Array<{ path: string; content: string }> : [],
          commitMessage: asStr(p.commitMessage),
          prTitle: asStr(p.prTitle),
          prBody: asStr(p.prBody),
        });
        break;
      }
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
  if (/\b(explique|montre|affiche|lis|résume|resume)\b/.test(t) && /[\w./-]+\.(ts|tsx|js|jsx|mjs|cjs|json|md|ya?ml|css|html|py|sh|sql)\b/.test(t)) return "github_code";
  if (/\b(où est|ou est|cherche|trouve|where is)\b/.test(t) && /\b(fonctions?|function|classes?|class|fichiers?|code|variables?|endpoints?|routes?|composants?|imports?)\b/.test(t)) return "github_code";
  if (/\b(modifie|modifier|ajoute|ajouter|change|remplace|remplacer|corrige|corriger|refactor|réécris|reecris|renomme)\b/.test(t) && /[\w./-]+\.(ts|tsx|js|jsx|mjs|cjs|json|md|ya?ml|css|html|py|sh|sql)\b/.test(t)) return "github_code";
  if (/\bred[ -]?team\b|\bavocat du diable\b|\bcritique?\b.*\b(décision|decision|plan|idée|idee)\b/.test(t)) return "red_team";
  if (/\b(tâches?|taches?|todos?|à faire|a faire)\b/.test(t)) return "task";
  if (/\b(mémoires?|memoires?|retiens|souviens|garde ça|garde ca|note ça|note ca|mémorise|memorise)\b/.test(t)) return "memory";
  if (/\b(décisions?|decisions?|trancher|choisir entre)\b/.test(t)) return "decision";
  if (/\b(fichiers?|documents?|pdfs?|docx?|excel|csv|factures?|cv)\b/.test(t) && /\b(lis|résume|resume|analyse|extrais|extrait)\b/.test(t)) return "file";
  if (/\b(images?|visuels?|logos?|affiches?|vidéos?|videos?|clips?|musiques?|studio|covers?|storyboards?|hooks?|captions?|ugc|scripts? (vidéo|video|tiktok)|packs? d'assets)\b/.test(t)) return "studio";
  if (/\b(e-?mails?|mails?|gmail|boîte|boite de réception|inbox)\b/.test(t)) return "gmail";
  if (/\b(agenda|calendrier|calendar|rendez-vous|rdv|réunion|reunion|créneau|creneau)\b/.test(t)) return "calendar";
  if (/\b(telegram|google sheet|sheet|capture)\b/.test(t)) return "telegram_sheet";
  if (/\b(automatis|récurrent|recurrent|tous les jours|chaque matin|chaque soir|programme)\b/.test(t)) return "automation";
  if (/\b(briefing|résumé de (ma |la )?journée|resume de (ma |la )?journee|point du matin)\b/.test(t)) return "briefing";
  if (/\b(rappelle-moi|rappels?)\b/.test(t)) return "task";
  if (/https?:\/\/\S+/i.test(t)) return "research"; // une URL → lire la page
  if (/\b(recherche approfondie|recherches?|compare|comparatifs?|veille|synthèses?|syntheses?|rapports?|étude de marché|etude de marche)\b/.test(t)) return "research";
  if (/\b(capacités|capacites|capabilities|que peux-tu|que sais-tu faire|tes modes|aide)\b/.test(t)) return "capabilities";
  if (/\b(readiness|prêt|pret|santé|sante|diagnostic|système|systeme)\b/.test(t)) return "status";
  return "unknown";
}

// ─── Capabilities — carte MAXIMUM free-first (voir operator-capabilities.ts) ──
// La carte complète (10 groupes, statuts calculés depuis l'env, règle de vérité)
// vit dans operator-capabilities.ts pour rester lisible. On ré-exporte ici.

import { operatorCapabilitiesMax, OPERATOR_PRODUCT_MESSAGE } from "./operator-capabilities.js";
import type { OperatorCapability } from "./operator-capabilities.js";

export type { OperatorCapability } from "./operator-capabilities.js";
export { OPERATOR_PRODUCT_MESSAGE } from "./operator-capabilities.js";

export function operatorCapabilities(): OperatorCapability[] {
  return operatorCapabilitiesMax();
}

// ─── Readiness operator (PASS/WARN/FAIL/FUTURE + cause/risque/action) ─────────

export interface ReadinessEntry {
  id: string;
  verdict: "PASS" | "WARN" | "FAIL" | "FUTURE";
  cause?: string;
  risk?: string;
  nextAction?: string;
  provider?: string;
  freeFirst?: boolean;
  evidence?: string;
}

// ffmpeg : vérif réelle (spawn). On ne met en cache QUE les succès : un échec
// transitoire (spawn flaky) ne doit jamais devenir un FAIL permanent du readiness.
let ffmpegCache: boolean | null = null;
async function ffmpegAvailable(): Promise<boolean> {
  if (ffmpegCache === true) return true;
  try {
    const { spawn } = await import("node:child_process");
    const ok = await new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (v: boolean) => { if (!done) { done = true; resolve(v); } };
      const p = spawn("ffmpeg", ["-version"], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      const onData = (d: Buffer) => { out += d.toString(); };
      p.stdout.on("data", onData);
      p.stderr.on("data", onData);
      p.on("error", () => finish(false)); // binaire absent
      // On attend la fermeture normale (code 0 + bannière) plutôt que de tuer
      // le process sur le premier chunk (source de faux négatifs / flakiness).
      p.on("close", (code) => finish(code === 0 || /ffmpeg version/i.test(out)));
      const t = setTimeout(() => { try { p.kill(); } catch { /* déjà mort */ } finish(/ffmpeg version/i.test(out)); }, 5000);
      p.on("close", () => clearTimeout(t));
    });
    if (ok) ffmpegCache = true; // seul le succès est mémorisé
    return ok;
  } catch {
    return false;
  }
}

export async function operatorReadiness(): Promise<{ overall: "PASS" | "WARN" | "FAIL"; checks: ReadinessEntry[]; generatedAt: string }> {
  const E = (id: string, verdict: ReadinessEntry["verdict"], extra: Omit<ReadinessEntry, "id" | "verdict"> = {}): ReadinessEntry =>
    ({ id, verdict, freeFirst: true, ...extra });

  const ai = Boolean(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OLLAMA_BASE_URL || process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY);
  const vision = Boolean(process.env.GEMINI_API_KEY);
  const github = Boolean(process.env.GITHUB_TOKEN);
  const prWrite = process.env.TAMS_DEV_AGENT_PR_WRITE === "true";
  const ciWrite = process.env.TAMS_DEV_AGENT_CI_WRITE === "true";
  const scheduler = process.env.TAMS_DEV_AGENT_SCHEDULER === "true";
  const requireAuth = process.env.REQUIRE_AUTH === "true";
  const personalGate = process.env.TAMS_PERSONAL_ACCESS_ENABLED === "true";
  const ffmpeg = await ffmpegAvailable();

  let dbOk = false;
  try {
    const { pool } = await import("@workspace/db");
    await pool.query("SELECT 1");
    dbOk = true;
  } catch { /* down */ }

  const checks: ReadinessEntry[] = [
    personalGate
      ? E("personal_access", "PASS", { provider: "personal gate", evidence: "TAMS_PERSONAL_ACCESS_ENABLED=true" })
      : requireAuth
        ? E("personal_access", "WARN", { cause: "Protégé via REQUIRE_AUTH (Supabase), gate personnel dédié absent", risk: "dépend de Supabase pour un usage mono-utilisateur", nextAction: "PR personal access gate (TAMS_PERSONAL_ACCESS_*) puis bascule Railway", provider: "Supabase" })
        : E("personal_access", "FAIL", { cause: "Ni REQUIRE_AUTH ni personal gate actifs", risk: "plateforme personnelle exposée", nextAction: "Activer REQUIRE_AUTH=true ou livrer le gate" }),
    E("auth_required", requireAuth ? "PASS" : "WARN", { cause: requireAuth ? undefined : "REQUIRE_AUTH inactif ici", evidence: requireAuth ? "REQUIRE_AUTH=true" : "environnement local/test", provider: "Supabase" }),
    E("operator_chat", "PASS", { evidence: "POST /api/operator/chat + confirmations actives" }),
    github
      ? E("github_ci", "PASS", { provider: "GitHub API (gratuit)", evidence: "GITHUB_TOKEN présent — lecture runs/jobs/logs" })
      : E("github_ci", "FAIL", { cause: "GITHUB_TOKEN absent", risk: "mode GitHub/CI inopérant", nextAction: "Ajouter GITHUB_TOKEN (fine-grained)" }),
    github && prWrite
      ? E("github_pr", "PASS", { provider: "dev.agent.ci", evidence: "flag PR actif — création via confirmation" })
      : E("github_pr", "WARN", { cause: "TAMS_DEV_AGENT_PR_WRITE off ou token absent", risk: "PR bloquées (garde-fou volontaire)", nextAction: "Activer le flag quand tu veux des PR depuis le chat" }),
    E("github_code_edit", "FUTURE", { cause: "Contents API non branchée", nextAction: "PR GitHub Code Operator (branche + édition confirmée)", provider: "GitHub Contents API (gratuit)" }),
    E("memory", dbOk ? "PASS" : "FAIL", { cause: dbOk ? undefined : "DB injoignable", risk: dbOk ? undefined : "mémoire indisponible", nextAction: dbOk ? undefined : "Vérifier DATABASE_URL", provider: "Postgres/Supabase" }),
    E("tasks", dbOk ? "PASS" : "FAIL", { cause: dbOk ? undefined : "DB injoignable", nextAction: dbOk ? undefined : "Vérifier DATABASE_URL", provider: "Postgres/Supabase" }),
    E("decisions", dbOk ? "PASS" : "FAIL", { cause: dbOk ? undefined : "DB injoignable", nextAction: dbOk ? undefined : "Vérifier DATABASE_URL", provider: "Postgres/Supabase" }),
    E("projects", dbOk ? "PASS" : "FAIL", { cause: dbOk ? undefined : "DB injoignable", nextAction: dbOk ? undefined : "Vérifier DATABASE_URL", provider: "Postgres/Supabase" }),
    E("files", "WARN", { cause: "Upload documents non branché", risk: "PDF/Word non analysables nativement", nextAction: "PR fichiers (upload + extraction)", evidence: "Fallback : coller le texte dans le chat" }),
    E("pdf", "WARN", { cause: "Extraction PDF absente", nextAction: "PR fichiers", evidence: "Fallback texte collé" }),
    E("word", "WARN", { cause: "Extraction Word absente", nextAction: "PR fichiers", evidence: "Fallback texte collé" }),
    E("excel_csv", ai ? "PASS" : "WARN", { cause: ai ? undefined : "LLM absent", provider: "ai-router", evidence: "Analyse d'un CSV collé disponible maintenant" }),
    E("image_analysis", vision ? "PASS" : "WARN", { cause: vision ? undefined : "GEMINI_API_KEY absent", provider: "Gemini vision (quota gratuit)", evidence: vision ? "Pièces jointes du Chat analysées" : undefined, nextAction: vision ? undefined : "Ajouter GEMINI_API_KEY" }),
    E("studio_image", "PASS", { provider: "Pollinations (sans clé)", evidence: "Génération réelle URL image" }),
    E("studio_video_basic", ffmpeg ? "PASS" : "FAIL", { cause: ffmpeg ? undefined : "ffmpeg introuvable", provider: "FFmpeg", evidence: ffmpeg ? "Composition MP4 réelle (pas de text-to-video IA)" : undefined, nextAction: ffmpeg ? undefined : "Vérifier ffmpeg dans nixpacks" }),
    E("studio_ffmpeg", ffmpeg ? "PASS" : "FAIL", { cause: ffmpeg ? undefined : "ffmpeg introuvable", provider: "FFmpeg", nextAction: ffmpeg ? undefined : "Vérifier nixpacks" }),
    E("studio_storyboard_script", ai ? "PASS" : "WARN", { cause: ai ? undefined : "LLM absent", provider: "ai-router", nextAction: ai ? undefined : "Configurer un provider IA gratuit" }),
    E("studio_ugc_assets", ai ? "PASS" : "WARN", { cause: ai ? undefined : "LLM absent", provider: "ai-router", evidence: "Hooks/captions/prompts/packs via chat" }),
    E("studio_audio_voice", "PASS", { provider: process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY ? "HuggingFace + fallback local" : "fallback WAV local (dégradé, annoncé)", evidence: "Jamais présenté comme premium si fallback" }),
    E("telegram_capture", "WARN", { cause: "Endpoint capture absent", risk: "captures Telegram non importées", nextAction: "PR capture : POST /api/integrations/telegram-capture", evidence: "Bot + Sheet existants côté utilisateur" }),
    E("google_sheet_sync", "WARN", { cause: "Import Sheet/CSV absent", nextAction: "PR capture : import CSV + anti-duplication" }),
    E("gmail", "WARN", { cause: "OAuth Google non configuré", risk: "emails non lisibles", nextAction: "PR Gmail OAuth (scopes minimaux, drafts seulement)", provider: "Google OAuth (gratuit)" }),
    E("calendar", "WARN", { cause: "OAuth Google non configuré", risk: "agenda non lisible", nextAction: "PR Calendar OAuth (lecture d'abord)", provider: "Google OAuth (gratuit)" }),
    E("automations", scheduler ? "PASS" : "WARN", { cause: scheduler ? undefined : "TAMS_DEV_AGENT_SCHEDULER off (garde-fou)", nextAction: scheduler ? undefined : "Activer le flag ou GitHub Actions cron", evidence: ciWrite ? "CI write actif" : undefined, provider: "scheduler interne / GitHub Actions" }),
    E("database", dbOk ? "PASS" : "FAIL", { cause: dbOk ? undefined : "Connexion impossible", nextAction: dbOk ? undefined : "Vérifier DATABASE_URL (TLS Supabase)", provider: "Postgres/Supabase" }),
    E("ai_providers", ai ? "PASS" : "FAIL", { cause: ai ? undefined : "Aucun provider gratuit configuré", nextAction: ai ? undefined : "GROQ_API_KEY ou GEMINI_API_KEY", provider: "Groq/Gemini/HF/OpenRouter/Ollama" }),
    E("security", "WARN", { cause: "Personal gate absent ; confirmations + redaction actives", risk: "voir personal_access", nextAction: "PR #2 personal access gate", evidence: "Secrets caviardés dans les logs CI ; actions sensibles confirmées" }),
    E("deployment", "PASS", { provider: "Railway + Nixpacks + CI GitHub", evidence: "CI verte requise avant déploiement (Wait for CI)" }),
    E("web_app", "PASS", { evidence: "/mon-agent + pages existantes servies" }),
    E("whatsapp_future", "FUTURE", { cause: "API officielle payante/complexe", freeFirst: false, nextAction: "Attendre solution gratuite fiable ou validation explicite d'un coût", evidence: "Jamais présenté comme disponible maintenant" }),
  ];

  const overall = checks.some(x => x.verdict === "FAIL") ? "FAIL" : checks.some(x => x.verdict === "WARN") ? "WARN" : "PASS";
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

/** Génération texte free-first (LLM) avec honnêteté sur les limites. */
async function llmReply(
  intent: OperatorIntent,
  capabilityId: string,
  system: string,
  user: string,
  extra: Partial<OperatorReply> = {},
): Promise<OperatorReply> {
  try {
    const { aiConfigured, aiChat } = await import("./ai.js");
    if (!aiConfigured()) {
      return reply({
        message: "Aucun provider IA gratuit configuré : je ne peux pas produire ce contenu maintenant.",
        intent, capabilityId, executionStatus: "blocked",
        warnings: ["GROQ_API_KEY / GEMINI_API_KEY absents"],
        nextStep: "Configurer un provider gratuit puis relancer.",
      });
    }
    const completion = await aiChat({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 900,
    }, "reasoning");
    const content: string = completion?.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) throw new Error("réponse vide");
    return reply({ message: content, intent, capabilityId, evidence: [{ provider: "ai-router free-first" }], ...extra });
  } catch (err) {
    return reply({
      message: `Génération indisponible: ${err instanceof Error ? err.message : "erreur"}`,
      intent, capabilityId, executionStatus: "failed",
      nextStep: "Réessayer dans un instant (quota gratuit possiblement saturé).",
    });
  }
}

/**
 * Boucle autonome de l'agent codeur (free-first, SÛR) :
 * instruction NL → lecture du fichier → le LLM gratuit génère le NOUVEAU contenu
 * complet → PROPOSITION en CONFIRMATION obligatoire (jamais main, jamais merge,
 * flag requis pour l'exécution). Un seul fichier par passe (borne de sûreté).
 */
async function handleCodeChange(message: string): Promise<OperatorReply> {
  const CAP = "github_pr_create_confirmed";
  if (!githubConfigured()) {
    return notConnected("github_code", CAP, "L'agent codeur (écriture)", "Définir GITHUB_TOKEN (droit d'écriture) côté serveur.");
  }
  const pathMatch = message.match(/([\w.-]+\/)*[\w.-]+\.(ts|tsx|js|jsx|mjs|cjs|json|md|ya?ml|css|html|py|sh|sql)\b/);
  if (!pathMatch) {
    return reply({ message: "Indique le fichier exact à modifier, ex : « modifie artifacts/api-server/src/app.ts pour … ».", intent: "github_code", capabilityId: CAP, executionStatus: "blocked", nextStep: "Donne le chemin du fichier." });
  }
  const path = pathMatch[0];

  let current;
  try {
    current = await readFile({ path });
  } catch (err) {
    if (err instanceof MissingGithubConfig) return notConnected("github_code", CAP, "L'agent codeur", "Définir GITHUB_TOKEN côté serveur.");
    return reply({ message: `Lecture impossible : ${err instanceof Error ? err.message : "erreur"}`, intent: "github_code", capabilityId: CAP, executionStatus: "failed", nextStep: "Vérifie le chemin exact du fichier." });
  }

  const { aiConfigured, aiChat } = await import("./ai.js");
  if (!aiConfigured()) {
    return reply({ message: "Aucun provider IA configuré : je ne peux pas générer la modification, et je ne fabrique rien.", intent: "github_code", capabilityId: CAP, executionStatus: "blocked", warnings: ["GROQ_API_KEY / GEMINI_API_KEY absents"], nextStep: "Configurer un LLM gratuit." });
  }
  if (current.truncated) {
    return reply({ message: `Fichier trop volumineux pour une modification sûre en une passe (${current.size} octets) : je refuse pour ne pas risquer une troncature.`, intent: "github_code", capabilityId: CAP, executionStatus: "blocked", nextStep: "Cible un fichier plus petit ou une section précise." });
  }

  let content = "";
  try {
    const c = await aiChat({
      messages: [
        { role: "system", content: "Tu es ingénieur logiciel senior. On te donne le contenu ACTUEL d'un fichier et une instruction. Applique STRICTEMENT l'instruction et renvoie UNIQUEMENT le CONTENU COMPLET du nouveau fichier — aucun ```, aucune explication, aucun diff : juste le fichier entier prêt à committer. Conserve le style existant. Ne casse rien d'autre." },
        { role: "user", content: `Instruction : ${message}\n\nFichier ${current.path} (contenu actuel) :\n${current.content}` },
      ],
      max_tokens: 4000,
    }, "reasoning");
    content = c?.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    return reply({ message: `Génération indisponible : ${err instanceof Error ? err.message : "erreur"}`, intent: "github_code", capabilityId: CAP, executionStatus: "failed", nextStep: "Réessayer (quota gratuit possiblement saturé)." });
  }

  content = content.trim().replace(/^```[\w-]*\n?/, "").replace(/\n?```$/, "").trim();
  if (!content || content.length < 5) {
    return reply({ message: "Le modèle n'a pas renvoyé de contenu exploitable : je ne propose rien plutôt que de risquer de casser le fichier.", intent: "github_code", capabilityId: CAP, executionStatus: "blocked", nextStep: "Reformule l'instruction." });
  }
  if (content === current.content.trim()) {
    return reply({ message: "Contenu généré identique à l'actuel : aucune modification (ou instruction pas assez précise).", intent: "github_code", capabilityId: CAP, executionStatus: "completed", nextStep: "Précise ce qu'il faut changer." });
  }

  const branch = `tams/agent-${Date.now().toString(36)}`;
  const short = message.slice(0, 60);
  const propose = {
    branch,
    files: [{ path: current.path, content }],
    commitMessage: `TAMS agent: ${short}`,
    prTitle: `TAMS agent: ${short}`,
    prBody: `Modification proposée par Mon Agent (après confirmation).\n\nInstruction : ${message}\nFichier : ${current.path}`,
  };
  const entry = createPending(CAP, "code_propose", propose, `Modifier ${current.path} → PR sur ${branch} (jamais main, jamais merge).`);
  const flagOff = process.env.TAMS_DEV_AGENT_PR_WRITE !== "true";
  return reply({
    message: `Proposition prête pour ${current.path} (${content.length} octets). Confirme pour créer la branche « ${branch} » + la PR.${flagOff ? " ⚠️ L'exécution nécessite TAMS_DEV_AGENT_PR_WRITE=true côté serveur." : ""} Jamais sur main, jamais de merge.`,
    intent: "github_code", capabilityId: CAP,
    requiresConfirmation: true, confirmationId: entry.id,
    evidence: [{ path: current.path, branch, newSize: content.length, preview: content.slice(0, 500) }],
    warnings: flagOff ? ["TAMS_DEV_AGENT_PR_WRITE=false : flag d'écriture requis pour exécuter"] : [],
    nextStep: "POST /api/operator/confirm { id } pour créer la PR, ou /api/operator/cancel.",
  });
}

/**
 * Agent codeur — LECTURE SEULE (façon Claude Code, free-first).
 * « explique ce fichier X » → lit le fichier (API GitHub) + synthèse LLM.
 * « où est / cherche X »    → recherche de code.
 * Sinon → plan (l'écriture réelle = PR dédiée, confirmation, jamais main).
 */
async function handleGithubCode(message: string, params: Record<string, unknown> = {}): Promise<OperatorReply> {
  // Écriture structurée : { propose: { branch, files:[{path,content}], commitMessage, prTitle, prBody } }
  // → CONFIRMATION obligatoire (jamais exécutée sans confirm). Jamais main, jamais merge.
  const propose = params.propose as { branch?: string; files?: unknown[] } | undefined;
  if (propose && Array.isArray(propose.files) && propose.files.length > 0) {
    if (!githubConfigured()) {
      return notConnected("github_code", "github_pr_create_confirmed", "L'écriture de code (PR)", "Définir GITHUB_TOKEN côté serveur.");
    }
    const branch = String(propose.branch || "").trim();
    const entry = createPending("github_pr_create_confirmed", "code_propose", propose as Record<string, unknown>,
      `Créer la branche « ${branch} » (${propose.files.length} fichier(s)) et ouvrir une PR — jamais main, jamais merge.`);
    return reply({
      message: `Changement prêt : branche « ${branch} », ${propose.files.length} fichier(s). Confirme pour créer la branche + la PR. Rien n'est écrit sans ta confirmation, jamais sur main, jamais de merge.`,
      intent: "github_code", capabilityId: "github_pr_create_confirmed",
      requiresConfirmation: true, confirmationId: entry.id,
      warnings: process.env.TAMS_DEV_AGENT_PR_WRITE === "true" ? [] : ["TAMS_DEV_AGENT_PR_WRITE=false : le flag d'écriture doit être activé côté serveur pour exécuter"],
      nextStep: "POST /api/operator/confirm { id } pour créer la PR, ou /api/operator/cancel.",
    });
  }

  const plan = (): OperatorReply => reply({
    message: "Je peux LIRE le repo (explique un fichier, cherche du code) et préparer un plan. L'écriture réelle (branche → commit → PR) arrive bientôt, toujours sur confirmation, jamais sur main, jamais de merge auto.",
    intent: "github_code", capabilityId: "dev.agent.ci",
    actionPlan: [
      "1. Lire les fichiers/parties concernés (API GitHub, lecture seule)",
      "2. Identifier risques + diff minimal",
      "3. Sur confirmation : branche dédiée → commit → PR (à venir)",
      "4. Suivre la CI, proposer correction si échec",
    ],
    evidence: [{ ciOperator: ciOperatorStatus(), readTools: ["/api/code/file", "/api/code/tree", "/api/code/search"] }],
    nextStep: "Ex : « explique artifacts/api-server/src/app.ts » ou « où est searchWeb ? ».",
  });

  // Instruction de MODIFICATION (« modifie/ajoute/corrige … <fichier> ») → boucle
  // autonome : lecture → LLM génère le nouveau contenu → PROPOSITION (confirmation).
  if (/\b(modifie|modifier|ajoute|ajouter|change|remplace|remplacer|corrige|corriger|refactor|réécris|reecris|renomme)\b/i.test(message)
      && /[\w./-]+\.(ts|tsx|js|jsx|mjs|cjs|json|md|ya?ml|css|html|py|sh|sql)\b/.test(message)) {
    return handleCodeChange(message);
  }

  if (!githubConfigured()) {
    return notConnected("github_code", "github_repo_analyze", "L'opérateur de code (lecture du repo)",
      "Définir GITHUB_TOKEN côté serveur pour lire les fichiers du repo.");
  }

  // Détecte un chemin de fichier (avec extension).
  const pathMatch = message.match(/([\w.-]+\/)*[\w.-]+\.[A-Za-z0-9]{1,6}\b/);
  const wantsExplain = /\b(explique|montre|affiche|lis|résume|resume|comprends?)\b/i.test(message);
  if (pathMatch && (wantsExplain || /\b(fichier|file)\b/i.test(message))) {
    try {
      const file = await readFile({ path: pathMatch[0] });
      const { aiConfigured, aiChat } = await import("./ai.js");
      const excerpt = file.content.slice(0, 8000);
      if (aiConfigured()) {
        const c = await aiChat({
          messages: [
            { role: "system", content: "Tu es ingénieur senior. Explique le rôle de ce fichier, ses points clés, risques/dette éventuels. Concis, en français. Ne fabrique rien hors du code fourni." },
            { role: "user", content: `Fichier ${file.path} (${file.repo}) :\n\n${excerpt}` },
          ], max_tokens: 700,
        }, "reasoning");
        const content = c?.choices?.[0]?.message?.content ?? "";
        return reply({
          message: content.trim() || `Fichier ${file.path} lu (${file.size} octets).`,
          intent: "github_code", capabilityId: "repo_architecture_analysis",
          evidence: [{ repo: file.repo, path: file.path, size: file.size, truncated: file.truncated }],
          nextStep: "Je peux chercher où il est utilisé (« où est X ») ou préparer un changement (PR à venir).",
        });
      }
      return reply({
        message: `Fichier ${file.path} lu (${file.size} octets). Configure une clé IA gratuite pour l'explication automatique. Extrait :\n\n${excerpt.slice(0, 1500)}`,
        intent: "github_code", capabilityId: "repo_architecture_analysis",
        evidence: [{ repo: file.repo, path: file.path, size: file.size, truncated: file.truncated }],
        warnings: ["Synthèse LLM non générée (aucun provider IA configuré)"],
      });
    } catch (err) {
      if (err instanceof MissingGithubConfig) return notConnected("github_code", "github_repo_analyze", "L'opérateur de code", "Définir GITHUB_TOKEN côté serveur.");
      return reply({ message: `Lecture impossible : ${err instanceof Error ? err.message : "erreur"}`, intent: "github_code", capabilityId: "github_repo_analyze", executionStatus: "failed", nextStep: "Vérifie le chemin exact du fichier." });
    }
  }

  // Recherche de code.
  const search = message.match(/\b(où est|ou est|cherche|trouve|find|where is)\b\s+(.+)$/i);
  if (search) {
    const q = search[2].replace(/[?.!]+$/, "").trim();
    try {
      const r = await searchCode({ query: q, limit: 10 });
      const list = r.hits.length ? r.hits.map(h => `• ${h.path}`).join("\n") : "(aucun résultat)";
      return reply({
        message: `Recherche « ${q} » : ${r.total} résultat(s).\n${list}`,
        intent: "github_code", capabilityId: "github_repo_analyze",
        evidence: [{ query: r.query, total: r.total, hits: r.hits }],
        nextStep: "Dis « explique <chemin> » pour lire un de ces fichiers.",
      });
    } catch (err) {
      if (err instanceof MissingGithubConfig) return notConnected("github_code", "github_repo_analyze", "L'opérateur de code", "Définir GITHUB_TOKEN côté serveur.");
      return reply({ message: `Recherche impossible : ${err instanceof Error ? err.message : "erreur"}`, intent: "github_code", capabilityId: "github_repo_analyze", executionStatus: "failed", nextStep: "Reformule la recherche." });
    }
  }

  return plan();
}

function notConnected(intent: OperatorIntent, capabilityId: string, label: string, setup: string): OperatorReply {
  return reply({
    message: `${label} n'est pas encore connecté. Je ne simule jamais une capacité absente. Je peux préparer l'intégration ou te guider.`,
    intent, capabilityId, executionStatus: "blocked",
    warnings: [`${capabilityId}: missing`],
    nextStep: setup,
  });
}

/**
 * Recherche web RÉELLE + synthèse sourcée, free-first.
 * Web = DuckDuckGo/SearXNG (searchWeb, sans clé). Synthèse = ai-router gratuit.
 * Règle de vérité : on ne fabrique jamais de source ni d'URL. Sans LLM, on
 * renvoie les sources brutes (utile et honnête) plutôt qu'un blocage sec.
 */
async function handleResearch(message: string): Promise<OperatorReply> {
  const CAP = "research_source_based";

  // Une URL dans le message → lire la page et la résumer (jamais de faux contenu).
  const url = findUrl(message);
  if (url) {
    let page;
    try {
      page = await readUrl(url);
    } catch (err) {
      if (err instanceof BlockedUrl) {
        return reply({ message: `URL refusée : ${err.message}.`, intent: "research", capabilityId: "web_read", executionStatus: "blocked", nextStep: "Fournis une URL publique http(s)." });
      }
      return reply({ message: `Lecture de la page impossible : ${err instanceof Error ? err.message : "erreur réseau"}. Je ne fabrique rien.`, intent: "research", capabilityId: "web_read", executionStatus: "failed", nextStep: "Vérifie l'URL ou réessaie." });
    }
    if (!page.text || page.text.trim().length < 20) {
      return reply({ message: `Page lue (${page.url}) mais peu/pas de texte exploitable (page JS ou vide ?). Je ne résume pas du vide.`, intent: "research", capabilityId: "web_read", executionStatus: "blocked", evidence: [{ url: page.url, title: page.title, chars: page.chars }], nextStep: "Colle le texte, ou donne une autre URL." });
    }
    const { aiConfigured, aiChat } = await import("./ai.js");
    if (!aiConfigured()) {
      return reply({ message: `Page lue : ${page.title || page.url} (${page.chars} car.). Configure une clé IA gratuite pour le résumé automatique. Extrait :\n\n${page.text.slice(0, 1500)}`, intent: "research", capabilityId: "web_read", executionStatus: "completed", evidence: [{ url: page.url, title: page.title, chars: page.chars }], warnings: ["Synthèse LLM non générée (aucun provider IA configuré)"] });
    }
    try {
      const c = await aiChat({
        messages: [
          { role: "system", content: "Tu es analyste. Résume la page fournie : idées clés, chiffres, conclusion. Cite l'URL. N'invente rien hors du contenu. Français, concis." },
          { role: "user", content: `URL : ${page.url}\nTitre : ${page.title}\n\nContenu :\n${page.text.slice(0, 20000)}` },
        ], max_tokens: 800,
      }, "reasoning");
      const content = c?.choices?.[0]?.message?.content ?? "";
      return reply({ message: content.trim() || `Page lue : ${page.title || page.url}.`, intent: "research", capabilityId: "web_read", executionStatus: "completed", evidence: [{ url: page.url, title: page.title, chars: page.chars }], nextStep: "Je peux en faire des tâches, ou lire une autre source." });
    } catch (err) {
      return reply({ message: `Page lue (${page.url}) mais synthèse indisponible (${err instanceof Error ? err.message : "erreur"}). Extrait :\n\n${page.text.slice(0, 1500)}`, intent: "research", capabilityId: "web_read", executionStatus: "completed", evidence: [{ url: page.url, title: page.title }] });
    }
  }

  const query =
    message
      .replace(/^\s*\/?(recherches?\s+approfondies?|recherches?|cherche[rz]?|search|veilles?|synth[èe]ses?|rapports?|[ée]tude de march[ée])\s*:?\s*/i, "")
      .trim() || message.trim();

  let results: SearchResult[] = [];
  let searchError: string | null = null;
  try {
    results = await searchWeb(query);
  } catch (err) {
    searchError = err instanceof Error ? err.message : "recherche web indisponible";
  }

  // Écarte le placeholder "Aucun résultat trouvé" (pas une vraie source).
  const sources = results.filter(r => r.url && !/^Aucun résultat/i.test(r.title));
  const evidence = sources.map(r => ({ title: r.title, url: r.url, snippet: r.snippet }));
  const sourcesBlock = sources.length
    ? sources.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`).join("\n\n")
    : "(aucune source web récupérée)";

  const { aiConfigured, aiChat } = await import("./ai.js");

  // Ni source web, ni LLM → honnête, on ne simule rien.
  if (sources.length === 0 && !aiConfigured()) {
    return reply({
      message: `Aucune source web exploitable pour « ${query} » et aucun provider IA configuré. Je ne fabrique rien.`,
      intent: "research", capabilityId: CAP, executionStatus: "blocked",
      warnings: [searchError ?? "0 résultat web", "GROQ_API_KEY / GEMINI_API_KEY absents"],
      nextStep: "Reformuler la requête, ou configurer un provider IA gratuit.",
    });
  }

  // Sources trouvées mais pas de LLM → on livre les sources brutes.
  if (!aiConfigured()) {
    return reply({
      message: `Sources web pour « ${query} » (synthèse non générée : aucun provider IA configuré) :\n\n${sourcesBlock}`,
      intent: "research", capabilityId: CAP, executionStatus: "completed",
      evidence,
      warnings: ["Synthèse LLM non générée : configurer GROQ_API_KEY/GEMINI_API_KEY"],
      nextStep: "Configure un LLM gratuit pour la synthèse sourcée automatique.",
    });
  }

  // LLM disponible → synthèse strictement basée sur les sources.
  try {
    const completion = await aiChat({
      messages: [
        {
          role: "system",
          content:
            "Tu es analyste senior. À partir UNIQUEMENT des sources web fournies (numérotées), " +
            "produis une synthèse structurée : contexte, points clés, comparatif si pertinent, " +
            "risques/angles morts, recommandation. CITE les sources par leur numéro [n]. " +
            "Ne fabrique JAMAIS un fait ou une URL absent des sources. Si elles sont insuffisantes, dis-le. Français.",
        },
        { role: "user", content: `Sujet : ${query}\n\nSources web :\n${sourcesBlock}` },
      ],
      max_tokens: 900,
    }, "reasoning");
    const content: string = completion?.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) throw new Error("réponse vide");
    return reply({
      message: content,
      intent: "research", capabilityId: CAP, executionStatus: "completed",
      evidence: evidence.length ? evidence : [{ provider: "ai-router (aucune source web récupérée)" }],
      warnings: sources.length === 0 ? ["Aucune source web : synthèse basée sur les connaissances du modèle"] : [],
      nextStep: "Je peux transformer ça en décision, en tâches, ou approfondir une source.",
    });
  } catch (err) {
    // Repli : au moins les sources brutes, jamais une fausse synthèse.
    return reply({
      message: `Synthèse indisponible (${err instanceof Error ? err.message : "erreur"}). Sources web trouvées :\n\n${sourcesBlock}`,
      intent: "research", capabilityId: CAP, executionStatus: sources.length ? "completed" : "failed",
      evidence,
      warnings: ["Quota gratuit possiblement saturé"],
      nextStep: "Réessayer dans un instant.",
    });
  }
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
      const active = caps.filter(c => c.status === "available" || c.status === "configured").length;
      const future = caps.filter(c => c.status === "future").length;
      return reply({
        message: `${OPERATOR_PRODUCT_MESSAGE}\n\nÉtat réel : ${active}/${caps.length} capacités actives, ${future} prévues (future). Détail par groupe dans evidence — chaque capacité indique son provider, si elle est gratuite, et ce qui manque pour l'activer.`,
        intent, capabilityId: null, evidence: [caps],
        nextStep: "Exemples : « statut CI », « fais un storyboard UGC pour… », « crée une image de… », « ajoute une tâche : … », « analyse red team : … ».",
      });
    }
    case "github_ci": return handleGithubCi(message, params);
    case "github_code": return handleGithubCode(message, params);
    case "red_team": return handleRedTeam(message);
    case "task": return handleInternalTool(intent, "create_task", { title: message.replace(/^.*?(tâche|tache|todo)\s*:?\s*/i, "").trim() || message }, "Tâche créée ✅", "task_create");
    case "memory": return handleInternalTool(intent, "create_memory", { title: message.slice(0, 120), content: message }, "Gardé en mémoire ✅", "memory_write");
    case "decision": return handleInternalTool(intent, "create_decision", { title: message.replace(/^.*?(décision|decision)\s*:?\s*/i, "").trim().slice(0, 150) || message.slice(0, 150) }, "Décision créée ✅", "decision_create");
    case "studio": {
      const t = message.toLowerCase();
      // Studio = MULTIMÉDIA, pas image-only : script / storyboard / hooks /
      // captions / prompts / pack d'assets via LLM (gratuit, réel).
      if (/\bstoryboards?\b/.test(t)) {
        return llmReply(intent, "studio_storyboard_generate",
          "Tu es réalisateur UGC/TikTok. Produis un STORYBOARD scène par scène : n° de scène, durée, plan/cadrage, action, texte à l'écran, son. Format vertical 9:16. Français, concret, prêt à tourner.",
          message, { nextStep: "Je peux ensuite générer les images des scènes puis composer la vidéo (FFmpeg)." });
      }
      if (/\bscripts?\b/.test(t)) {
        return llmReply(intent, "studio_script_generate",
          "Tu es scénariste de vidéos courtes (TikTok/Reels). Écris un SCRIPT complet : hook (3s), déroulé seconde par seconde, CTA final. Ton naturel UGC. Français.",
          message, { nextStep: "Dis « fais le storyboard » pour la version scène par scène." });
      }
      if (/\b(hooks?|accroches?)\b/.test(t)) {
        return llmReply(intent, "studio_hook_generate",
          "Tu es expert TikTok/UGC. Donne 10 HOOKS d'ouverture (3 premières secondes) ultra-accrocheurs pour le sujet donné, numérotés, en français.",
          message);
      }
      if (/\b(captions?|légendes?|legendes?|hashtags?)\b/.test(t)) {
        return llmReply(intent, "studio_caption_generate",
          "Tu es social media manager. Donne 5 CAPTIONS prêtes à publier (avec émojis + 8-12 hashtags pertinents) pour le sujet donné. Français.",
          message);
      }
      if (/\bprompts?\b/.test(t)) {
        return llmReply(intent, "studio_prompt_generate",
          "Tu es prompt engineer. Produis des PROMPTS prêts à coller dans un générateur externe (image et vidéo) pour le sujet donné : 3 prompts image détaillés (anglais) + 2 prompts vidéo + les négatifs utiles.",
          message);
      }
      if (/\b(packs?|assets?)\b/.test(t)) {
        return llmReply(intent, "studio_asset_pack_generate",
          "Tu es directeur créatif. Produis un PACK D'ASSETS marketing complet : 1) concept, 2) script court, 3) 5 hooks, 4) 3 captions+hashtags, 5) 3 prompts image (anglais), 6) plan de déclinaisons. Français, structuré.",
          message, { nextStep: "Je peux générer le visuel principal (« crée l'image ») puis la vidéo composée." });
      }
      if (/\b(vidéo|video|clip)\b/.test(t)) {
        return reply({
          message: "Vidéo IA (text-to-video type Runway/Veo) non configurée gratuitement — je ne le simule pas. Je peux créer MAINTENANT une vidéo composée free-first : images générées + texte + transitions + audio, assemblées en MP4 réel par FFmpeg. Dis « crée une vidéo de … » dans le Chat, ou utilise la page Studio (montage : concat, resize, export).",
          intent, capabilityId: "studio_video_short_generate",
          actionPlan: ["Storyboard (LLM)", "Images des scènes (Pollinations)", "Composition MP4 (FFmpeg)", "Option : musique/voix"],
          warnings: ["Composition honnête — pas de génération vidéo IA premium"],
          nextStep: "Précise le sujet et le format (9:16 par défaut).",
        });
      }
      return handleInternalTool(intent, "generate_image", { prompt: message }, "Image générée ✅ (Pollinations, gratuit)", "studio_image_generate");
    }
    case "research": return handleResearch(message);
    case "briefing": {
      return reply({
        message: "Le briefing quotidien (priorités, risques, recommandations générés depuis tes données) est disponible sur la page Accueil et via GET /api/briefing. L'automatisation récurrente (chaque matin) n'est pas encore active — garde-fou scheduler.",
        intent, capabilityId: "briefing_daily",
        executionStatus: "completed",
        evidence: [{ endpoint: "/api/briefing", automation: process.env.TAMS_DEV_AGENT_SCHEDULER === "true" ? "scheduler actif" : "scheduler off (TAMS_DEV_AGENT_SCHEDULER)" }],
        nextStep: "Pour l'automatiser : activer TAMS_DEV_AGENT_SCHEDULER=true ou un workflow GitHub Actions cron (gratuit).",
      });
    }
    case "file": {
      const doc = params.document as { filename?: string; contentBase64?: string; text?: string } | undefined;
      if (doc && (doc.contentBase64 || doc.text)) {
        try {
          const { extractText } = await import("./document-extract.js");
          const extraction = doc.text
            ? { type: "text", text: String(doc.text).slice(0, 100000), chars: String(doc.text).length, truncated: false, note: undefined as string | undefined }
            : extractText(String(doc.filename || "document"), Buffer.from(String(doc.contentBase64), "base64"));
          if (!extraction.text || !extraction.text.trim()) {
            return reply({ message: `Aucun texte extractible. ${extraction.note || "Colle le texte, ou fournis un fichier texte."}`, intent, capabilityId: "files_read", executionStatus: "blocked", nextStep: "Colle le contenu, ou vérifie le format." });
          }
          return llmReply(intent, "document_summary",
            "Tu es analyste. À partir UNIQUEMENT du texte du document, donne : résumé court, points clés, risques/pièges, actions à faire. Français, structuré. N'invente rien hors du texte.",
            `Document ${extraction.type} :\n\n${extraction.text.slice(0, 24000)}`,
            { evidence: [{ type: extraction.type, chars: extraction.chars, truncated: extraction.truncated }], nextStep: "Je peux en créer des tâches (« ajoute une tâche : … »)." });
        } catch (err) {
          return reply({ message: `Analyse impossible : ${err instanceof Error ? err.message : "erreur"}`, intent, capabilityId: "files_read", executionStatus: "failed", nextStep: "Vérifie le format (txt/csv/md/json/docx/pdf) et la taille (< 8 Mo)." });
        }
      }
      return reply({
        message: "Envoie un document (POST /api/documents/analyze avec { filename, contentBase64 }) ou colle le texte : j'en fais résumé, points clés, risques et actions. Formats : txt, csv, md, json, docx, pdf (texte). Extraction 100% locale et gratuite.",
        intent, capabilityId: "files_read",
        evidence: [{ endpoint: "POST /api/documents/analyze" }],
        nextStep: "Colle le texte dans le chat, ou utilise le endpoint documents.",
      });
    }
    case "gmail": return notConnected(intent, "gmail_read", "Gmail", "Je peux préparer l'intégration OAuth (scopes minimaux, lecture + brouillons, jamais d'envoi auto) — PR dédiée.");
    case "calendar": return notConnected(intent, "calendar_read", "Google Calendar", "Je peux préparer l'intégration OAuth (lecture d'abord, création d'événement avec confirmation) — PR dédiée.");
    case "telegram_sheet": {
      const on = Boolean(process.env.TAMS_TELEGRAM_CAPTURE_SECRET);
      if (on) {
        return reply({
          message: "Capture Telegram/Sheet branchée : ton workflow n8n peut envoyer une note/idée/tâche à TAMS, qui la range en tâche ou en mémoire. Le endpoint ne fait que stocker — aucune action sensible n'est exécutée sans confirmation.",
          intent, capabilityId: "telegram_capture", executionStatus: "completed",
          evidence: [{ endpoint: "POST /api/integrations/telegram-capture", auth: "secret partagé (x-tams-capture-secret)" }],
          nextStep: "Dans n8n, ajoute un nœud HTTP Request POST vers /api/integrations/telegram-capture avec l'en-tête x-tams-capture-secret et { text }.",
        });
      }
      return notConnected(intent, "telegram_capture", "La capture Telegram/Google Sheet",
        "Endpoint prêt (POST /api/integrations/telegram-capture). Pour l'activer : définir TAMS_TELEGRAM_CAPTURE_SECRET côté serveur, puis pointer ton workflow n8n dessus. On réutilise ton bot + Sheet existants, sans les remplacer.");
    }
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
