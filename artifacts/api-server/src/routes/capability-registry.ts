/**
 * Capability Registry for TAMS
 * Free-first AI capabilities with provider routing
 */

import { Router } from "express";
import { existsSync } from "node:fs";

const router = Router();

// ─── Capability Types ───────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type CapabilityStatus = "available" | "planned" | "experimental" | "disabled";

export interface Provider {
  id: string;
  name: string;
  type: "free" | "freemium" | "paid";
  status: "available" | "configured" | "missing_config" | "planned" | "experimental" | "rate_limited" | "requires_local" | "read_only" | "disabled";
  baseUrl?: string;
  requiresAuth: boolean;
  authType?: "api_key" | "oauth" | "none";
  rateLimit?: { requests: number; period: string };
  costPerPage?: number;
  notes?: string;
}

export interface Capability {
  id: string;
  label: string;
  description: string;
  category: "text" | "image" | "audio" | "video" | "analysis" | "automation";
  riskLevel: RiskLevel;
  requiredPermission: "none" | "authenticated" | "approved" | "admin";
  providers: Provider[];
  fallbackBehavior: "fail" | "queue" | "fallback_free";
  status: CapabilityStatus;
  validationNotes?: string;
}

// ─── Provider Registry ──────────────────────────────────────────────────────

const PROVIDERS: Record<string, Provider> = {
  // === TEXT PROVIDERS (Free-first) ===
  groq: {
    id: "groq",
    name: "Groq",
    type: "free",
    status: "available",
    baseUrl: "https://api.groq.com/openai/v1",
    requiresAuth: true,
    authType: "api_key",
    rateLimit: { requests: 30, period: "minute" },
    notes: "Fast inference, free tier available",
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    type: "freemium",
    status: "available",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    requiresAuth: true,
    authType: "api_key",
    rateLimit: { requests: 60, period: "minute" },
    notes: "Free tier: 60 req/min, 1500 req/day",
  },
  huggingface: {
    id: "huggingface",
    name: "Hugging Face",
    type: "free",
    status: "available",
    baseUrl: "https://api-inference.huggingface.co/models",
    requiresAuth: true,
    authType: "api_key",
    rateLimit: { requests: 30, period: "minute" },
    notes: "Serverless inference, many free models",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    type: "freemium",
    status: "available",
    baseUrl: "https://openrouter.ai/api/v1",
    requiresAuth: true,
    authType: "api_key",
    notes: "Multiple models, pay-per-use",
  },
  ollama: {
    id: "ollama",
    name: "Ollama (Local)",
    type: "free",
    status: "planned",
    baseUrl: "http://localhost:11434",
    requiresAuth: false,
    authType: "none",
    notes: "Local LLM inference, offline capable",
  },

  // === IMAGE PROVIDERS ===
  pollinations: {
    id: "pollinations",
    name: "Pollinations.ai",
    type: "free",
    status: "available",
    baseUrl: "https://api.pollinations.ai",
    requiresAuth: false,
    authType: "none",
    notes: "Free image generation, no API key required",
  },
  comfyui: {
    id: "comfyui",
    name: "ComfyUI (Local)",
    type: "free",
    status: "planned",
    baseUrl: "http://localhost:8188",
    requiresAuth: false,
    authType: "none",
    notes: "Local Stable Diffusion, requires GPU",
  },
  huggingface_image: {
    id: "huggingface_image",
    name: "Hugging Face Image Models",
    type: "free",
    status: "available",
    baseUrl: "https://api-inference.huggingface.co/models",
    requiresAuth: true,
    authType: "api_key",
    notes: "SDXL, Flux, free tier available",
  },

  // === AUDIO PROVIDERS ===
  whisper: {
    id: "whisper",
    name: "Whisper (Local)",
    type: "free",
    status: "planned",
    baseUrl: "http://localhost:8080",
    requiresAuth: false,
    authType: "none",
    notes: "Local speech-to-text, OpenAI Whisper model",
  },
  piper: {
    id: "piper",
    name: "Piper TTS (Local)",
    type: "free",
    status: "planned",
    baseUrl: "http://localhost:10200",
    requiresAuth: false,
    authType: "none",
    notes: "Local text-to-speech, fast and offline",
  },
  edge_tts: {
    id: "edge_tts",
    name: "Edge TTS",
    type: "free",
    status: "planned",
    requiresAuth: false,
    authType: "none",
    notes: "Microsoft Edge TTS, free, no API key",
  },

  // === VIDEO/MEDIA PROVIDERS ===
  ffmpeg: {
    id: "ffmpeg",
    name: "FFmpeg (Local)",
    type: "free",
    status: "available",
    requiresAuth: false,
    authType: "none",
    notes: "Video encoding, conversion, trimming — available in Railway/Nixpacks",
  },
  remotion: {
    id: "remotion",
    name: "Remotion (Local)",
    type: "free",
    status: "planned",
    requiresAuth: false,
    authType: "none",
    notes: "Programmatic video generation with React",
  },
  musicgen: {
    id: "musicgen",
    name: "MusicGen (Local)",
    type: "free",
    status: "planned",
    requiresAuth: false,
    authType: "none",
    notes: "AI music generation, requires local GPU — not available on Railway",
  },
  riffusion: {
    id: "riffusion",
    name: "Riffusion",
    type: "free",
    status: "experimental",
    requiresAuth: false,
    authType: "none",
    notes: "Experimental music generation via image-to-audio",
  },

  // === AUTOMATION PROVIDERS ===
  n8n: {
    id: "n8n",
    name: "n8n",
    type: "free",
    status: "planned",
    baseUrl: "http://localhost:5678",
    requiresAuth: true,
    authType: "api_key",
    notes: "Workflow automation, self-hosted",
  },

  // === DEPLOYMENT / INFRA PROVIDERS ===
  railway: {
    id: "railway",
    name: "Railway",
    type: "freemium",
    status: "available",
    baseUrl: "https://backboard.railway.app",
    requiresAuth: true,
    authType: "api_key",
    notes: "Deployment platform — deploy.check reads Railway env vars",
  },
  github: {
    id: "github",
    name: "GitHub",
    type: "free",
    status: "available",
    baseUrl: "https://api.github.com",
    requiresAuth: true,
    authType: "api_key",
    notes: "Repo audit/validate — read-only operations only",
  },
};

