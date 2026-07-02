import { Router } from "express";
import { aiChat, aiConfigured, aiProviders } from "../lib/ai";
import { orchestrate } from "../lib/agents";
import { StudioOrchestrator } from "../lib/studio/studio-orchestrator";
import { generateSlideshowVideo } from "../lib/video";

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
    "Limite TAMS : ce prompt prépare la vidéo dans un outil externe ; TAMS ne génère pas encore le fichier vidéo final IA.",
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

function missingConfig(capabilityId: string, title: string, vars: string[]): CapabilityResponse {
  return response({
    capabilityId,
    status: "missing_config",
    mode: "disabled",
    title,
    result: `Connecteur présent, mais configuration manquante : ${vars.join(", ")}.`,
    limitations: ["Le handler backend est branché, mais aucun provider opérationnel n’est configuré pour cette capacité."],
    nextActions: vars.map(v => `Ajouter ${v} dans Railway si cette capacité doit fonctionner en production.`),
    providerUsed: "none",
  });
}

function optionString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function pollinationsImageUrl(prompt: string, seed: string): string {
  const encoded = encodeURIComponent(`${prompt}, vertical TikTok 9:16, natural UGC product shot, seed ${seed}`);
  return `https://image.pollinations.ai/prompt/${encoded}?width=720&height=1280&nologo=true&safe=true`;
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs = 30_000): Promise<unknown> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { return { text }; }
}

async function runDuckDuckGoSearch(query: string): Promise<{ text: string; data: unknown }> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const data = await fetchJsonWithTimeout(url, { method: "GET" }, 12_000) as {
    AbstractText?: string;
    AbstractURL?: string;
    Heading?: string;
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
  };
  const related = (data.RelatedTopics ?? []).filter(item => item.Text).slice(0, 5);
  const lines = [
    `RECHERCHE WEB — DuckDuckGo`,
    data.Heading ? `Sujet : ${data.Heading}` : "Sujet : résultat direct non garanti",
    data.AbstractText ? `Résumé : ${data.AbstractText}` : "Résumé : aucun instant answer complet. Utilise les pistes ci-dessous.",
    data.AbstractURL ? `Source principale : ${data.AbstractURL}` : "",
    related.length ? "Pistes" : "",
    ...related.map((item, index) => `${index + 1}. ${item.Text}${item.FirstURL ? ` — ${item.FirstURL}` : ""}`),
  ].filter(Boolean).join("\n");
  return { text: lines, data };
}

async function runTavilySearch(query: string): Promise<{ text: string; data: unknown } | null> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;
  const data = await fetchJsonWithTimeout("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, search_depth: "basic", max_results: 5, include_answer: true }),
  }, 20_000) as { answer?: string; results?: Array<{ title?: string; url?: string; content?: string }> };
  const lines = [
    "RECHERCHE WEB — Tavily",
    data.answer ? `Réponse : ${data.answer}` : "Réponse synthétique indisponible.",
    ...(data.results ?? []).slice(0, 5).map((item, index) => `${index + 1}. ${item.title ?? "Source"} — ${item.url ?? "URL absente"}\n${item.content ?? ""}`),
  ];
  return { text: lines.join("\n"), data };
}

async function callJsonWorker(url: string, payload: unknown, timeoutMs = 120_000): Promise<unknown> {
  return fetchJsonWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, timeoutMs);
}

async function callHuggingFace(model: string, payload: unknown, timeoutMs = 120_000): Promise<{ contentType: string; base64?: string; json?: unknown }> {
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY;
  if (!token) throw new Error("HF_TOKEN absent");
  const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok) throw new Error(`HF ${res.status}: ${buf.toString("utf8").slice(0, 200)}`);
  if (contentType.includes("application/json")) {
    try { return { contentType, json: JSON.parse(buf.toString("utf8")) }; } catch { return { contentType, json: { raw: buf.toString("utf8") } }; }
  }
  return { contentType, base64: buf.toString("base64") };
}

