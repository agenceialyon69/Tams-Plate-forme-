/**
 * Capability Router
 *
 * Routes an intent to the best available provider.
 * Free-first strategy: always try free providers before paid ones.
 * Honest: returns unavailable status rather than pretending to work.
 */

import type { Intent } from "./kernel-types.js";

export type ProviderStatus = "available" | "planned" | "unavailable" | "requires_local";

export interface CapabilityRoute {
  capability: string;
  primaryProvider: string;
  primaryStatus: ProviderStatus;
  fallbackProviders: { id: string; status: ProviderStatus }[];
  canExecuteNow: boolean;
  honestNote: string;
}

// Truth table: capability → providers in free-first order
// Sync with capability-registry.ts
const CAPABILITY_ROUTES: Record<string, CapabilityRoute> = {
  "image.generate": {
    capability: "image.generate",
    primaryProvider: "pollinations",
    primaryStatus: "available",
    fallbackProviders: [
      { id: "huggingface_image", status: "available" },
      { id: "comfyui", status: "requires_local" },
    ],
    canExecuteNow: true,
    honestNote: "Pollinations génère des images gratuitement sans clé API.",
  },
  "video.edit": {
    capability: "video.edit",
    primaryProvider: "ffmpeg",
    primaryStatus: "available",
    fallbackProviders: [],
    canExecuteNow: true,
    honestNote: "FFmpeg disponible sur Railway/Nixpacks.",
  },
  "video.generate": {
    capability: "video.generate",
    primaryProvider: "remotion",
    primaryStatus: "planned",
    fallbackProviders: [],
    canExecuteNow: false,
    honestNote: "Remotion planifié — non disponible sur Railway pour l'instant.",
  },
  "audio.music.generate": {
    capability: "audio.music.generate",
    primaryProvider: "musicgen",
    primaryStatus: "requires_local",
    fallbackProviders: [{ id: "riffusion", status: "planned" }],
    canExecuteNow: false,
    honestNote: "MusicGen nécessite un GPU local. Non disponible sur Railway.",
  },
  "audio.synthesize": {
    capability: "audio.synthesize",
    primaryProvider: "piper",
    primaryStatus: "planned",
    fallbackProviders: [{ id: "edge_tts", status: "planned" }],
    canExecuteNow: false,
    honestNote: "Synthèse vocale planifiée. Piper/Edge TTS non encore connectés.",
  },
  "voice.transcribe": {
    capability: "voice.transcribe",
    primaryProvider: "whisper",
    primaryStatus: "planned",
    fallbackProviders: [],
    canExecuteNow: false,
    honestNote: "Whisper planifié — nécessite un worker local.",
  },
  "text.generate": {
    capability: "text.generate",
    primaryProvider: "groq",
    primaryStatus: "available",
    fallbackProviders: [
      { id: "gemini", status: "available" },
      { id: "openrouter", status: "available" },
    ],
    canExecuteNow: true,
    honestNote: "Groq (free tier) primary, Gemini/OpenRouter fallback.",
  },
  "studio.generate": {
    capability: "studio.generate",
    primaryProvider: "groq",
    primaryStatus: "available",
    fallbackProviders: [{ id: "gemini", status: "available" }],
    canExecuteNow: true,
    honestNote: "Génère un plan créatif — ne produit pas de fichiers média.",
  },
  "memory.query": {
    capability: "memory.query",
    primaryProvider: "internal",
    primaryStatus: "available",
    fallbackProviders: [],
    canExecuteNow: true,
    honestNote: "Mémoire TAMS interne avec pgvector.",
  },
  "observe.health": {
    capability: "observe.health",
    primaryProvider: "internal",
    primaryStatus: "available",
    fallbackProviders: [],
    canExecuteNow: true,
    honestNote: "Endpoint /api/healthz interne.",
  },
  "repo.audit": {
    capability: "repo.audit",
    primaryProvider: "github",
    primaryStatus: "available",
    fallbackProviders: [],
    canExecuteNow: true,
    honestNote: "Lecture seule. Dev Runtime requis.",
  },
  "deploy.check": {
    capability: "deploy.check",
    primaryProvider: "railway",
    primaryStatus: "available",
    fallbackProviders: [],
    canExecuteNow: true,
    honestNote: "Vérifie uniquement les variables Railway — ne déploie jamais.",
  },
};

const INTENT_TO_CAPABILITY: Partial<Record<Intent, string>> = {
  generate_image: "image.generate",
  generate_video: "video.generate",
  generate_music: "audio.music.generate",
  studio_create: "studio.generate",
  chat: "text.generate",
  general_chat: "text.generate",
  make_decision: "text.generate",
  decision_red_team: "text.generate",
  search_memory: "memory.query",
  memory_query: "memory.query",
  system_health: "observe.health",
  system_check: "observe.health",
  repo_audit: "repo.audit",
  provider_status: "observe.health",
};

export function routeCapability(intent: Intent, hint?: string): CapabilityRoute | null {
  const capabilityId = hint ?? INTENT_TO_CAPABILITY[intent];
  if (!capabilityId) return null;
  return CAPABILITY_ROUTES[capabilityId] ?? null;
}

export function getAllRoutes(): CapabilityRoute[] {
  return Object.values(CAPABILITY_ROUTES);
}

export function getAvailableRoutes(): CapabilityRoute[] {
  return Object.values(CAPABILITY_ROUTES).filter(r => r.canExecuteNow);
}