function providerOperationalStatus(provider: Provider): Provider["status"] {
  const configured: Record<string, boolean> = {
    groq: !!process.env.GROQ_API_KEY,
    gemini: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    huggingface: !!(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY),
    huggingface_image: !!(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY),
    openrouter: !!(process.env.OPENROUTER_API_KEY || process.env.OPENROUTE_API_KEY),
    github: !!process.env.GITHUB_TOKEN,
    railway: !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME || process.env.RAILWAY_TOKEN),
  };
  if (provider.id in configured) return configured[provider.id] ? "configured" : "missing_config";
  if (provider.id === "ffmpeg") {
    return existsSync("/usr/bin/ffmpeg") || existsSync("/usr/local/bin/ffmpeg") || !!process.env.RAILWAY_ENVIRONMENT
      ? "available"
      : "missing_config";
  }
  if (["comfyui", "whisper", "piper", "musicgen", "ollama"].includes(provider.id)) return "requires_local";
  return provider.status;
}

function operationalProvider(provider: Provider): Provider {
  const status = providerOperationalStatus(provider);
  return {
    ...provider,
    status,
    notes: `${provider.notes ?? ""} Operational status: ${status}.`.trim(),
  };
}

// ─── Capability Registry ────────────────────────────────────────────────────