router.post("/capabilities/execute", async (req, res) => {
  const capabilityId = typeof req.body?.capabilityId === "string" ? req.body.capabilityId : "";
  const input = cleanInput(req.body?.input);
  const options = (req.body?.options ?? {}) as Record<string, unknown>;
  const targetLanguage = typeof options.targetLanguage === "string" ? options.targetLanguage : "français";

  try {
    switch (capabilityId) {
      case "text.generate": {
        const ai = await runAiInstruction("Tu génères du texte utile, concret, sans promesse fausse. Réponds en français.", input);
        if (!ai) return res.json(missingConfig(capabilityId, "Génération texte non configurée", ["GROQ_API_KEY", "GEMINI_API_KEY", "HF_TOKEN", "OPENROUTER_API_KEY"]));
        return res.json(response({ capabilityId, status: "success", mode: "real", title: "Texte généré", result: ai.text, artifact: { type: "text", content: ai.text }, limitations: [], nextActions: ["Copier le texte", "L’envoyer dans Studio pour le transformer en script"], providerUsed: ai.provider }));
      }

      case "text.analyze": {
        const ai = await runAiInstruction("Analyse ce texte en français avec : résumé, points clés, risques, actions recommandées.", input);
        if (!ai) return res.json(missingConfig(capabilityId, "Analyse non configurée", ["GROQ_API_KEY", "GEMINI_API_KEY", "HF_TOKEN", "OPENROUTER_API_KEY"]));
        return res.json(response({ capabilityId, status: "success", mode: "real", title: "Analyse texte", result: ai.text, artifact: { type: "text", content: ai.text }, limitations: [], nextActions: ["Transformer les actions recommandées en tâches"], providerUsed: ai.provider }));
      }

      case "text.translate": {
        const ai = await runAiInstruction(`Traduis le texte en ${targetLanguage}. Garde le sens, le ton et la clarté.`, input);
        if (!ai) return res.json(missingConfig(capabilityId, "Traduction non configurée", ["GROQ_API_KEY", "GEMINI_API_KEY", "HF_TOKEN", "OPENROUTER_API_KEY"]));
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
        return res.json(response({ capabilityId, status: "success", mode: "real", title: "Résultat Studio", result, artifact: { type: "json", content: result, data: plan }, limitations: plan.honestLimitations, nextActions: ["Ouvrir Studio", "Valider le script", "Utiliser le prompt externe si vidéo IA nécessaire"], providerUsed: "studio-orchestrator" }));
      }

      case "studio.video.edit.plan":
      case "video.edit": {
        const result = ["PLAN DE MONTAGE VIDÉO", formatStudioPlan(input), "", "FFmpeg est disponible pour encoder un fichier si des images URL sont fournies via video.generate."].join("\n");
        return res.json(response({ capabilityId, status: "plan_only", mode: "plan_only", title: "Plan de montage vidéo", result, artifact: { type: "text", content: result }, limitations: ["Cette action planifie le montage ; video.generate produit le MP4."], nextActions: ["Fournir des images URL à video.generate", "Valider le script avant diffusion"], providerUsed: "studio-orchestrator" }));
      }

      case "image.generate": {
        const prompt = encodeURIComponent(input);
        const url = `https://image.pollinations.ai/prompt/${prompt}?width=1024&height=1024&nologo=true&safe=true`;
        return res.json(response({ capabilityId, status: "success", mode: "real", title: "Image générée via URL Pollinations", result: "Image générée avec Pollinations. Si l’image ne s’affiche pas, le provider externe est temporairement indisponible.", artifact: { type: "image", url }, limitations: ["Provider externe gratuit : disponibilité et qualité variables.", "Aucune image sensible ou trompeuse ne doit être utilisée sans revue humaine."], nextActions: ["Afficher l’image", "Télécharger depuis l’URL si le rendu est correct", "Relancer avec un prompt plus précis si nécessaire"], providerUsed: "pollinations" }));
      }

      case "image.analyze":
        return res.json(planned(capabilityId, "Analyse image non branchée", "Aucun workflow upload/image URL → analyse vision fiable n’est branché en production."));

      case "video.generate": {
        const images = optionStringArray(options.images).slice(0, 6);
        const generatedImages = images.length > 0 ? images : ["hero", "movement", "detail"].map(seed => pollinationsImageUrl(input, seed));
        const text = optionString(options.text) ?? "TAMS — vidéo 9:16";
        const result = await generateSlideshowVideo({ images: generatedImages, text, secondsPerImage: Number(options.secondsPerImage) || 2.5, musicUrl: optionString(options.musicUrl) });
        const output = [
          "VIDÉO GÉNÉRÉE — FFmpeg",
          `URL: ${result.url}`,
          `Durée: ${result.durationSec}s`,
          `Images: ${result.images}`,
          `Texte overlay: ${result.withText ? "oui" : "non"}`,
          `Musique: ${result.withMusic ? "oui" : "non"}`,
          "Limite honnête : génération MP4 réelle par diaporama FFmpeg, pas encore génération IA Remotion/Veo/Kling interne.",
        ].join("\n");
        return res.json(response({ capabilityId, status: "success", mode: "real", title: "Vidéo MP4 générée", result: output, artifact: { type: "file", url: result.url, content: output, data: result }, limitations: ["Vidéo réelle par FFmpeg/slideshow.", "Remotion IA avancé reste un futur worker, pas une promesse actuelle."], nextActions: ["Ouvrir/télécharger le MP4", "Relancer avec des images produit réelles pour un meilleur rendu"], providerUsed: "ffmpeg" }));
      }

      case "studio.music.plan":
        return res.json(response({ capabilityId, status: "plan_only", mode: "plan_only", title: "Direction musicale", result: [`Direction musicale pour : ${input}`, "Mood : énergique, moderne, crédible.", "Instruments : beat léger, basse douce, texture premium.", "Usage : TikTok/Reels, volume bas sous voix-off.", "Limite : pour générer un fichier audio, utilise audio.music.generate avec HF_TOKEN ou MUSICGEN_WORKER_URL."].join("\n"), artifact: { type: "text" }, limitations: ["Plan uniquement dans cette action."], nextActions: ["Utiliser audio.music.generate", "Choisir une musique libre de droits si la génération échoue"], providerUsed: "deterministic-planner" }));

      case "audio.music.generate": {
        const workerUrl = process.env.MUSICGEN_WORKER_URL;
        if (workerUrl) {
          const data = await callJsonWorker(workerUrl, { prompt: input, options }, 180_000);
          const text = JSON.stringify(data, null, 2);
          return res.json(response({ capabilityId, status: "success", mode: "real", title: "Musique générée via worker MusicGen", result: text, artifact: { type: "json", content: text, data }, limitations: ["Qualité/durée dépend du worker local."], nextActions: ["Télécharger l’audio depuis le worker si une URL est retournée"], providerUsed: "musicgen-worker" }));
        }
        if (process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY) {
          const hf = await callHuggingFace("facebook/musicgen-small", { inputs: input, parameters: { duration: Number(options.durationSeconds) || 8 } }, 180_000);
          const content = hf.base64 ? `data:${hf.contentType};base64,${hf.base64}` : JSON.stringify(hf.json, null, 2);
          return res.json(response({ capabilityId, status: "success", mode: "real", title: "Musique générée via Hugging Face MusicGen", result: "Audio généré par Hugging Face MusicGen. Si le modèle est froid, relance la génération.", artifact: { type: "file", url: hf.base64 ? content : undefined, content, data: hf.json }, limitations: ["Hugging Face gratuit peut être lent/rate-limité.", "Railway n’exécute pas MusicGen local GPU."], nextActions: ["Écouter/télécharger le fichier si data URL retournée", "Brancher MUSICGEN_WORKER_URL pour une production stable"], providerUsed: "huggingface-musicgen" }));
        }
        return res.json(missingConfig(capabilityId, "MusicGen non configuré", ["HF_TOKEN", "MUSICGEN_WORKER_URL"]));
      }

      case "voice.transcribe": {
        const audioUrl = optionString(options.audioUrl) ?? optionString(req.body?.audioUrl);
        if (!audioUrl) return res.json(response({ capabilityId, status: "missing_config", mode: "disabled", title: "Audio manquant", result: "Le connecteur transcription est branché, mais il faut fournir options.audioUrl.", artifact: { type: "none" }, limitations: ["Aucun fichier audio fourni."], nextActions: ["Envoyer options.audioUrl", "Brancher WHISPER_WORKER_URL pour un worker local stable"], providerUsed: "none" }));
        const workerUrl = process.env.WHISPER_WORKER_URL || process.env.STT_WORKER_URL;
        if (workerUrl) {
          const data = await callJsonWorker(workerUrl, { audioUrl, language: options.language ?? "fr" }, 180_000);
          const text = JSON.stringify(data, null, 2);
          return res.json(response({ capabilityId, status: "success", mode: "real", title: "Transcription via worker", result: text, artifact: { type: "json", content: text, data }, limitations: [], nextActions: ["Relire la transcription"], providerUsed: "whisper-worker" }));
        }
        return res.json(missingConfig(capabilityId, "Worker transcription non configuré", ["WHISPER_WORKER_URL", "STT_WORKER_URL"]));
      }

      case "audio.synthesize": {
        const text = optionString(options.text) ?? input;
        const workerUrl = process.env.PIPER_WORKER_URL || process.env.TTS_WORKER_URL || process.env.EDGE_TTS_WORKER_URL;
        if (!workerUrl) return res.json(missingConfig(capabilityId, "Worker TTS non configuré", ["PIPER_WORKER_URL", "TTS_WORKER_URL", "EDGE_TTS_WORKER_URL"]));
        const data = await callJsonWorker(workerUrl, { text, voice: options.voice ?? "fr", format: options.format ?? "wav" }, 120_000);
        const output = JSON.stringify(data, null, 2);
        return res.json(response({ capabilityId, status: "success", mode: "real", title: "Voix synthétisée", result: output, artifact: { type: "json", content: output, data }, limitations: ["Qualité dépend du worker TTS branché."], nextActions: ["Télécharger l’audio si une URL est retournée"], providerUsed: "tts-worker" }));
      }

      case "automation.workflow": {
        const webhookUrl = process.env.N8N_WEBHOOK_URL;
        if (!webhookUrl) return res.json(missingConfig(capabilityId, "n8n non configuré", ["N8N_WEBHOOK_URL"]));
        const data = await callJsonWorker(webhookUrl, { input, options, source: "tams-capability-action" }, 60_000);
        const output = JSON.stringify(data, null, 2);
        return res.json(response({ capabilityId, status: "success", mode: "real", title: "Workflow n8n exécuté", result: output, artifact: { type: "json", content: output, data }, limitations: ["Le workflow exécuté dépend du webhook n8n configuré."], nextActions: ["Vérifier le run dans n8n", "Ajouter validation humaine pour actions sensibles"], providerUsed: "n8n-webhook" }));
      }

      case "search.web": {
        const tavily = await runTavilySearch(input).catch(() => null);
        const result = tavily ?? await runDuckDuckGoSearch(input);
        return res.json(response({ capabilityId, status: "success", mode: "real", title: tavily ? "Recherche web Tavily" : "Recherche web DuckDuckGo", result: result.text, artifact: { type: "json", content: result.text, data: result.data }, limitations: [tavily ? "Tavily utilise une clé configurée." : "DuckDuckGo Instant Answer est gratuit mais peut retourner peu de résultats."], nextActions: ["Vérifier les sources importantes", "Relancer avec une requête plus précise si nécessaire"], providerUsed: tavily ? "tavily" : "duckduckgo" }));
      }

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
