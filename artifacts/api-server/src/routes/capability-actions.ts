import { Router } from "express";
import { z } from "zod";
import { aiChat, aiConfigured, aiProviders } from "../lib/ai.js";
import { StudioOrchestrator } from "../lib/studio/studio-orchestrator.js";
import { orchestrate } from "../lib/agents.js";

const router = Router();
const studio = new StudioOrchestrator();

const ExecuteBody = z.object({
  capabilityId: z.string().min(1),
  input: z.string().default(""),
  options: z.record(z.unknown()).optional().default({}),
});

type ActionMode = "real" | "plan_only" | "planned" | "read_only" | "disabled";
type ActionStatus = "success" | "error" | "planned" | "disabled" | "missing_config" | "read_only" | "plan_only";

type ActionResponse = {
  capabilityId: string;
  status: ActionStatus;
  mode: ActionMode;
  title: string;
  result: string;
  artifact: { type: "text" | "image" | "json" | "file" | "none"; url?: string; content?: string };
  limitations: string[];
  nextActions: string[];
  providerUsed?: string;
  debug: { safe: true; noSecrets: true };
};

function response(
  capabilityId: string,
  status: ActionStatus,
  mode: ActionMode,
  title: string,
  result: string,
  extra: Partial<Omit<ActionResponse, "capabilityId" | "status" | "mode" | "title" | "result" | "debug">> = {},
): ActionResponse {
  return {
    capabilityId,
    status,
    mode,
    title,
    result,
    artifact: extra.artifact ?? { type: "none" },
    limitations: extra.limitations ?? [],
    nextActions: extra.nextActions ?? [],
    providerUsed: extra.providerUsed,
    debug: { safe: true, noSecrets: true },
  };
}

async function llmAction(capabilityId: string, input: string, instruction: string): Promise<ActionResponse> {
  if (!aiConfigured()) {
    return response(capabilityId, "missing_config", "disabled", "Provider IA manquant", "Aucun provider LLM n'est configuré.", {
      limitations: ["Configurez GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY/OPENROUTE_API_KEY ou HF_TOKEN côté serveur."],
      nextActions: ["Vérifier /api/system/readiness"],
    });
  }
  try {
    const completion = await aiChat({
      messages: [
        { role: "system", content: `${instruction}\nRéponds en français. N'invente aucun fichier, lien ou action externe.` },
        { role: "user", content: input },
      ],
      max_tokens: 1000,
    }, capabilityId === "text.analyze" ? "reasoning" : "chat");
    const result = completion?.choices?.[0]?.message?.content?.trim();
    if (!result) throw new Error("Réponse provider vide");
    return response(capabilityId, "success", "real", "Résultat IA", result, {
      artifact: { type: "text", content: result },
      providerUsed: aiProviders()[0] ?? "configured_llm",
    });
  } catch (error) {
    return response(capabilityId, "error", "real", "Échec du provider IA", error instanceof Error ? error.message : "Erreur IA", {
      limitations: ["Le provider configuré n'a pas répondu. Aucun résultat n'a été inventé."],
      nextActions: ["Réessayer", "Vérifier la readiness providers"],
    });
  }
}

function studioPlan(input: string, options: Record<string, unknown>) {
  const targetPlatform = typeof options.targetLanguage === "string"
    ? "generic"
    : typeof options.platform === "string" ? options.platform : /tiktok/i.test(input) ? "tiktok" : "generic";
  return studio.orchestrate({
    objective: input || "Préparer un plan créatif",
    targetPlatform,
    format: typeof options.format === "string" ? options.format : /vid[ée]o|tiktok/i.test(input) ? "short_video" : "generic",
    tone: typeof options.tone === "string" ? options.tone : "natural",
  });
}

