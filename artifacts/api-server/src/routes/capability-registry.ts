/**
 * Capability Registry for TAMS
 * Free-first AI capabilities with provider routing
 */

import { Router } from "express";

const router = Router();

// ─── Capability Types ───────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type CapabilityStatus = "available" | "planned" | "experimental" | "disabled";

export interface Provider {
  id: string;
  name: string;
  type: "free" | "freemium" | "paid";
  status: "available" | "planned" | "rate_limited" | "disabled";
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

  // === VIDEO/MEDIA PROVIDERS ===
  ffmpeg: {
    id: "ffmpeg",
    name: "FFmpeg (Local)",
    type: "free",
    status: "available",
    requiresAuth: false,
    authType: "none",
    notes: "Video encoding, conversion, trimming",
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
    notes: "AI music generation, requires GPU",
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
};

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
    validationNotes: "Pollinations primary (free, no auth), ComfyUI for local GPU",
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
    id: "audio.transcribe",
    label: "Speech to Text",
    description: "Transcribe audio to text",
    category: "audio",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [PROVIDERS.whisper],
    fallbackBehavior: "fail",
    status: "planned",
    validationNotes: "Local Whisper planned for offline transcription",
  },
  {
    id: "audio.synthesize",
    label: "Text to Speech",
    description: "Convert text to speech audio",
    category: "audio",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [PROVIDERS.piper],
    fallbackBehavior: "fail",
    status: "planned",
    validationNotes: "Local Piper TTS planned for offline synthesis",
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
    validationNotes: "MusicGen local GPU required, Riffusion experimental",
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
    validationNotes: "FFmpeg available for programmatic editing",
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
    validationNotes: "Remotion planned for React-based video generation",
  },

  // === ANALYSIS CAPABILITIES ===
  {
    id: "repo.audit",
    label: "Repository Audit",
    description: "Analyze codebase structure and quality",
    category: "analysis",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [],
    fallbackBehavior: "fail",
    status: "available",
    validationNotes: "Built-in Dev Runtime analysis",
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
    validationNotes: "Built-in Dev Runtime validation",
  },

  // === AUTOMATION CAPABILITIES ===
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
    validationNotes: "n8n integration planned for workflow automation",
  },

  // === SEARCH CAPABILITIES ===
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
    validationNotes: "Web search integration planned (DuckDuckGo, Tavily)",
  },

  // === MEMORY CAPABILITIES ===
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
    validationNotes: "Built-in memory system",
  },

  // === DEPLOYMENT CAPABILITIES ===
  {
    id: "deploy.check",
    label: "Deployment Check",
    description: "Validate Railway readiness",
    category: "analysis",
    riskLevel: "low",
    requiredPermission: "authenticated",
    providers: [],
    fallbackBehavior: "fail",
    status: "available",
    validationNotes: "Built-in Dev Runtime deploy check",
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
];

// ─── API Routes ─────────────────────────────────────────────────────────────

router.get("/registry/capabilities", (_req, res) => {
  res.json({
    capabilities: CAPABILITIES,
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
  res.json(capability);
});

router.get("/registry/providers", (_req, res) => {
  res.json({
    providers: Object.values(PROVIDERS),
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
  res.json(provider);
});

router.get("/registry/status", (_req, res) => {
  const freeProviders = Object.values(PROVIDERS).filter(p => p.type === "free");
  const availableFree = freeProviders.filter(p => p.status === "available");

  res.json({
    strategy: "free-first",
    principle: "Always prefer free/local providers over paid SaaS",
    providers: {
      total: Object.keys(PROVIDERS).length,
      free: freeProviders.length,
      freemium: Object.values(PROVIDERS).filter(p => p.type === "freemium").length,
      paid: Object.values(PROVIDERS).filter(p => p.type === "paid").length,
      available: Object.values(PROVIDERS).filter(p => p.status === "available").length,
      planned: Object.values(PROVIDERS).filter(p => p.status === "planned").length,
    },
    capabilities: {
      total: CAPABILITIES.length,
      available: CAPABILITIES.filter(c => c.status === "available").length,
      planned: CAPABILITIES.filter(c => c.status === "planned").length,
    },
    freeProvidersAvailable: availableFree.map(p => p.id),
    limitations: [
      "Video generation: Remotion planned, not available",
      "Music generation: MusicGen planned, requires local GPU",
      "Speech-to-text: Whisper planned for local processing",
      "Text-to-speech: Piper planned for local synthesis",
      "n8n workflows: Planned for automation",
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

    res.json({
      provider: provider.id,
      status: response.ok ? "healthy" : "unhealthy",
      httpStatus: response.status,
      responseTime: "N/A",
    });
  } catch (error) {
    res.json({
      provider: provider.id,
      status: "unreachable",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