const CAPABILITIES: Capability[] = [
  // === TEXT CAPABILITIES ===
  {
    id: "text.generate",
    label: "Text Generation",
    description: "Generate text content using LLMs",
    category: "text",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [PROVIDERS.groq, PROVIDERS.gemini, PROVIDERS.huggingface, PROVIDERS.openrouter, PROVIDERS.ollama],
    fallbackBehavior: "fallback_free",
    status: "available",
    validationNotes: "Groq/Gemini primary, others fallback",
  },
  {
    id: "text.analyze",
    label: "Text Analysis",
    description: "Analyze text for sentiment, entities, summary",
    category: "text",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [PROVIDERS.groq, PROVIDERS.gemini, PROVIDERS.huggingface],
    fallbackBehavior: "fallback_free",
    status: "available",
  },
  {
    id: "text.translate",
    label: "Translation",
    description: "Translate text between languages",
    category: "text",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [PROVIDERS.gemini, PROVIDERS.huggingface],
    fallbackBehavior: "fallback_free",
    status: "available",
  },

  // === STUDIO CAPABILITIES ===
  {
    id: "studio.analyze",
    label: "Studio Analysis",
    description: "Analyze creative project requirements and suggest a production plan",
    category: "analysis",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [PROVIDERS.groq, PROVIDERS.gemini],
    fallbackBehavior: "fallback_free",
    status: "available",
    validationNotes: "Read-only analysis, no content generation",
  },
  {
    id: "studio.generate",
    label: "Studio Generate",
    description: "Orchestrate multi-step creative content generation",
    category: "text",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [PROVIDERS.groq, PROVIDERS.gemini],
    fallbackBehavior: "fallback_free",
    status: "available",
  },
  {
    id: "studio.brief.generate",
    label: "Brief Generation",
    description: "Generate creative briefs for projects",
    category: "text",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [PROVIDERS.groq, PROVIDERS.gemini],
    fallbackBehavior: "fallback_free",
    status: "available",
  },
  {
    id: "studio.script.generate",
    label: "Script Writing",
    description: "Generate video/podcast scripts",
    category: "text",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [PROVIDERS.groq, PROVIDERS.gemini],
    fallbackBehavior: "fallback_free",
    status: "available",
  },
  {
    id: "studio.storyboard.generate",
    label: "Storyboard Planning",
    description: "Generate storyboard outlines for video",
    category: "text",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [PROVIDERS.groq, PROVIDERS.gemini],
    fallbackBehavior: "fallback_free",
    status: "available",
  },
  {
    id: "studio.prompt.generate",
    label: "Prompt Engineering",
    description: "Optimize prompts for AI models",
    category: "text",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [PROVIDERS.groq, PROVIDERS.gemini],
    fallbackBehavior: "fallback_free",
    status: "available",
  },
  {
    id: "studio.caption.generate",
    label: "Caption Generation",
    description: "Generate social media captions",
    category: "text",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [PROVIDERS.groq, PROVIDERS.gemini],
    fallbackBehavior: "fallback_free",
    status: "available",
  },
  {
    id: "studio.document.generate",
    label: "Document Generation",
    description: "Generate reports, proposals, presentations",
    category: "text",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [PROVIDERS.groq, PROVIDERS.gemini],
    fallbackBehavior: "fallback_free",
    status: "available",
  },
  {
    id: "studio.video.edit.plan",
    label: "Video Edit Plan",
    description: "Plan a video edit sequence (timeline, cuts, subtitles)",
    category: "video",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [PROVIDERS.groq, PROVIDERS.gemini],
    fallbackBehavior: "fallback_free",
    status: "available",
    validationNotes: "Produces a plan only; actual encoding requires FFmpeg worker",
  },
  {
    id: "studio.music.plan",
    label: "Music Plan",
    description: "Plan music direction, mood, instruments for a project",
    category: "audio",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [PROVIDERS.groq, PROVIDERS.gemini],
    fallbackBehavior: "fallback_free",
    status: "available",
    validationNotes: "Plan only — actual generation requires MusicGen local GPU",
  },
  {
    id: "studio.export.social",
    label: "Social Export Plan",
    description: "Produce platform-specific export recommendations (TikTok, Instagram, YouTube)",
    category: "text",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [PROVIDERS.groq, PROVIDERS.gemini],
    fallbackBehavior: "fallback_free",
    status: "available",
  },

  // === IMAGE CAPABILITIES ===
  {
    id: "image.generate",
    label: "Image Generation",
    description: "Generate images from text prompts",
    category: "image",
    riskLevel: "medium",
    requiredPermission: "authenticated",
    providers: [PROVIDERS.pollinations, PROVIDERS.huggingface_image, PROVIDERS.comfyui],
    fallbackBehavior: "fallback_free",
    status: "available",
    validationNotes: "Pollinations primary (free, no auth); ComfyUI for local GPU",
  },
  {
    id: "image.analyze",
    label: "Image Analysis",
    description: "Analyze images for content, objects, text",
    category: "image",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [PROVIDERS.gemini, PROVIDERS.huggingface],
    fallbackBehavior: "fallback_free",
    status: "available",
  },

  // === AUDIO CAPABILITIES ===
  {
    id: "voice.transcribe",
    label: "Speech to Text",
    description: "Transcribe audio to text",
    category: "audio",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [PROVIDERS.whisper],
    fallbackBehavior: "fail",
    status: "planned",
    validationNotes: "Local Whisper planned — requires GPU/local worker, not available on Railway",
  },
  {
    id: "audio.synthesize",
    label: "Text to Speech",
    description: "Convert text to speech audio",
    category: "audio",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [PROVIDERS.piper, PROVIDERS.edge_tts],
    fallbackBehavior: "fail",
    status: "planned",
    validationNotes: "Piper planned for local offline synthesis; Edge TTS planned",
  },
  {
    id: "audio.music.generate",
    label: "Music Generation",
    description: "Generate background music and soundscapes",
    category: "audio",
    riskLevel: "medium",
    requiredPermission: "approved",
    providers: [PROVIDERS.musicgen, PROVIDERS.riffusion],
    fallbackBehavior: "fail",
    status: "planned",
    validationNotes: "MusicGen requires local GPU — NOT available on Railway. Riffusion experimental.",
  },

  // === VIDEO CAPABILITIES ===
  {
    id: "video.edit",
    label: "Video Editing",
    description: "Trim, merge, add effects to videos",
    category: "video",
    riskLevel: "medium",
    requiredPermission: "authenticated",
    providers: [PROVIDERS.ffmpeg],
    fallbackBehavior: "fail",
    status: "available",
    validationNotes: "FFmpeg available in Railway/Nixpacks build",
  },
  {
    id: "video.generate",
    label: "Video Generation",
    description: "Generate videos programmatically",
    category: "video",
    riskLevel: "high",
    requiredPermission: "approved",
    providers: [PROVIDERS.remotion],
    fallbackBehavior: "fail",
    status: "planned",
    validationNotes: "Remotion planned — requires local worker, not yet connected",
  },

  // === ANALYSIS CAPABILITIES ===
  {
    id: "repo.audit",
    label: "Repository Audit",
    description: "Analyze codebase structure and quality",
    category: "analysis",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [PROVIDERS.github],
    fallbackBehavior: "fail",
    status: "available",
    validationNotes: "Built-in Dev Runtime — read-only GitHub access",
  },
  {
    id: "repo.validate",
    label: "Repository Validation",
    description: "Run build, tests, type checks",
    category: "analysis",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [],
    fallbackBehavior: "fail",
    status: "available",
    validationNotes: "Built-in Dev Runtime validation — read_only mode only from Chat",
  },
  {
    id: "repo.patch",
    label: "Repository Patch",
    description: "Apply safe patches to repository files",
    category: "analysis",
    riskLevel: "high",
    requiredPermission: "approved",
    providers: [PROVIDERS.github],
    fallbackBehavior: "fail",
    status: "available",
    validationNotes: "Dev Runtime patch mode — requires explicit approval, never touches main",
  },

  // === SEARCH ===
  {
    id: "search.web",
    label: "Web Search",
    description: "Search the web for information",
    category: "text",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [],
    fallbackBehavior: "fail",
    status: "planned",
    validationNotes: "Planned: DuckDuckGo or Tavily integration",
  },

  // === MEMORY ===
  {
    id: "memory.query",
    label: "Memory Query",
    description: "Query TAMS memory for context",
    category: "analysis",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [],
    fallbackBehavior: "fail",
    status: "available",
    validationNotes: "Built-in memory system with pgvector",
  },

  // === DEPLOYMENT ===
  {
    id: "deploy.check",
    label: "Deployment Check",
    description: "Validate Railway readiness",
    category: "analysis",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [PROVIDERS.railway],
    fallbackBehavior: "fail",
    status: "available",
    validationNotes: "Read-only Railway env check — never triggers a deploy",
  },
  {
    id: "observe.health",
    label: "Health Monitoring",
    description: "Check system health status",
    category: "analysis",
    riskLevel: "low",
    requiredPermission: "none",
    providers: [],
    fallbackBehavior: "fail",
    status: "available",
    validationNotes: "Built-in /api/healthz endpoint",
  },

  // === AUTOMATION ===
  {
    id: "automation.workflow",
    label: "Workflow Automation",
    description: "Run automated workflows",
    category: "automation",
    riskLevel: "medium",
    requiredPermission: "approved",
    providers: [PROVIDERS.n8n],
    fallbackBehavior: "fail",
    status: "planned",
    validationNotes: "n8n integration planned — self-hosted",
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Returns capabilities matching a given category */
export function getCapabilitiesByCategory(category: Capability["category"]): Capability[] {
  return CAPABILITIES.filter(c => c.category === category);
}

/** Returns capabilities safe to expose to the runtime chat (read-only, low/medium risk) */
export function getRuntimeSafeCapabilities(): Capability[] {
  return CAPABILITIES.filter(
    c => c.riskLevel === "low" && c.requiredPermission !== "admin",
  );
}

/** Returns all provider ids that are truly enabled (not planned/experimental) */
export function getEnabledProviderIds(): string[] {
  return Object.values(PROVIDERS)
    .filter(p => p.status === "available")
    .map(p => p.id);
}

// ─── API Routes ─────────────────────────────────────────────────────────────

router.get("/registry/capabilities", (_req, res) => {
  res.json({
    capabilities: CAPABILITIES.map(capability => ({
      ...capability,
      declaredInCatalog: true,
      providerConfigured: capability.providers.some(provider => ["available", "configured"].includes(providerOperationalStatus(provider))),
      executableNow: capability.status === "available" && capability.providers.every(provider => !["missing_config", "planned", "requires_local", "disabled"].includes(providerOperationalStatus(provider))),
      plannedOnly: capability.status === "planned",
      requiresLocal: capability.providers.some(provider => providerOperationalStatus(provider) === "requires_local"),
      readOnly: capability.id.startsWith("repo.") || capability.id === "deploy.check",
      disabled: capability.status === "disabled",
    })),
    total: CAPABILITIES.length,
    available: CAPABILITIES.filter(c => c.status === "available").length,
    planned: CAPABILITIES.filter(c => c.status === "planned").length,
    experimental: CAPABILITIES.filter(c => c.status === "experimental").length,
  });
});

router.get("/registry/capabilities/:id", (req, res) => {
  const capability = CAPABILITIES.find(c => c.id === req.params.id);
  if (!capability) {
    return res.status(404).json({ error: "Capability not found" });
  }
  return res.json(capability);
});

router.get("/registry/providers", (_req, res) => {
  res.json({
    providers: Object.values(PROVIDERS).map(operationalProvider),
    total: Object.keys(PROVIDERS).length,
    available: Object.values(PROVIDERS).filter(p => p.status === "available").length,
    planned: Object.values(PROVIDERS).filter(p => p.status === "planned").length,
    free: Object.values(PROVIDERS).filter(p => p.type === "free").length,
  });
});

router.get("/registry/providers/:id", (req, res) => {
  const provider = PROVIDERS[req.params.id];
  if (!provider) {
    return res.status(404).json({ error: "Provider not found" });
  }
  return res.json(provider);
});

router.get("/registry/status", (_req, res) => {
  const operationalProviders = Object.values(PROVIDERS).map(operationalProvider);
  const freeProviders = operationalProviders.filter(p => p.type === "free");
  const availableFree = freeProviders.filter(p => ["available", "configured"].includes(p.status));
  const missingConfiguration = operationalProviders.filter(p => p.status === "missing_config").map(p => p.id);
  const operationalStatus = availableFree.length === 0 ? "offline" : missingConfiguration.length > 0 ? "partial" : "online";

  res.json({
    status: operationalStatus,
    strategy: "free-first",
    principle: "Always prefer free/local providers over paid SaaS",
    providers: {
      total: Object.keys(PROVIDERS).length,
      free: freeProviders.length,
      freemium: Object.values(PROVIDERS).filter(p => p.type === "freemium").length,
      paid: Object.values(PROVIDERS).filter(p => p.type === "paid").length,
      available: operationalProviders.filter(p => ["available", "configured"].includes(p.status)).length,
      planned: operationalProviders.filter(p => ["planned", "requires_local"].includes(p.status)).length,
      missingConfig: missingConfiguration.length,
    },
    capabilities: {
      total: CAPABILITIES.length,
      available: CAPABILITIES.filter(c => c.status === "available").length,
      planned: CAPABILITIES.filter(c => c.status === "planned").length,
    },
    freeProvidersAvailable: availableFree.map(p => p.id),
    missingConfiguration,
    limitations: [
      "video.generate: Remotion planned, not yet connected",
      "audio.music.generate: MusicGen planned, requires local GPU — NOT available on Railway",
      "voice.transcribe: Whisper planned, requires local worker",
      "audio.synthesize: Piper planned, requires local installation",
      "automation.workflow: n8n planned, self-hosted",
      "search.web: DuckDuckGo/Tavily planned",
    ],
    honestyNote: "TAMS never pretends to generate video/music if provider is not connected. All planned features are clearly marked.",
  });
});

// ─── Provider Health Check ──────────────────────────────────────────────────

router.post("/registry/providers/:id/check", async (req, res) => {
  const provider = PROVIDERS[req.params.id];
  if (!provider) {
    return res.status(404).json({ error: "Provider not found" });
  }

  if (!provider.baseUrl) {
    return res.json({
      provider: provider.id,
      status: "no_url",
      message: "Local/internal provider, no HTTP endpoint",
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(provider.baseUrl, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    return res.json({
      provider: provider.id,
      status: response.ok ? "healthy" : "unhealthy",
      httpStatus: response.status,
    });
  } catch (error) {
    return res.json({
      provider: provider.id,
      status: "unreachable",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
