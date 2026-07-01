import { Router } from "express";
import { generateMusic, generateSpeech } from "../lib/audio";
import { transcribeAudioUrl } from "../lib/transcription";
import { generateSlideshowVideo } from "../lib/video";

const router = Router();

type ActionStatus = "success" | "error" | "missing_config" | "disabled" | "read_only";
type ActionMode = "real" | "read_only" | "disabled";

function actionResponse(params: {
  capabilityId: string;
  status: ActionStatus;
  mode: ActionMode;
  title: string;
  result: string;
  artifact?: { type: "text" | "image" | "json" | "file" | "none"; url?: string; content?: string; data?: unknown };
  limitations?: string[];
  nextActions?: string[];
  providerUsed: string;
}) {
  return {
    capabilityId: params.capabilityId,
    status: params.status,
    mode: params.mode,
    title: params.title,
    result: params.result,
    artifact: params.artifact ?? { type: "none" },
    limitations: params.limitations ?? [],
    nextActions: params.nextActions ?? [],
    providerUsed: params.providerUsed,
    debug: { safe: true, noSecrets: true },
  };
}

function getInput(req: any): string {
  return typeof req.body?.input === "string" && req.body.input.trim().length > 0
    ? req.body.input.trim()
    : "Projet TAMS";
}

function optionString(req: any, key: string): string | undefined {
  const value = req.body?.options?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function optionBool(req: any, key: string): boolean {
  return req.body?.options?.[key] === true;
}

function optionStringArray(req: any, key: string): string[] {
  const value = req.body?.options?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function imageUrlsFromRequest(req: any, input: string): string[] {
  const explicit = optionStringArray(req, "images").filter(url => /^https?:\/\//.test(url));
  if (explicit.length > 0) return explicit.slice(0, 8);
  const base = encodeURIComponent(input);
  return [
    `https://image.pollinations.ai/prompt/${base}%20scene%201%20vertical%209:16%20natural%20ugc?nologo=true&safe=true&width=720&height=1280`,
    `https://image.pollinations.ai/prompt/${base}%20scene%202%20close%20up%20product%20realistic?nologo=true&safe=true&width=720&height=1280`,
    `https://image.pollinations.ai/prompt/${base}%20scene%203%20lifestyle%20real%20light?nologo=true&safe=true&width=720&height=1280`,
  ];
}

function requireEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

async function postWebhook(url: string, payload: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45_000),
  });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json().catch(() => null) : await response.text().catch(() => "");
  if (!response.ok) throw new Error(`webhook ${response.status}: ${typeof body === "string" ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300)}`);
  return body;
}

async function githubFetch(path: string, init: RequestInit = {}) {
  const token = requireEnv("GITHUB_TOKEN");
  if (!token) throw new Error("GITHUB_TOKEN manquant");
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(45_000),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${text.slice(0, 300)}`);
  return body;
}

function repoFullName(req: any): string {
  const repo = optionString(req, "repo") || process.env.GITHUB_REPO || "agenceialyon69/Tams-Plate-forme-";
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("repo invalide");
  return repo;
}

function safeBranchName(req: any): string {
  const raw = optionString(req, "branch") || `tams/agent-${Date.now()}`;
  const branch = raw.replace(/[^\w./-]/g, "-").replace(/^\/+|\/+$/g, "").slice(0, 90);
  if (!branch || branch === "main" || branch === "master") throw new Error("branche dangereuse refusée");
  return branch;
}

async function runRepoAudit(req: any, capabilityId: string) {
  const repo = repoFullName(req);
  const [owner, name] = repo.split("/");
  const repoInfo = await githubFetch(`/repos/${owner}/${name}`);
  const branch = optionString(req, "ref") || repoInfo.default_branch || "main";
  const tree = await githubFetch(`/repos/${owner}/${name}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  const files = Array.isArray(tree.tree) ? tree.tree.filter((item: any) => item.type === "blob") : [];
  const important = files
    .map((item: any) => item.path as string)
    .filter((file: string) => /package.json|railway|nixpacks|routes\/|lib\/|pages\/|workflow|AGENTS.md|README/i.test(file))
    .slice(0, 80);
  const result = [
    `Repo: ${repo}`,
    `Default branch: ${repoInfo.default_branch}`,
    `Files indexed: ${files.length}`,
    "",
    "Hotspots:",
    ...important.map((file: string) => `- ${file}`),
    "",
    "Red Team:",
    "- Aucun patch direct main.",
    "- Toute correction doit passer par branche + CI + PR.",
    "- Les capacités média réelles doivent rester conditionnées par providers/secrets.",
  ].join("\n");
  return actionResponse({
    capabilityId,
    status: "success",
    mode: "read_only",
    title: "Audit repo GitHub read-only",
    result,
    artifact: { type: "json", content: result, data: { repo, branch, files: files.length, hotspots: important } },
    limitations: ["Audit structurel via GitHub API, pas une analyse AST complète."],
    nextActions: ["Brancher un moteur AST pour analyse code profonde.", "Lancer repo.validate via CI ou webhook n8n."],
    providerUsed: "github-api",
  });
}

