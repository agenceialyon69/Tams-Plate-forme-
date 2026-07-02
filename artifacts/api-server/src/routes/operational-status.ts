import { Router } from "express";
import { existsSync } from "node:fs";

const router = Router();

function configured(...names: string[]): boolean {
  return names.some(name => Boolean(process.env[name]?.trim()));
}

function ffmpegAvailable(): boolean {
  return existsSync("/usr/bin/ffmpeg") ||
    existsSync("/usr/local/bin/ffmpeg") ||
    Boolean(process.env.FFMPEG_PATH?.trim()) ||
    Boolean(process.env.RAILWAY_ENVIRONMENT);
}

function capabilityStatus() {
  const video = ffmpegAvailable();
  const audio = configured("MUSICGEN_WORKER_URL", "HF_TOKEN", "HUGGINGFACE_API_KEY");
  return {
    image: {
      status: "external_unverified",
      provider: "pollinations",
      limitation: "Provider externe gratuit : disponibilité vérifiée uniquement lors de l’exécution.",
    },
    video: {
      status: video ? "available" : "missing_config",
      provider: "ffmpeg",
      limitation: video ? "MP4 réel par diaporama FFmpeg, pas génération vidéo IA native." : "FFmpeg absent de l’environnement.",
    },
    audio: {
      status: audio ? "configured" : "missing_config",
      provider: configured("MUSICGEN_WORKER_URL") ? "musicgen-worker" : configured("HF_TOKEN", "HUGGINGFACE_API_KEY") ? "huggingface-musicgen" : "none",
      limitation: audio ? "Qualité, latence et disponibilité dépendent du provider." : "Configurer MUSICGEN_WORKER_URL ou HF_TOKEN.",
    },
    documents: {
      status: "available",
      provider: "tams-assets",
      limitation: "Persistance texte uniquement.",
    },
  };
}

router.get("/capabilities/status", (_req, res) => {
  const capabilities = capabilityStatus();
  const values = Object.values(capabilities);
  res.json({
    status: values.some(item => item.status === "missing_config") ? "partial" : "online",
    capabilities,
    configuredProviders: values.filter(item => ["available", "configured"].includes(item.status)).map(item => item.provider),
    missingConfiguration: values.filter(item => item.status === "missing_config").map(item => item.provider),
    honestyNote: "Un handler déclaré n’est pas présenté comme opérationnel tant que son provider requis n’est pas configuré.",
  });
});

router.get("/studio/status", (_req, res) => {
  const capabilities = capabilityStatus();
  res.json({
    status: Object.values(capabilities).some(item => item.status === "missing_config") ? "partial" : "online",
    capabilities,
    resultsPolicy: "real_artifacts_only",
    upload: {
      status: "not_connected",
      message: "Upload serveur non connecté : aucun faux progrès ni faux succès.",
    },
    honestyNote: "Studio persiste un résultat média uniquement après réception d’une URL d’artefact confirmée par le backend.",
  });
});

export default router;
