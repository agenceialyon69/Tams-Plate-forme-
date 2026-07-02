import { Router } from "express";
import { existsSync } from "node:fs";

const router = Router();

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

const P: Record<string, Provider> = {
  groq: { id: "groq", name: "Groq", type: "free", status: "available", baseUrl: "https://api.groq.com/openai/v1", requiresAuth: true, authType: "api_key" },
  gemini: { id: "gemini", name: "Google Gemini", type: "freemium", status: "available", baseUrl: "https://generativelanguage.googleapis.com/v1beta", requiresAuth: true, authType: "api_key" },
  huggingface: { id: "huggingface", name: "Hugging Face", type: "free", status: "available", baseUrl: "https://api-inference.huggingface.co/models", requiresAuth: true, authType: "api_key" },
  openrouter: { id: "openrouter", name: "OpenRouter", type: "freemium", status: "available", baseUrl: "https://openrouter.ai/api/v1", requiresAuth: true, authType: "api_key" },
  ollama: { id: "ollama", name: "Ollama Local", type: "free", status: "planned", baseUrl: "http://localhost:11434", requiresAuth: false, authType: "none" },
  pollinations: { id: "pollinations", name: "Pollinations", type: "free", status: "available", baseUrl: "https://image.pollinations.ai", requiresAuth: false, authType: "none" },
  comfyui: { id: "comfyui", name: "ComfyUI Local", type: "free", status: "planned", requiresAuth: false, authType: "none" },
  huggingface_image: { id: "huggingface_image", name: "Hugging Face Image", type: "free", status: "available", baseUrl: "https://api-inference.huggingface.co/models", requiresAuth: true, authType: "api_key" },
  whisper: { id: "whisper", name: "Whisper Bridge", type: "free", status: "available", requiresAuth: false, authType: "none", notes: "External worker bridge for speech-to-text" },
  piper: { id: "piper", name: "Piper Bridge", type: "free", status: "available", requiresAuth: false, authType: "none", notes: "External worker bridge for text-to-speech" },
  edge_tts: { id: "edge_tts", name: "Edge TTS Bridge", type: "free", status: "available", requiresAuth: false, authType: "none" },
  ffmpeg: { id: "ffmpeg", name: "FFmpeg", type: "free", status: "available", requiresAuth: false, authType: "none" },
  remotion: { id: "remotion", name: "Remotion Bridge", type: "free", status: "available", requiresAuth: false, authType: "none", notes: "Optional worker; FFmpeg is the safe default video generator" },
  musicgen: { id: "musicgen", name: "MusicGen Bridge", type: "free", status: "available", requiresAuth: false, authType: "none", notes: "Hugging Face or external worker bridge" },
  riffusion: { id: "riffusion", name: "Riffusion", type: "free", status: "experimental", requiresAuth: false, authType: "none" },
  n8n: { id: "n8n", name: "n8n Webhook", type: "free", status: "available", requiresAuth: true, authType: "api_key" },
  duckduckgo: { id: "duckduckgo", name: "DuckDuckGo", type: "free", status: "available", baseUrl: "https://api.duckduckgo.com", requiresAuth: false, authType: "none" },
  tavily: { id: "tavily", name: "Tavily", type: "freemium", status: "available", baseUrl: "https://api.tavily.com", requiresAuth: true, authType: "api_key" },
  railway: { id: "railway", name: "Railway", type: "freemium", status: "available", requiresAuth: true, authType: "api_key" },
  github: { id: "github", name: "GitHub", type: "free", status: "available", baseUrl: "https://api.github.com", requiresAuth: true, authType: "api_key" },
};

function hfConfigured() { return !!(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY); }

