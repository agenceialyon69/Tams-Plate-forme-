/**
 * Intent Engine
 *
 * Classifies a raw user message into a structured IntentResult.
 * Uses AI first, keyword fallback second.
 * Never makes assumptions about dangerous actions.
 */

import { aiChat } from "../ai.js";
import type { Intent, IntentResult, RiskLevel, PermissionMode } from "./kernel-types.js";

// ─── Keyword classifier ────────────────────────────────────────────────────────

const INTENT_KEYWORDS: Record<Intent, string[]> = {
  chat: ["bonjour", "salut", "merci", "comment", "pourquoi", "qu'est-ce"],
  general_chat: ["dis-moi", "explique", "c'est quoi"],
  create_task: ["crée une tâche", "nouvelle tâche", "ajoute une tâche", "todo", "/tâche"],
  task_create: ["/task"],
  create_project: ["crée un projet", "nouveau projet", "lance un projet", "/projet"],
  project_plan: ["plan de projet", "roadmap", "planning"],
  generate_image: ["génère une image", "crée une image", "/image", "dessine", "image de"],
  generate_video: ["génère une vidéo", "crée une vidéo", "vidéo de", "/video"],
  generate_music: ["génère de la musique", "crée une musique", "musique", "/music"],
  studio_create: ["studio", "/studio", "brief créatif", "campagne", "contenu"],
  search_memory: ["cherche en mémoire", "qu'est-ce que tu sais", "souviens-toi", "mémoire de"],
  memory_query: ["que sais-tu de", "rappelle-moi", "souvenir"],
  make_decision: ["décide", "décision", "choisis entre", "analyse cette décision"],
  decision_red_team: ["red team", "risque", "qu'est-ce qui peut mal", "faille", "challenge"],
  continue_project: ["continue le projet", "reprends le travail", "prochaine étape"],
  fix_studio: ["corrige le studio", "répare le studio", "studio cassé"],
  system_health: ["santé du système", "état du système", "health", "diagnostic", "validate"],
  system_check: ["vérifie le système", "statut système", "readiness"],
  repo_audit: ["audit repo", "audit du code", "analyse le repo", "/runtime audit"],
  provider_status: ["état des providers", "statut provider", "providers disponibles"],
  self_improve: ["améliore-toi", "self-improve", "optimise", "analyse tes performances"],
  unknown: [],
};

const INTENT_DOMAINS: Partial<Record<Intent, string>> = {
  chat: "conversation",
  general_chat: "conversation",
  create_task: "workspace",
  task_create: "workspace",
  create_project: "workspace",
  project_plan: "workspace",
  generate_image: "studio",
  generate_video: "studio",
  generate_music: "studio",
  studio_create: "studio",
  search_memory: "memory",
  memory_query: "memory",
  make_decision: "decision",
  decision_red_team: "decision",
  continue_project: "dev",
  fix_studio: "dev",
  system_health: "system",
  system_check: "system",
  repo_audit: "dev",
  provider_status: "system",
  self_improve: "system",
  unknown: "unknown",
};

const INTENT_RISK: Partial<Record<Intent, RiskLevel>> = {
  generate_image: "low",
  generate_video: "low",
  generate_music: "low",
  studio_create: "low",
  create_task: "low",
  create_project: "low",
  task_create: "low",
  project_plan: "low",
  search_memory: "none",
  memory_query: "none",
  make_decision: "low",
  decision_red_team: "low",
  chat: "none",
  general_chat: "none",
  system_health: "none",
  system_check: "none",
  provider_status: "none",
  repo_audit: "low",
  continue_project: "medium",
  fix_studio: "medium",
  self_improve: "medium",
  unknown: "low",
};

const INTENT_PERMISSION: Partial<Record<Intent, PermissionMode>> = {
  repo_audit: "read_only",
  continue_project: "propose_patch",
  fix_studio: "propose_patch",
  self_improve: "read_only",
  generate_image: "read_only",
  generate_video: "read_only",
  generate_music: "read_only",
  studio_create: "read_only",
};

const INTENT_RECOMMENDED_CAP: Partial<Record<Intent, string>> = {
  generate_image: "image.generate",
  generate_video: "video.generate",
  generate_music: "audio.music.generate",
  studio_create: "studio.generate",
  make_decision: "studio.analyze",
  decision_red_team: "studio.analyze",
  search_memory: "memory.query",
  memory_query: "memory.query",
  system_health: "observe.health",
  system_check: "observe.health",
  repo_audit: "repo.audit",
};

