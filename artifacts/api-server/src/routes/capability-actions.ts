import { Router } from "express";
import { aiChat, aiConfigured, aiProviders } from "../lib/ai";
import { orchestrate } from "../lib/agents";
import { StudioOrchestrator } from "../lib/studio/studio-orchestrator";

const router = Router();
const studioOrchestrator = new StudioOrchestrator();

type CapabilityMode = "real" | "plan_only" | "planned" | "read_only" | "disabled";
type CapabilityStatus = "success" | "error" | "planned" | "disabled" | "missing_config" | "read_only" | "plan_only";
type SafeStudioFormat = "short_video" | "document";

type CapabilityResponse = {
  capabilityId: string;
  status: CapabilityStatus;
  mode: CapabilityMode;
  title: string;
  result: string;
  artifact: {
    type: "text" | "image" | "json" | "file" | "none";
    url?: string;
    content?: string;
    data?: unknown;
  };
  limitations: string[];
  nextActions: string[];
  providerUsed: string;
  debug: {
    safe: true;
    noSecrets: true;
  };
};

function response(payload: Omit<CapabilityResponse, "debug" | "artifact"> & { artifact?: CapabilityResponse["artifact"] }): CapabilityResponse {
  return {
    ...payload,
    artifact: payload.artifact ?? { type: "none" },
    debug: { safe: true, noSecrets: true },
  };
}

function cleanInput(input: unknown): string {
  return typeof input === "string" && input.trim().length > 0 ? input.trim() : "Produit activewear féminin premium, TikTok naturel, style UGC crédible";
}

function firstProvider(): string {
  return aiProviders()[0] ?? "none";
}