function providerOperationalStatus(provider: Provider): Provider["status"] {
  const env: Record<string, boolean> = {
    groq: !!process.env.GROQ_API_KEY,
    gemini: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    huggingface: hfConfigured(),
    huggingface_image: hfConfigured(),
    openrouter: !!(process.env.OPENROUTER_API_KEY || process.env.OPENROUTE_API_KEY),
    github: !!process.env.GITHUB_TOKEN,
    railway: !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME || process.env.RAILWAY_TOKEN),
    tavily: !!process.env.TAVILY_API_KEY,
    n8n: !!process.env.N8N_WEBHOOK_URL,
    whisper: !!(process.env.WHISPER_WORKER_URL || process.env.STT_WORKER_URL),
    piper: !!(process.env.PIPER_WORKER_URL || process.env.TTS_WORKER_URL || process.env.EDGE_TTS_WORKER_URL),
    edge_tts: !!process.env.EDGE_TTS_WORKER_URL,
    musicgen: !!(process.env.MUSICGEN_WORKER_URL || hfConfigured()),
    remotion: !!process.env.REMOTION_WORKER_URL,
  };
  if (provider.id === "duckduckgo") return "available";
  if (provider.id === "ffmpeg") return existsSync("/usr/bin/ffmpeg") || existsSync("/usr/local/bin/ffmpeg") || !!process.env.RAILWAY_ENVIRONMENT ? "available" : "missing_config";
  if (provider.id === "remotion") return env.remotion ? "configured" : providerOperationalStatus(P.ffmpeg) === "available" ? "available" : "missing_config";
  if (provider.id in env) return env[provider.id] ? "configured" : "missing_config";
  if (["comfyui", "ollama"].includes(provider.id)) return "requires_local";
  return provider.status;
}

function operationalProvider(provider: Provider): Provider {
  const status = providerOperationalStatus(provider);
  return { ...provider, status, notes: `${provider.notes ?? ""} Operational status: ${status}.`.trim() };
}