const INTENT_PROVIDERS: Partial<Record<Intent, string[]>> = {
  generate_image: ["pollinations", "huggingface_image"],
  generate_video: ["ffmpeg", "remotion"],
  generate_music: ["musicgen", "riffusion"],
  studio_create: ["groq", "gemini"],
  make_decision: ["groq", "gemini"],
  decision_red_team: ["groq", "gemini"],
  chat: ["groq", "gemini"],
  general_chat: ["groq", "gemini"],
  search_memory: [],
  memory_query: [],
  system_health: [],
  system_check: [],
  repo_audit: ["github"],
  provider_status: [],
};

const INTENT_EXECUTION_MODE: Partial<Record<Intent, IntentResult["executionMode"]>> = {
  continue_project: "council",
  fix_studio: "council",
  self_improve: "plan_first",
  make_decision: "council",
  decision_red_team: "council",
  generate_image: "direct",
  generate_video: "direct",
  generate_music: "direct",
  studio_create: "plan_first",
  chat: "direct",
  general_chat: "direct",
  create_task: "direct",
  create_project: "direct",
  task_create: "direct",
  project_plan: "plan_first",
  search_memory: "direct",
  memory_query: "direct",
  system_health: "direct",
  system_check: "direct",
  repo_audit: "direct",
  provider_status: "direct",
};

const INTENT_MISSING_PREREQS: Partial<Record<Intent, string[]>> = {
  generate_video: ["Remotion non connecté — plan disponible, rendu video non disponible sur Railway"],
  generate_music: ["MusicGen nécessite GPU local — non disponible sur Railway"],
  repo_audit: ["Nécessite TAMS_DEV_RUNTIME_ENABLED=true"],
  continue_project: ["Nécessite TAMS_DEV_RUNTIME_ENABLED=true"],
  fix_studio: ["Nécessite TAMS_DEV_RUNTIME_ENABLED=true"],
};

const INTENT_SUGGESTED_MODE: Partial<Record<Intent, string>> = {
  chat: "chat",
  general_chat: "chat",
  make_decision: "decision",
  decision_red_team: "red_team",
  continue_project: "execution",
  fix_studio: "execution",
  repo_audit: "execution",
  self_improve: "chief_of_staff",
  system_health: "chief_of_staff",
  system_check: "chief_of_staff",
  provider_status: "chief_of_staff",
  create_task: "execution",
  create_project: "execution",
  task_create: "execution",
  project_plan: "execution",
  generate_image: "chat",
  generate_video: "chat",
  generate_music: "chat",
  studio_create: "chat",
  search_memory: "chat",
  memory_query: "chat",
};

function classifyByKeywords(raw: string): IntentResult {
  const q = raw.toLowerCase();
  let bestIntent: Intent = "chat";
  let bestScore = 0;

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (intent === "unknown") continue;
    const matches = keywords.filter(kw => q.includes(kw));
    if (matches.length > bestScore) {
      bestScore = matches.length;
      bestIntent = intent as Intent;
    }
  }

  const complexIntents: Intent[] = ["continue_project", "fix_studio", "self_improve", "decision_red_team", "make_decision"];
  const kind = complexIntents.includes(bestIntent) ? "complex" : "simple";
  const domain = INTENT_DOMAINS[bestIntent] ?? "unknown";
  const riskLevel = INTENT_RISK[bestIntent] ?? "low";
  const requiredPermission = INTENT_PERMISSION[bestIntent] ?? "read_only";
  const recommendedCapability = INTENT_RECOMMENDED_CAP[bestIntent];
  const providerCandidates = INTENT_PROVIDERS[bestIntent] ?? ["groq", "gemini"];
  const executionMode = INTENT_EXECUTION_MODE[bestIntent] ?? "direct";
  const missingPrerequisites = INTENT_MISSING_PREREQS[bestIntent] ?? [];

  const EXPLANATIONS: Partial<Record<Intent, string>> = {
    generate_image: "Je vais générer une image via Pollinations (gratuit, sans clé).",
    generate_video: "Je peux créer un plan vidéo. Le rendu final nécessite FFmpeg local.",
    generate_music: "Je peux créer un plan musical. MusicGen nécessite un GPU local.",
    studio_create: "Je vais créer un plan créatif complet avec StudioOrchestrator.",
    make_decision: "Je vais analyser cette décision via le Council (multi-agents).",
    decision_red_team: "Je vais challenger cette décision en Red Team pour trouver les failles.",
    create_task: "Je vais créer cette tâche dans ton espace de travail.",
    create_project: "Je vais créer ce projet dans ton espace de travail.",
    search_memory: "Je vais rechercher dans ta mémoire TAMS.",
    memory_query: "Je vais interroger ta mémoire TAMS.",
    system_health: "Je vais vérifier l'état du système TAMS.",
    system_check: "Je vais vérifier la disponibilité de tous les composants.",
    repo_audit: "Je vais auditer le repo (lecture seule, Dev Runtime requis).",
    continue_project: "Je vais analyser l'état du projet et proposer les prochaines étapes.",
    fix_studio: "Je vais diagnostiquer et proposer des corrections pour le Studio.",
    provider_status: "Je vais lister l'état de tous les providers de capacité.",
    self_improve: "Je vais analyser mes performances et proposer des améliorations.",
    chat: "Je vais répondre à ta question.",
    general_chat: "Je vais répondre à ta question.",
    unknown: "Je vais faire de mon mieux pour répondre.",
  };

  return {
    intent: bestIntent,
    domain,
    confidence: bestScore > 0 ? Math.min(bestScore / 2, 1) : 0.3,
    riskLevel,
    requiredPermission,
    missionKind: kind,
    extractedParams: {},
    reasoning: bestScore > 0
      ? `Classifié par mots-clés (${bestScore} match(s))`
      : "Fallback: conversation par défaut",
    recommendedCapability,
    providerCandidates,
    executionMode,
    userFacingExplanation: EXPLANATIONS[bestIntent] ?? "Je vais traiter ta demande.",
    missingPrerequisites,
  };
}