async function runRepoPatch(req: any, capabilityId: string) {
  if (process.env.TAMS_ENABLE_REPO_PATCH !== "true") {
    return actionResponse({
      capabilityId,
      status: "disabled",
      mode: "disabled",
      title: "Patch repo désactivé par sécurité",
      result: "Le patching réel exige TAMS_ENABLE_REPO_PATCH=true, GITHUB_TOKEN, options.approved=true, options.path et options.content. Aucun patch n’est appliqué sans ces garde-fous.",
      limitations: ["Protection anti-casse : désactivé tant que le propriétaire ne l’active pas explicitement."],
      nextActions: ["Activer seulement après Permission Layer + UI de preview diff."],
      providerUsed: "github-api",
    });
  }

  if (!optionBool(req, "approved")) throw new Error("options.approved=true requis");
  const repo = repoFullName(req);
  const [owner, name] = repo.split("/");
  const filePath = optionString(req, "path");
  const content = optionString(req, "content");
  if (!filePath || !content) throw new Error("options.path et options.content requis");
  if (filePath.includes("..") || filePath.startsWith("/")) throw new Error("path dangereux refusé");

  const branch = safeBranchName(req);
  const repoInfo = await githubFetch(`/repos/${owner}/${name}`);
  const baseRef = await githubFetch(`/repos/${owner}/${name}/git/ref/heads/${repoInfo.default_branch}`);
  await githubFetch(`/repos/${owner}/${name}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseRef.object.sha }),
  }).catch(error => {
    if (!String(error.message || "").includes("Reference already exists")) throw error;
  });

  let existingSha: string | undefined;
  try {
    const existing = await githubFetch(`/repos/${owner}/${name}/contents/${encodeURIComponent(filePath).replace(/%2F/g, "/")}?ref=${encodeURIComponent(branch)}`);
    existingSha = existing.sha;
  } catch {
    existingSha = undefined;
  }

  await githubFetch(`/repos/${owner}/${name}/contents/${encodeURIComponent(filePath).replace(/%2F/g, "/")}`, {
    method: "PUT",
    body: JSON.stringify({
      message: optionString(req, "message") || `chore: update ${filePath} via TAMS agent`,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch,
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });

  return actionResponse({
    capabilityId,
    status: "success",
    mode: "real",
    title: "Patch appliqué sur branche sécurisée",
    result: `Fichier ${filePath} écrit sur la branche ${branch}. Aucun push main. Ouvre/valide une PR après CI.`,
    artifact: { type: "json", data: { repo, branch, path: filePath } },
    limitations: ["Ne merge pas automatiquement.", "N’exécute pas les tests localement dans cette action."],
    nextActions: ["Créer une PR", "Attendre CI", "Revue humaine avant merge"],
    providerUsed: "github-api",
  });
}

router.post("/capabilities/execute", async (req, res, next) => {
  const capabilityId = typeof req.body?.capabilityId === "string" ? req.body.capabilityId : "";
  const input = getInput(req);

  try {
    switch (capabilityId) {
      case "video.generate":
      case "video.edit": {
        const images = imageUrlsFromRequest(req, input);
        const musicUrl = optionString(req, "musicUrl");
        const video = await generateSlideshowVideo({
          images,
          text: optionString(req, "text") || input.slice(0, 160),
          secondsPerImage: Number(req.body?.options?.secondsPerImage) || 2.5,
          musicUrl,
        });
        const result = [`Vidéo MP4 générée via FFmpeg.`, `URL: ${video.url}`, `Durée: ${video.durationSec}s`, `Images: ${video.images}`, `Musique: ${video.withMusic ? "oui" : "non"}`].join("\n");
        return res.json(actionResponse({
          capabilityId,
          status: "success",
          mode: "real",
          title: capabilityId === "video.generate" ? "Vidéo générée" : "Montage vidéo généré",
          result,
          artifact: { type: "file", url: video.url, content: result, data: video },
          limitations: ["Génération réelle FFmpeg sous forme de slideshow/assemblage, pas text-to-video IA type Runway.", "Stockage temporaire : le fichier peut disparaître après redéploiement."],
          nextActions: ["Télécharger/tester le MP4", "Brancher stockage persistant S3/R2 pour production"],
          providerUsed: "ffmpeg",
        }));
      }

      case "audio.music.generate": {
        const music = await generateMusic(input);
        if (!music.ok) return res.status(music.status ?? 503).json(actionResponse({ capabilityId, status: "missing_config", mode: "disabled", title: "Musique non générée", result: `${music.error}. ${music.hint ?? ""}`.trim(), limitations: ["HF_TOKEN/HUGGINGFACE_API_KEY requis pour MusicGen."], nextActions: ["Ajouter HF_TOKEN dans Railway."], providerUsed: "huggingface-musicgen" }));
        return res.json(actionResponse({ capabilityId, status: "success", mode: "real", title: "Musique générée", result: `Audio généré: ${music.url}`, artifact: { type: "file", url: music.url, data: music }, limitations: ["Qualité variable selon modèle HF gratuit.", "Stockage temporaire."], nextActions: ["Écouter/télécharger", "Utiliser comme musicUrl dans video.generate"], providerUsed: "huggingface-musicgen" }));
      }

      case "audio.synthesize": {
        const speech = await generateSpeech(input);
        if (!speech.ok) return res.status(speech.status ?? 503).json(actionResponse({ capabilityId, status: "missing_config", mode: "disabled", title: "Voix non générée", result: `${speech.error}. ${speech.hint ?? ""}`.trim(), limitations: ["HF_TOKEN/HUGGINGFACE_API_KEY requis pour TTS."], nextActions: ["Ajouter HF_TOKEN dans Railway."], providerUsed: "huggingface-tts" }));
        return res.json(actionResponse({ capabilityId, status: "success", mode: "real", title: "Voix générée", result: `Audio voix généré: ${speech.url}`, artifact: { type: "file", url: speech.url, data: speech }, limitations: ["Voix française basique selon modèle HF gratuit.", "Stockage temporaire."], nextActions: ["Écouter/télécharger", "Utiliser comme piste audio dans un montage"], providerUsed: "huggingface-tts" }));
      }

      case "voice.transcribe": {
        const audioUrl = optionString(req, "audioUrl") || (/^https?:\/\//.test(input) ? input : undefined);
        if (!audioUrl) return res.status(400).json(actionResponse({ capabilityId, status: "missing_config", mode: "disabled", title: "Audio manquant", result: "Fournis une URL audio dans le champ input ou options.audioUrl.", limitations: ["Upload fichier non branché dans ce handler, URL audio requise."], nextActions: ["Ajouter upload audio UI", "Ou coller une URL audio publique"], providerUsed: "huggingface-asr" }));
        const transcription = await transcribeAudioUrl(audioUrl);
        if (!transcription.ok) return res.status(transcription.status ?? 503).json(actionResponse({ capabilityId, status: "missing_config", mode: "disabled", title: "Transcription non générée", result: `${transcription.error}. ${transcription.hint ?? ""}`.trim(), limitations: ["HF_TOKEN/HUGGINGFACE_API_KEY requis pour ASR."], nextActions: ["Ajouter HF_TOKEN dans Railway."], providerUsed: "huggingface-whisper" }));
        return res.json(actionResponse({ capabilityId, status: "success", mode: "real", title: "Transcription audio", result: transcription.text ?? "", artifact: { type: "text", content: transcription.text }, limitations: ["Qualité dépend de la langue, du bruit et du modèle."], nextActions: ["Transformer en résumé", "Créer tâches/actions depuis la transcription"], providerUsed: "huggingface-whisper" }));
      }

      case "automation.workflow": {
        const webhook = requireEnv("N8N_WEBHOOK_URL") || optionString(req, "webhookUrl");
        if (!webhook) return res.status(503).json(actionResponse({ capabilityId, status: "missing_config", mode: "disabled", title: "n8n non configuré", result: "Aucun N8N_WEBHOOK_URL configuré. L’automatisation réelle nécessite un webhook n8n.", limitations: ["Pas d’automatisation sans URL webhook."], nextActions: ["Créer un workflow n8n avec Webhook Trigger", "Ajouter N8N_WEBHOOK_URL dans Railway"], providerUsed: "n8n" }));
        const data = await postWebhook(webhook, { source: "tams", capabilityId, input, options: req.body?.options ?? {} });
        const result = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        return res.json(actionResponse({ capabilityId, status: "success", mode: "real", title: "Workflow n8n exécuté", result, artifact: { type: "json", content: result, data }, limitations: ["TAMS transmet au webhook configuré ; la logique réelle vit dans n8n."], nextActions: ["Vérifier l’exécution dans n8n", "Ajouter signature secrète webhook en production"], providerUsed: "n8n" }));
      }

      case "repo.audit":
      case "repo.validate":
        return res.json(await runRepoAudit(req, capabilityId));

      case "repo.patch":
        return res.json(await runRepoPatch(req, capabilityId));

      default:
        return next();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json(actionResponse({
      capabilityId: capabilityId || "unknown",
      status: "error",
      mode: "disabled",
      title: "Action média/devops échouée",
      result: message,
      limitations: ["Erreur affichée au lieu d’être masquée."],
      nextActions: ["Lire les logs serveur", "Vérifier variables d’environnement et payload"],
      providerUsed: "media-devops-router",
    }));
  }
});

export default router;