const CAPABILITIES: Capability[] = [
  { id: "text.generate", label: "Text Generation", description: "Generate text content using LLMs", category: "text", riskLevel: "low", requiredPermission: "authenticated", providers: [P.groq, P.gemini, P.huggingface, P.openrouter, P.ollama], fallbackBehavior: "fallback_free", status: "available" },
  { id: "text.analyze", label: "Text Analysis", description: "Analyze text", category: "text", riskLevel: "low", requiredPermission: "authenticated", providers: [P.groq, P.gemini, P.huggingface], fallbackBehavior: "fallback_free", status: "available" },
  { id: "text.translate", label: "Translation", description: "Translate text", category: "text", riskLevel: "low", requiredPermission: "authenticated", providers: [P.gemini, P.huggingface], fallbackBehavior: "fallback_free", status: "available" },
  { id: "studio.analyze", label: "Studio Analysis", description: "Analyze creative project requirements", category: "analysis", riskLevel: "low", requiredPermission: "authenticated", providers: [P.groq, P.gemini], fallbackBehavior: "fallback_free", status: "available" },
  { id: "studio.generate", label: "Studio Generate", description: "Orchestrate creative content", category: "text", riskLevel: "low", requiredPermission: "authenticated", providers: [P.groq, P.gemini], fallbackBehavior: "fallback_free", status: "available" },
  { id: "studio.brief.generate", label: "Brief Generation", description: "Generate creative briefs", category: "text", riskLevel: "low", requiredPermission: "authenticated", providers: [P.groq, P.gemini], fallbackBehavior: "fallback_free", status: "available" },
  { id: "studio.script.generate", label: "Script Writing", description: "Generate scripts", category: "text", riskLevel: "low", requiredPermission: "authenticated", providers: [P.groq, P.gemini], fallbackBehavior: "fallback_free", status: "available" },
  { id: "studio.storyboard.generate", label: "Storyboard Planning", description: "Generate storyboard outlines", category: "text", riskLevel: "low", requiredPermission: "authenticated", providers: [P.groq, P.gemini], fallbackBehavior: "fallback_free", status: "available" },
  { id: "studio.prompt.generate", label: "Prompt Engineering", description: "Optimize prompts", category: "text", riskLevel: "low", requiredPermission: "authenticated", providers: [P.groq, P.gemini], fallbackBehavior: "fallback_free", status: "available" },
  { id: "studio.caption.generate", label: "Caption Generation", description: "Generate captions", category: "text", riskLevel: "low", requiredPermission: "authenticated", providers: [P.groq, P.gemini], fallbackBehavior: "fallback_free", status: "available" },
  { id: "studio.document.generate", label: "Document Generation", description: "Generate documents", category: "text", riskLevel: "low", requiredPermission: "authenticated", providers: [P.groq, P.gemini], fallbackBehavior: "fallback_free", status: "available" },
  { id: "studio.video.edit.plan", label: "Video Edit Plan", description: "Plan video edits", category: "video", riskLevel: "low", requiredPermission: "authenticated", providers: [P.groq, P.gemini, P.ffmpeg], fallbackBehavior: "fallback_free", status: "available" },
  { id: "studio.music.plan", label: "Music Plan", description: "Plan music direction", category: "audio", riskLevel: "low", requiredPermission: "authenticated", providers: [P.groq, P.gemini], fallbackBehavior: "fallback_free", status: "available" },
  { id: "studio.export.social", label: "Social Export Plan", description: "Export recommendations", category: "text", riskLevel: "low", requiredPermission: "authenticated", providers: [P.groq, P.gemini], fallbackBehavior: "fallback_free", status: "available" },
  { id: "image.generate", label: "Image Generation", description: "Generate images", category: "image", riskLevel: "medium", requiredPermission: "authenticated", providers: [P.pollinations, P.huggingface_image, P.comfyui], fallbackBehavior: "fallback_free", status: "available" },
  { id: "image.analyze", label: "Image Analysis", description: "Analyze images", category: "image", riskLevel: "low", requiredPermission: "authenticated", providers: [P.gemini, P.huggingface], fallbackBehavior: "fallback_free", status: "available" },
  { id: "voice.transcribe", label: "Speech to Text", description: "Transcribe audio", category: "audio", riskLevel: "low", requiredPermission: "authenticated", providers: [P.whisper, P.huggingface], fallbackBehavior: "fail", status: "available", validationNotes: "Handler connected; needs audio URL and worker for stable production" },
  { id: "audio.synthesize", label: "Text to Speech", description: "Convert text to speech", category: "audio", riskLevel: "low", requiredPermission: "authenticated", providers: [P.piper, P.edge_tts], fallbackBehavior: "fail", status: "available", validationNotes: "Handler connected; needs TTS worker URL" },
  { id: "audio.music.generate", label: "Music Generation", description: "Generate music", category: "audio", riskLevel: "medium", requiredPermission: "approved", providers: [P.musicgen, P.huggingface, P.riffusion], fallbackBehavior: "fallback_free", status: "available", validationNotes: "MusicGen connected through Hugging Face or worker" },
  { id: "video.edit", label: "Video Editing", description: "Edit videos", category: "video", riskLevel: "medium", requiredPermission: "authenticated", providers: [P.ffmpeg], fallbackBehavior: "fail", status: "available" },
  { id: "video.generate", label: "Video Generation", description: "Generate MP4 videos", category: "video", riskLevel: "high", requiredPermission: "approved", providers: [P.ffmpeg, P.remotion, P.pollinations], fallbackBehavior: "fallback_free", status: "available", validationNotes: "Real FFmpeg MP4 generation connected" },
  { id: "repo.audit", label: "Repository Audit", description: "Analyze codebase", category: "analysis", riskLevel: "low", requiredPermission: "authenticated", providers: [P.github], fallbackBehavior: "fail", status: "available" },
  { id: "repo.validate", label: "Repository Validation", description: "Run validation", category: "analysis", riskLevel: "low", requiredPermission: "authenticated", providers: [], fallbackBehavior: "fail", status: "available" },
  { id: "repo.patch", label: "Repository Patch", description: "Patch repository files", category: "analysis", riskLevel: "high", requiredPermission: "approved", providers: [P.github], fallbackBehavior: "fail", status: "available" },
  { id: "search.web", label: "Web Search", description: "Search the web", category: "text", riskLevel: "low", requiredPermission: "authenticated", providers: [P.duckduckgo, P.tavily], fallbackBehavior: "fallback_free", status: "available", validationNotes: "DuckDuckGo connected; Tavily optional" },
  { id: "memory.query", label: "Memory Query", description: "Query memory", category: "analysis", riskLevel: "low", requiredPermission: "authenticated", providers: [], fallbackBehavior: "fail", status: "available" },
  { id: "deploy.check", label: "Deployment Check", description: "Validate Railway readiness", category: "analysis", riskLevel: "low", requiredPermission: "authenticated", providers: [P.railway], fallbackBehavior: "fail", status: "available" },
  { id: "observe.health", label: "Health Monitoring", description: "Check system health", category: "analysis", riskLevel: "low", requiredPermission: "none", providers: [], fallbackBehavior: "fail", status: "available" },
  { id: "automation.workflow", label: "Workflow Automation", description: "Run automated workflows", category: "automation", riskLevel: "medium", requiredPermission: "approved", providers: [P.n8n], fallbackBehavior: "fail", status: "available", validationNotes: "n8n webhook handler connected" },
];

export function getCapabilitiesByCategory(category: Capability["category"]): Capability[] { return CAPABILITIES.filter(c => c.category === category); }
export function getRuntimeSafeCapabilities(): Capability[] { return CAPABILITIES.filter(c => c.riskLevel === "low" && c.requiredPermission !== "admin"); }
export function getEnabledProviderIds(): string[] { return Object.values(P).filter(p => ["available", "configured"].includes(providerOperationalStatus(p))).map(p => p.id); }