export async function classifyIntent(raw: string): Promise<IntentResult> {
  // Try AI classification first
  try {
    const c = await aiChat({
      messages: [
        {
          role: "system",
          content: `Tu es l'Intent Engine de TAMS AI OS. Classifie la requête utilisateur en JSON strict.

Intents disponibles:
chat, general_chat, create_task, task_create, create_project, project_plan,
generate_image, generate_video, generate_music, studio_create,
search_memory, memory_query, make_decision, decision_red_team,
continue_project, fix_studio, system_health, system_check,
repo_audit, provider_status, self_improve, unknown

Domaines: conversation, studio, workspace, memory, decision, system, dev, unknown
Risk levels: none, low, medium, high, critical
Permission modes: read_only, propose_patch, apply_safe_patch, commit_candidate, deploy_check
Execution modes: direct, plan_first, council, human_gate

Réponds UNIQUEMENT en JSON:
{
  "intent": "...",
  "domain": "...",
  "confidence": 0.0-1.0,
  "riskLevel": "none|low|medium|high|critical",
  "requiredPermission": "read_only|propose_patch|apply_safe_patch|commit_candidate|deploy_check",
  "missionKind": "simple|complex",
  "recommendedCapability": "...",
  "providerCandidates": [],
  "executionMode": "direct|plan_first|council|human_gate",
  "userFacingExplanation": "...",
  "missingPrerequisites": [],
  "reasoning": "..."
}`,
        },
        { role: "user", content: raw },
      ],
      response_format: { type: "json_object" },
      max_tokens: 400,
    }, "fast");

    const parsed = JSON.parse(c?.choices?.[0]?.message?.content ?? "{}");
    if (parsed.intent && parsed.confidence > 0.6) {
      return {
        intent: parsed.intent as Intent,
        domain: parsed.domain ?? INTENT_DOMAINS[parsed.intent as Intent] ?? "unknown",
        confidence: parsed.confidence,
        riskLevel: parsed.riskLevel ?? "low",
        requiredPermission: parsed.requiredPermission ?? "read_only",
        missionKind: parsed.missionKind ?? "simple",
        extractedParams: parsed.extractedParams ?? {},
        reasoning: parsed.reasoning ?? "Classifié par IA",
        recommendedCapability: parsed.recommendedCapability,
        providerCandidates: parsed.providerCandidates ?? [],
        executionMode: parsed.executionMode ?? "direct",
        userFacingExplanation: parsed.userFacingExplanation ?? "Je vais traiter ta demande.",
        missingPrerequisites: parsed.missingPrerequisites ?? [],
      };
    }
  } catch {
    // AI unavailable — fall through to keyword classifier
  }

  return classifyByKeywords(raw);
}