async function execute(capabilityId: string, input: string, options: Record<string, unknown>): Promise<ActionResponse> {
  switch (capabilityId) {
    case "text.generate":
      return llmAction(capabilityId, input, "Génère un texte utile, clair et actionnable.");
    case "text.analyze":
      return llmAction(capabilityId, input, "Analyse ce texte avec résumé, points clés, risques et recommandations.");
    case "text.translate":
      return llmAction(capabilityId, input, `Traduis fidèlement vers ${String(options.targetLanguage ?? "anglais")}.`);

    case "studio.analyze":
    case "studio.generate":
    case "studio.brief.generate":
    case "studio.script.generate":
    case "studio.storyboard.generate":
    case "studio.prompt.generate":
    case "studio.caption.generate":
    case "studio.document.generate":
    case "studio.export.social": {
      const plan = studioPlan(input, options);
      const resultMap: Record<string, unknown> = {
        "studio.analyze": { creativeBrief: plan.creativeBrief, requiredCapabilities: plan.requiredCapabilities, limitations: plan.honestLimitations },
        "studio.generate": plan,
        "studio.brief.generate": plan.creativeBrief,
        "studio.script.generate": plan.scriptPlan,
        "studio.storyboard.generate": plan.storyboardPlan,
        "studio.prompt.generate": [plan.creativeBrief, plan.scriptPlan, plan.storyboardPlan, "Utiliser dans Kling / Runway / Veo ou un générateur d'image selon le besoin."].join("\n\n"),
        "studio.caption.generate": "Hook court · bénéfice concret · CTA clair · hashtags spécifiques à la plateforme. À adapter aux claims produit validés.",
        "studio.document.generate": [plan.creativeBrief, plan.scriptPlan, "Recommandations", ...plan.validationChecklist].join("\n\n"),
        "studio.export.social": plan.exportTargets,
      };
      const value = resultMap[capabilityId];
      const result = typeof value === "string" ? value : JSON.stringify(value, null, 2);
      return response(capabilityId, "success", "real", "Plan Studio", result, {
        artifact: { type: typeof value === "string" ? "text" : "json", content: result },
        limitations: plan.honestLimitations,
        nextActions: ["Ouvrir Studio", "Valider le plan avant production"],
        providerUsed: "studio_orchestrator",
      });
    }

    case "studio.video.edit.plan":
    case "studio.music.plan": {
      const plan = studioPlan(input, options);
      const result = capabilityId === "studio.video.edit.plan"
        ? plan.productionSteps.map(step => `${step.order}. ${step.name} — ${step.notes}`).join("\n")
        : "Direction musicale : ambiance, tempo, instrumentation, montée, point culminant et résolution. Valider les droits avant usage.";
      return response(capabilityId, "plan_only", "plan_only", "Plan uniquement", result, {
        artifact: { type: "text", content: result },
        limitations: ["Aucun fichier média n'est produit par cette action."],
        nextActions: ["Valider le plan", "Utiliser un outil de production connecté"],
        providerUsed: "studio_orchestrator",
      });
    }

    case "image.generate": {
      if (!input.trim()) return response(capabilityId, "error", "real", "Prompt requis", "Décrivez l'image à générer.");
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(input.trim())}?width=1024&height=1024&nologo=true`;
      return response(capabilityId, "success", "real", "Image Pollinations", "Une URL d'image réelle a été construite. L'image doit se charger pour confirmer le résultat.", {
        artifact: { type: "image", url },
        limitations: ["Service public externe : disponibilité et temps de réponse variables."],
        nextActions: ["Afficher l'image", "Réessayer avec un prompt plus précis"],
        providerUsed: "pollinations",
      });
    }

    case "image.analyze":
      return response(capabilityId, "planned", "planned", "Analyse d'image non connectée", "Upload et analyse multimodale ne sont pas encore branchés.");
    case "video.generate":
      return response(capabilityId, "planned", "planned", "Génération vidéo non connectée", "TAMS peut préparer un plan Studio, mais aucun fichier vidéo réel n'est généré.", {
        limitations: ["Aucun générateur vidéo réel connecté."],
        nextActions: ["Tester Studio Generate", "Copier le prompt dans Kling, Runway ou Veo"],
      });
    case "video.edit":
      return response(capabilityId, "plan_only", "plan_only", "Montage vidéo en mode plan", "FFmpeg est détectable côté serveur, mais aucun upload/storage sûr n'est connecté à ce bus.", {
        limitations: ["Aucun fichier vidéo final n'est produit."],
        nextActions: ["Tester Video Edit Plan"],
        providerUsed: "ffmpeg",
      });
    case "audio.music.generate":
    case "voice.transcribe":
    case "audio.synthesize":
      return response(capabilityId, "planned", "planned", "Worker média requis", "Cette capacité nécessite un worker local/GPU non connecté en production.", {
        limitations: ["Aucun artefact audio n'est produit."],
      });

    case "memory.query":
      return response(capabilityId, "plan_only", "read_only", "Mémoire en lecture seule", "La recherche mémoire authentifiée n'est pas exposée par ce bus public.", {
        limitations: ["Utilisez la page Système/Mémoire avec votre session authentifiée."],
        nextActions: ["Ouvrir Système"],
      });

    case "observe.health": {
      const providers = aiProviders();
      const result = JSON.stringify({
        api: "online",
        environment: process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV || "unknown",
        commit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "unknown",
        runtime: process.env.TAMS_DEV_RUNTIME_ENABLED === "true" ? "enabled" : "disabled",
        providersConfigured: providers,
      }, null, 2);
      return response(capabilityId, "success", "real", "Santé TAMS", result, {
        artifact: { type: "json", content: result },
        limitations: ["Pour le détail DB/FFmpeg, consulter /api/system/readiness."],
        nextActions: ["Ouvrir Système"],
        providerUsed: "internal",
      });
    }

    case "deploy.check": {
      const result = JSON.stringify({
        railwayDetected: !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME),
        commit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "unknown",
        runtime: process.env.TAMS_DEV_RUNTIME_ENABLED === "true" ? "enabled" : "disabled",
      }, null, 2);
      return response(capabilityId, "read_only", "read_only", "Vérification déploiement", result, {
        artifact: { type: "json", content: result },
        limitations: ["Lecture seule : cette action ne déclenche jamais de déploiement."],
        providerUsed: "railway_env",
      });
    }

    case "repo.audit":
      return response(capabilityId, "read_only", "read_only", "Audit repo en mode plan", "Scan → structure → risques → priorités → patch proposé → tests → PR.", {
        limitations: ["Ce bus public ne scanne ni ne modifie le dépôt sans runtime authentifié."],
        nextActions: ["Utiliser Chat Runtime authentifié pour un audit read-only"],
      });
    case "repo.validate":
      return response(capabilityId, "plan_only", "read_only", "Validation repo en mode plan", "Typecheck → build API → build frontend → tests → smoke → revue des erreurs.", {
        limitations: ["Aucune commande n'est exécutée depuis ce bus public."],
      });
    case "repo.patch":
      return response(capabilityId, "disabled", "disabled", "Patch Engine désactivé", "Patch Engine non connecté en production. Étape prévue : preview diff → validation humaine → branche → PR.", {
        limitations: ["Aucune modification ni push n'est effectué."],
      });

    case "agents.orchestrate":
    case "mission.plan": {
      const plan = await orchestrate(input || "Préparer un plan de mission");
      const result = JSON.stringify(plan, null, 2);
      return response(capabilityId, "success", "real", "Plan multi-agent", result, {
        artifact: { type: "json", content: result },
        limitations: ["Mode plan : aucune équipe autonome n'est lancée en arrière-plan."],
        nextActions: ["Ouvrir Agents", "Transformer le plan en tâches validées"],
        providerUsed: "agents_orchestrator",
      });
    }

    default:
      return response(capabilityId, "planned", "planned", "Capacité non branchée", "Aucun handler réel n'est disponible pour cette capacité.");
  }
}

router.post("/capabilities/execute", async (req, res) => {
  const parsed = ExecuteBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
  try {
    return res.json(await execute(parsed.data.capabilityId, parsed.data.input, parsed.data.options));
  } catch (error) {
    return res.status(500).json(response(
      parsed.data.capabilityId,
      "error",
      "disabled",
      "Erreur d'exécution",
      error instanceof Error ? error.message : "Erreur inconnue",
      { limitations: ["Aucun résultat n'a été inventé."] },
    ));
  }
});

export default router;