function capabilityDto(capability: Capability) {
  const providerOk = capability.providers.some(provider => ["available", "configured"].includes(providerOperationalStatus(provider)));
  return { ...capability, declaredInCatalog: true, providerConfigured: providerOk, executableNow: capability.status === "available" && capability.id !== "repo.patch" && (capability.providers.length === 0 || providerOk), plannedOnly: capability.status === "planned", requiresLocal: capability.providers.some(provider => providerOperationalStatus(provider) === "requires_local"), readOnly: capability.id.startsWith("repo.") || capability.id === "deploy.check", disabled: capability.status === "disabled" };
}

router.get("/registry/capabilities", (_req, res) => {
  res.json({ capabilities: CAPABILITIES.map(capabilityDto), total: CAPABILITIES.length, available: CAPABILITIES.filter(c => c.status === "available").length, planned: CAPABILITIES.filter(c => c.status === "planned").length, experimental: CAPABILITIES.filter(c => c.status === "experimental").length });
});

router.get("/registry/capabilities/:id", (req, res) => {
  const capability = CAPABILITIES.find(c => c.id === req.params.id);
  if (!capability) return res.status(404).json({ error: "Capability not found" });
  return res.json(capabilityDto(capability));
});

router.get("/registry/providers", (_req, res) => {
  const providers = Object.values(P).map(operationalProvider);
  res.json({ providers, total: providers.length, available: providers.filter(p => ["available", "configured"].includes(p.status)).length, planned: providers.filter(p => ["planned", "requires_local"].includes(p.status)).length, free: providers.filter(p => p.type === "free").length });
});

router.get("/registry/providers/:id", (req, res) => {
  const provider = P[req.params.id];
  if (!provider) return res.status(404).json({ error: "Provider not found" });
  return res.json(operationalProvider(provider));
});

router.get("/registry/status", (_req, res) => {
  const providers = Object.values(P).map(operationalProvider);
  const freeProviders = providers.filter(p => p.type === "free");
  const availableFree = freeProviders.filter(p => ["available", "configured"].includes(p.status));
  const missingConfiguration = providers.filter(p => p.status === "missing_config").map(p => p.id);
  res.json({
    status: availableFree.length === 0 ? "offline" : missingConfiguration.length > 0 ? "partial" : "online",
    strategy: "free-first",
    principle: "Always prefer free/local providers over paid SaaS",
    providers: { total: providers.length, free: freeProviders.length, freemium: providers.filter(p => p.type === "freemium").length, paid: providers.filter(p => p.type === "paid").length, available: providers.filter(p => ["available", "configured"].includes(p.status)).length, planned: providers.filter(p => ["planned", "requires_local"].includes(p.status)).length, missingConfig: missingConfiguration.length },
    capabilities: { total: CAPABILITIES.length, available: CAPABILITIES.filter(c => c.status === "available").length, planned: CAPABILITIES.filter(c => c.status === "planned").length },
    freeProvidersAvailable: availableFree.map(p => p.id),
    missingConfiguration,
    limitations: [
      "video.generate: connected through real FFmpeg MP4 slideshow; Remotion remains optional worker upgrade",
      "audio.music.generate: connected through Hugging Face or MusicGen worker",
      "voice.transcribe: handler connected; requires audioUrl and worker for stable production",
      "audio.synthesize: handler connected; requires TTS worker URL",
      "automation.workflow: connected through n8n webhook URL",
      "search.web: connected through DuckDuckGo; Tavily optional",
    ],
    honestyNote: "TAMS exposes connected handlers and reports provider availability separately from optional worker configuration.",
  });
});

router.post("/registry/providers/:id/check", async (req, res) => {
  const provider = P[req.params.id];
  if (!provider) return res.status(404).json({ error: "Provider not found" });
  const status = providerOperationalStatus(provider);
  if (!provider.baseUrl || provider.baseUrl.includes("localhost")) return res.json({ provider: provider.id, status, message: "Local/internal/bridge provider" });
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const result = await fetch(provider.baseUrl, { method: "GET", signal: controller.signal });
    clearTimeout(timeout);
    return res.json({ provider: provider.id, status: result.ok ? "reachable" : "unreachable", httpStatus: result.status });
  } catch (err) {
    return res.json({ provider: provider.id, status: "error", message: err instanceof Error ? err.message : "Unknown error" });
  }
});

export default router;