function aiTextFromCompletion(data: unknown): string | null {
  const content = (data as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
  return typeof content === "string" && content.trim().length > 0 ? content.trim() : null;
}

async function runAiInstruction(system: string, input: string): Promise<{ text: string; provider: string } | null> {
  if (!aiConfigured()) return null;
  const provider = firstProvider();
  const completion = await aiChat({
    messages: [
      { role: "system", content: system },
      { role: "user", content: input },
    ],
    temperature: 0.4,
  }, "chat");
  const text = aiTextFromCompletion(completion);
  return text ? { text, provider } : null;
}

function studioPlan(input: string, format: SafeStudioFormat = "short_video") {
  return studioOrchestrator.orchestrate({
    objective: input,
    targetPlatform: input.toLowerCase().includes("instagram") ? "instagram" : "tiktok",
    format,
    tone: "natural",
    product: "activewear / projet utilisateur",
  });
}

function formatStudioPlan(input: string): string {
  const plan = studioPlan(input);
  return [
    "CREATIVE BRIEF",
    plan.creativeBrief,
    "",
    "SCRIPT",
    plan.scriptPlan,
    "",
    "STORYBOARD",
    plan.storyboardPlan,
    "",
    "PRODUCTION STEPS",
    plan.productionSteps.map(step => `${step.order}. ${step.name} — ${step.capability} — ${step.provider} (${step.providerStatus})`).join("\n"),
    "",
    "EXPORTS",
    plan.exportTargets.join("\n"),
    "",
    "LIMITATIONS",
    plan.honestLimitations.length > 0 ? plan.honestLimitations.join("\n") : "Aucune limitation bloquante pour la planification texte.",
  ].join("\n");
}

function promptForExternalVideo(input: string): string {
  return [
    "PROMPT KLING / RUNWAY / VEO",
    `Créer une vidéo verticale 9:16 TikTok, style UGC naturel, pour : ${input}.`,
    "Scène 1 : hook visuel en 0-3 secondes, mouvement naturel, lumière réelle.",
    "Scène 2 : démonstration produit en contexte réel, pas de publicité trop parfaite.",
    "Scène 3 : détail matière/confort, cadrage proche, gestes humains.",
    "Scène 4 : résultat/usage quotidien, ton crédible.",
    "Style : smartphone, naturel, crédible, pas d'effet IA visible, pas de texte mensonger.",
    "Limite TAMS : ce prompt prépare la vidéo dans un outil externe ; TAMS ne génère pas encore le fichier vidéo final.",
  ].join("\n");
}

function planned(capabilityId: string, title: string, reason: string): CapabilityResponse {
  return response({
    capabilityId,
    status: "planned",
    mode: "planned",
    title,
    result: reason,
    limitations: [reason],
    nextActions: ["Brancher un worker réel avant d’activer cette capacité."],
    providerUsed: "none",
  });
}

router.post("/capabilities/execute", async (req, res) => {
  const capabilityId = typeof req.body?.capabilityId === "string" ? req.body.capabilityId : "";
  const input = cleanInput(req.body?.input);
  const targetLanguage = typeof req.body?.options?.targetLanguage === "string" ? req.body.options.targetLanguage : "français";

  try {
    switch (capabilityId) {
      case "text.generate": {
        const ai = await runAiInstruction("Tu génères du texte utile, concret, sans promesse fausse. Réponds en français.", input);
        if (!ai) {
          return res.json(response({
            capabilityId,
            status: "missing_config",
            mode: "disabled",
            title: "Génération texte non configurée",
            result: "Aucun provider IA n’est configuré. Ajoute GROQ_API_KEY, GEMINI_API_KEY, HF_TOKEN ou OPENROUTER_API_KEY côté serveur.",
            limitations: ["Pas de clé IA disponible côté backend."],
            nextActions: ["Configurer au moins un provider IA dans Railway."],
            providerUsed: "none",
          }));
        }
        return res.json(response({ capabilityId, status: "success", mode: "real", title: "Texte généré", result: ai.text, artifact: { type: "text", content: ai.text }, limitations: [], nextActions: ["Copier le texte", "L’envoyer dans Studio pour le transformer en script"], providerUsed: ai.provider }));
      }

      case "text.analyze": {
        const ai = await runAiInstruction("Analyse ce texte en français avec : résumé, points clés, risques, actions recommandées.", input);
        if (!ai) return res.json(response({ capabilityId, status: "missing_config", mode: "disabled", title: "Analyse non configurée", result: "Aucun provider IA configuré.", limitations: ["Provider IA manquant."], nextActions: ["Configurer Groq/Gemini/OpenRouter/HF."], providerUsed: "none" }));
        return res.json(response({ capabilityId, status: "success", mode: "real", title: "Analyse texte", result: ai.text, artifact: { type: "text", content: ai.text }, limitations: [], nextActions: ["Transformer les actions recommandées en tâches"], providerUsed: ai.provider }));
      }

      case "text.translate": {
        const ai = await runAiInstruction(`Traduis le texte en ${targetLanguage}. Garde le sens, le ton et la clarté.`, input);
        if (!ai) return res.json(response({ capabilityId, status: "missing_config", mode: "disabled", title: "Traduction non configurée", result: "Aucun provider IA configuré.", limitations: ["Provider IA manquant."], nextActions: ["Configurer Groq/Gemini/OpenRouter/HF."], providerUsed: "none" }));
        return res.json(response({ capabilityId, status: "success", mode: "real", title: `Traduction en ${targetLanguage}`, result: ai.text, artifact: { type: "text", content: ai.text }, limitations: [], nextActions: ["Relire avant publication"], providerUsed: ai.provider }));
      }

      case "studio.generate":
      case "studio.brief.generate":
      case "studio.script.generate":
      case "studio.storyboard.generate":
      case "studio.prompt.generate":
      case "studio.caption.generate":
      case "studio.document.generate":
      case "studio.export.social":
      case "studio.analyze": {
        const plan = studioPlan(input, capabilityId === "studio.document.generate" ? "document" : "short_video");
        const map: Record<string, string> = {
          "studio.brief.generate": plan.creativeBrief,
          "studio.script.generate": plan.scriptPlan,
          "studio.storyboard.generate": plan.storyboardPlan,
          "studio.prompt.generate": promptForExternalVideo(input),
          "studio.caption.generate": ["CAPTIONS", "1. Tu porterais ça pour sport ou quotidien ? #activewear #sportstyle", "2. Le confort qui suit vraiment la journée. #leggings #fitness", "3. Look simple, mouvement libre, vraie vie."].join("\n"),
          "studio.document.generate": ["DOCUMENT", plan.creativeBrief, "", plan.scriptPlan, "", "Actions", plan.validationChecklist.join("\n")].join("\n"),
          "studio.export.social": ["SOCIAL EXPORT PLAN", ...plan.exportTargets, "", "Checklist", ...plan.validationChecklist].join("\n"),
          "studio.analyze": ["ANALYSE STUDIO", plan.creativeBrief, "", "Risques", ...plan.validationChecklist].join("\n"),
        };
        const result = map[capabilityId] ?? formatStudioPlan(input);
        return res.json(response({ capabilityId, status: "success", mode: "real", title: "Résultat Studio", result, artifact: { type: "json", content: result, data: plan }, limitations: plan.honestLimitations, nextActions: ["Ouvrir Studio", "Valider le script", "Utiliser le prompt externe si vidéo réelle nécessaire"], providerUsed: "studio-orchestrator" }));
      }

      case "studio.video.edit.plan":
      case "video.edit": {
        const result = [
          "PLAN DE MONTAGE VIDÉO — MODE PLAN ONLY",
          formatStudioPlan(input),
          "",
          "IMPORTANT : aucun fichier vidéo n’est généré ici. FFmpeg est détectable côté serveur, mais le pipeline upload → montage → stockage → téléchargement n’est pas encore prouvé.",
        ].join("\n");
        return res.json(response({ capabilityId, status: "plan_only", mode: "plan_only", title: "Plan de montage vidéo", result, artifact: { type: "text", content: result }, limitations: ["Pas de fichier vidéo final produit par cette action."], nextActions: ["Brancher upload/storage avant d’activer le montage réel", "Utiliser ce plan dans CapCut/Premiere/FFmpeg manuel"], providerUsed: "studio-orchestrator" }));
      }

      case "image.generate": {
        const prompt = encodeURIComponent(input);
        const url = `https://image.pollinations.ai/prompt/${prompt}?width=1024&height=1024&nologo=true&safe=true`;
        return res.json(response({ capabilityId, status: "success", mode: "real", title: "Image générée via URL Pollinations", result: "Image générée avec Pollinations. Si l’image ne s’affiche pas, le provider externe est temporairement indisponible.", artifact: { type: "image", url }, limitations: ["Provider externe gratuit : disponibilité et qualité variables.", "Aucune image sensible ou trompeuse ne doit être utilisée sans revue humaine."], nextActions: ["Afficher l’image", "Télécharger depuis l’URL si le rendu est correct", "Relancer avec un prompt plus précis si nécessaire"], providerUsed: "pollinations" }));
      }

      case "image.analyze":
        return res.json(planned(capabilityId, "Analyse image non branchée", "Aucun workflow upload/image URL → analyse vision fiable n’est branché en production."));

      case "video.generate":
        return res.json(planned(capabilityId, "Génération vidéo non branchée", "La génération vidéo réelle reste planned. TAMS peut préparer script, storyboard et prompt externe, mais ne doit pas promettre un fichier vidéo."));

      case "studio.music.plan":
        return res.json(response({ capabilityId, status: "plan_only", mode: "plan_only", title: "Direction musicale", result: [`Direction musicale pour : ${input}`, "Mood : énergique, moderne, crédible.", "Instruments : beat léger, basse douce, texture premium.", "Usage : TikTok/Reels, volume bas sous voix-off.", "Limite : MusicGen local GPU non branché sur Railway."].join("\n"), artifact: { type: "text" }, limitations: ["Plan uniquement, aucun fichier audio généré."], nextActions: ["Choisir une musique libre de droits", "Brancher MusicGen local si génération réelle nécessaire"], providerUsed: "deterministic-planner" }));

      case "audio.music.generate":
      case "voice.transcribe":
      case "audio.synthesize":
      case "automation.workflow":
      case "search.web":
        return res.json(planned(capabilityId, "Capacité non disponible", "Cette capacité nécessite un worker/provider qui n’est pas branché en production."));

      case "memory.query":
        return res.json(response({ capabilityId, status: "plan_only", mode: "plan_only", title: "Mémoire — mode plan", result: "La carte Mémoire est actionnable mais la recherche mémoire réelle n’est pas prouvée depuis ce bus. Le prochain branchement doit appeler le système de mémoire/pgvector avec une requête utilisateur et afficher les sources.", artifact: { type: "text" }, limitations: ["Aucune source mémoire réelle retournée par cette action pour éviter de mentir."], nextActions: ["Brancher le handler mémoire réel", "Afficher sources et horodatages"], providerUsed: "safe-memory-placeholder" }));

      case "observe.health":
      case "deploy.check": {
        const version = {
          app: "TAMS",
          commit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || process.env.SOURCE_VERSION || process.env.GITHUB_SHA || "unknown",
          environment: process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV || "unknown",
          frontendBuild: process.env.FRONTEND_BUILD || "vite-production",
        };
        const result = [
          "SANTÉ SYSTÈME READ-ONLY",
          `App: ${version.app}`,
          `Commit: ${version.commit}`,
          `Environment: ${version.environment}`,
          `Frontend: ${version.frontendBuild}`,
          `AI providers: ${aiProviders().join(", ") || "aucun"}`,
          `Railway detected: ${process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME ? "oui" : "non"}`,
          "Secrets: présence seulement, valeurs jamais exposées.",
        ].join("\n");
        return res.json(response({ capabilityId, status: capabilityId === "deploy.check" ? "read_only" : "success", mode: capabilityId === "deploy.check" ? "read_only" : "real", title: "Diagnostic système", result, artifact: { type: "json", content: result, data: version }, limitations: ["Ne déclenche aucun déploiement.", "Ne remplace pas un test navigateur production."], nextActions: ["Comparer /api/version avec le main GitHub", "Tester Chat, Studio et Agents en production"], providerUsed: "internal" }));
      }

      case "repo.audit":
      case "repo.validate":
        return res.json(response({ capabilityId, status: "read_only", mode: "read_only", title: "Dev Agent read-only", result: "SCAN → RISQUES → PLAN → PATCH PROPOSÉ → TESTS → PR. Mode read-only : cette action prépare l’audit et la validation, mais ne modifie pas le dépôt. Pour devenir proche de Claude Code, il faut brancher Repo Intelligence complet, Validation Engine, Patch Preview, branche sécurisée et PR.", artifact: { type: "text" }, limitations: ["Pas de modification de repo depuis cette action.", "Pas de push direct main.", "Validation réelle dépend d’un runtime de build sécurisé."], nextActions: ["Brancher scan repo réel", "Brancher preview diff", "Exiger validation humaine avant patch"], providerUsed: "dev-agent-read-only" }));

      case "repo.patch":
        return res.json(response({ capabilityId, status: "disabled", mode: "disabled", title: "Patch Engine désactivé", result: "Patch Engine non connecté en production. Étape sûre prévue : preview diff → validation humaine → branche → tests → PR. Aucun patch réel n’est appliqué par cette action.", artifact: { type: "none" }, limitations: ["Action dangereuse désactivée."], nextActions: ["Implémenter Permission Layer", "Interdire main direct", "Créer PR uniquement après tests"], providerUsed: "none" }));

      case "agents.orchestrate":
      case "mission.plan": {
        const agentResult = await orchestrate(input);
        return res.json(response({ capabilityId, status: "success", mode: "real", title: "Plan multi-agent", result: JSON.stringify(agentResult, null, 2), artifact: { type: "json", data: agentResult, content: JSON.stringify(agentResult, null, 2) }, limitations: ["Mode plan : ne prétend pas exécuter des actions externes sans connecteur."], nextActions: ["Valider le plan", "Envoyer les sous-tâches vers Studio ou Dev Agent"], providerUsed: "agents-orchestrator" }));
      }

      default:
        return res.status(404).json(response({ capabilityId: capabilityId || "unknown", status: "disabled", mode: "disabled", title: "Capacité inconnue", result: "Aucun handler n’est branché pour cette capacité.", artifact: { type: "none" }, limitations: ["Pas de handler backend."], nextActions: ["Ajouter un handler dans Capability Action Bus avant d’afficher un bouton."], providerUsed: "none" }));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return res.status(500).json(response({
      capabilityId: capabilityId || "unknown",
      status: "error",
      mode: "disabled",
      title: "Erreur d’exécution",
      result: message,
      artifact: { type: "none" },
      limitations: ["L’erreur est affichée au lieu d’être masquée."],
      nextActions: ["Vérifier provider/configuration/logs serveur."],
      providerUsed: "unknown",
    }));
  }
});

export default router;
