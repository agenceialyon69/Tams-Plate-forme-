export type ProviderPriority = "P0" | "P1" | "P2";
export type ProviderStatus = "configured" | "missing_config" | "free_builtin" | "local_runtime";
export type ProviderCategory =
  | "llm"
  | "image"
  | "video"
  | "audio"
  | "voice"
  | "vision"
  | "memory"
  | "search"
  | "workflow"
  | "observability"
  | "gateway"
  | "devops"
  | "storage";

export type ProviderSpec = {
  id: string;
  label: string;
  priority: ProviderPriority;
  category: ProviderCategory;
  env: string[];
  capabilities: string[];
  status: ProviderStatus;
  configured: boolean;
  freeFirstRole: string;
  fallbackStrategy: string;
  notes?: string;
};

export type CapabilityVerdict = "PASS" | "WARN" | "FAIL";

export type CapabilityStatus = {
  id: string;
  label: string;
  verdict: CapabilityVerdict;
  providers: string[];
  evidence: string;
  risk?: string;
  nextAction?: string;
};

const env = (name: string): string | undefined => {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
};

const hasAny = (keys: string[]): boolean => keys.some(key => !!env(key));
const configuredProviders = (providers: ProviderSpec[]): string[] => providers.filter(p => p.configured).map(p => p.id);
const hasProvider = (providers: ProviderSpec[], ids: string[]): boolean => providers.some(p => ids.includes(p.id) && p.configured);

export function operatingMode(): "free_personal" | "paid_controlled" | "multi_tenant" {
  const mode = (env("TAMS_OPERATING_MODE") || "free_personal").toLowerCase();
  if (mode === "multi_tenant") return "multi_tenant";
  if (mode === "paid_controlled") return "paid_controlled";
  return "free_personal";
}

export function paidProvidersAllowed(): boolean {
  return operatingMode() !== "free_personal" && env("TAMS_ALLOW_PAID_PROVIDERS") === "true";
}

function spec(input: Omit<ProviderSpec, "configured" | "status"> & { builtin?: boolean; local?: boolean }): ProviderSpec {
  const configured = !!input.builtin || !!input.local || hasAny(input.env);
  const status: ProviderStatus = input.builtin
    ? "free_builtin"
    : input.local
      ? "local_runtime"
      : configured
        ? "configured"
        : "missing_config";

  return {
    id: input.id,
    label: input.label,
    priority: input.priority,
    category: input.category,
    env: input.env,
    capabilities: input.capabilities,
    status,
    configured,
    freeFirstRole: input.freeFirstRole,
    fallbackStrategy: input.fallbackStrategy,
    notes: input.notes,
  };
}

export function providerRegistry(): ProviderSpec[] {
  return [
    spec({
      id: "gemini",
      label: "Gemini",
      priority: "P0",
      category: "llm",
      env: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
      capabilities: ["llm", "reasoning", "vision", "image", "tts", "embeddings", "tools"],
      freeFirstRole: "Primary free-first multimodal brain using Flash-class models only in free_personal mode.",
      fallbackStrategy: "Fallback to Groq for fast text/voice, OpenRouter free models for LLM routing, Pollinations/FFmpeg for free media.",
      notes: "Do not use Pro/Veo/paid models in free_personal mode. Override model names through GEMINI_MODEL_* only with free/allowed models.",
    }),
    spec({
      id: "groq",
      label: "Groq",
      priority: "P0",
      category: "llm",
      env: ["GROQ_API_KEY"],
      capabilities: ["llm_fast", "stt", "tts", "tool_use", "realtime"],
      freeFirstRole: "Low-latency free-first text, speech-to-text, text-to-speech and realtime assistant lane.",
      fallbackStrategy: "Fallback to Gemini/OpenRouter for text and missing_config for voice if no speech provider is configured.",
      notes: "Keep usage within free-tier/quota until the project is personally validated.",
    }),
    spec({
      id: "openrouter",
      label: "OpenRouter",
      priority: "P0",
      category: "gateway",
      env: ["OPENROUTER_API_KEY", "OPENROUTE_API_KEY"],
      capabilities: ["llm_router", "fallback", "free_models", "model_catalog"],
      freeFirstRole: "Unified LLM fallback/router using :free model variants first.",
      fallbackStrategy: "Fallback to direct Gemini/Groq/Hugging Face providers or honest AI_NOT_CONFIGURED.",
      notes: "In free_personal mode, configure OPENROUTER_MODEL_* only with :free models.",
    }),
    spec({
      id: "huggingface",
      label: "Hugging Face",
      priority: "P0",
      category: "llm",
      env: ["HF_TOKEN", "HUGGINGFACE_API_KEY"],
      capabilities: ["llm", "image", "audio", "stt", "model_sandbox", "inference_providers"],
      freeFirstRole: "Open-source model sandbox and secondary media/model provider through one token.",
      fallbackStrategy: "Fallback to Gemini/Groq/OpenRouter/Pollinations depending on task.",
      notes: "Use free quota and lightweight inference first; avoid paid dedicated endpoints in free_personal mode.",
    }),
    spec({
      id: "database",
      label: "PostgreSQL",
      priority: "P0",
      category: "memory",
      env: ["DATABASE_URL", "POSTGRES_URL", "PGDATABASE"],
      capabilities: ["persistence", "memory", "jobs", "audit_logs"],
      freeFirstRole: "Durable platform state, logs, memory records and job tracking.",
      fallbackStrategy: "No durable fallback; DB outage should degrade platform and block unsafe writes.",
    }),
    spec({
      id: "pgvector",
      label: "pgvector",
      priority: "P0",
      category: "memory",
      env: ["DATABASE_URL", "POSTGRES_URL"],
      capabilities: ["semantic_memory", "rag", "vector_search"],
      freeFirstRole: "Semantic memory on the existing PostgreSQL database before adding any paid vector DB.",
      fallbackStrategy: "Fallback to keyword search/log history until vector extension and tables are verified.",
      notes: "Configured means database is present; extension/table verification must be done by migration or readiness DB check.",
    }),
    spec({
      id: "ffmpeg",
      label: "FFmpeg",
      priority: "P0",
      category: "video",
      env: [],
      capabilities: ["video_edit", "photo_to_video", "mp4_export", "audio_fallback"],
      freeFirstRole: "Guaranteed local media backbone for montage, photo-to-video and MP4 fallback on Railway.",
      fallbackStrategy: "No external cost fallback; if FFmpeg missing, Studio media export must fail clearly.",
      local: true,
    }),
    spec({
      id: "pollinations",
      label: "Pollinations",
      priority: "P0",
      category: "image",
      env: [],
      capabilities: ["image_fallback", "text_fallback", "community_media"],
      freeFirstRole: "No-key community fallback for image generation and degraded Studio output.",
      fallbackStrategy: "Fallback from Gemini/Hugging Face image lanes; never label as premium.",
      builtin: true,
    }),
    spec({
      id: "github",
      label: "GitHub",
      priority: "P0",
      category: "devops",
      env: ["GITHUB_TOKEN", "GITHUB_PAT"],
      capabilities: ["repo_read", "pr_ops", "release_traceability"],
      freeFirstRole: "Repository source of truth, PR discipline and release traceability.",
      fallbackStrategy: "Read-only/manual GitHub workflow if token missing; never auto-push to main.",
    }),
    spec({
      id: "railway",
      label: "Railway",
      priority: "P0",
      category: "devops",
      env: ["RAILWAY_ENVIRONMENT", "RAILWAY_SERVICE_NAME", "RAILWAY_GIT_COMMIT_SHA", "RAILWAY_TOKEN"],
      capabilities: ["deployment", "runtime", "production_sha"],
      freeFirstRole: "Production runtime and deployment SHA truth source.",
      fallbackStrategy: "Local/dev mode only; production readiness cannot PASS without deployed SHA verification.",
    }),
    spec({
      id: "tavily",
      label: "Tavily",
      priority: "P1",
      category: "search",
      env: ["TAVILY_API_KEY"],
      capabilities: ["web_search", "agent_search", "extract", "crawl"],
      freeFirstRole: "Optional free-tier web search lane after P0 is stable; not required for personal validation.",
      fallbackStrategy: "Fallback to existing LLM context/search capabilities or missing_config for research-specific workflows.",
      notes: "Do not block platform PASS on Tavily in free_personal mode.",
    }),
    spec({
      id: "firecrawl",
      label: "Firecrawl",
      priority: "P1",
      category: "search",
      env: ["FIRECRAWL_API_KEY"],
      capabilities: ["scrape", "crawl", "browser_sandbox", "structured_extraction"],
      freeFirstRole: "Optional free-tier web extraction after P0 is stable; not required for personal validation.",
      fallbackStrategy: "Fallback to Tavily extract/Gemini URL context; never pretend browser automation works if missing.",
      notes: "Do not block platform PASS on Firecrawl in free_personal mode.",
    }),
    spec({
      id: "langfuse",
      label: "Langfuse",
      priority: "P1",
      category: "observability",
      env: ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_HOST"],
      capabilities: ["llm_tracing", "prompt_tracing", "cost_tracking", "latency_tracking"],
      freeFirstRole: "Optional free-tier observability after core flows are stable.",
      fallbackStrategy: "Fallback to structured server logs; do not block personal validation.",
      notes: "Useful later, not a current budget requirement.",
    }),
    spec({
      id: "n8n",
      label: "n8n",
      priority: "P1",
      category: "workflow",
      env: ["N8N_WEBHOOK_URL", "N8N_API_URL", "N8N_API_KEY", "WORKFLOW_PROVIDER"],
      capabilities: ["workflows", "webhooks", "async_automation"],
      freeFirstRole: "Optional self-hosted workflow execution layer for async tasks, notifications and integrations.",
      fallbackStrategy: "Fallback to internal jobs/manual workflows; never claim automation if n8n is not configured.",
      notes: "Use self-host/free-first only; no n8n Cloud dependency while budget is zero.",
    }),
    spec({
      id: "cloudflare_ai_gateway",
      label: "Cloudflare AI Gateway",
      priority: "P2",
      category: "gateway",
      env: ["CLOUDFLARE_AI_GATEWAY_URL", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"],
      capabilities: ["ai_gateway", "analytics", "rate_limits", "cache", "retries"],
      freeFirstRole: "Future optional gateway for provider analytics, cache, retries and centralized rate limits.",
      fallbackStrategy: "Fallback to direct provider calls; do not block platform readiness if absent.",
      notes: "Not part of the current zero-budget personal phase.",
    }),
    spec({
      id: "comfyui",
      label: "ComfyUI Worker",
      priority: "P2",
      category: "video",
      env: ["COMFYUI_BASE_URL", "COMFYUI_API_KEY"],
      capabilities: ["image_premium", "video_premium", "workflow_media", "gpu_worker"],
      freeFirstRole: "Future external GPU worker for open-source premium image/video pipelines.",
      fallbackStrategy: "Fallback to FFmpeg/Pollinations; never run heavy GPU models inside the main Railway service.",
      notes: "Explicitly deferred until the personal platform is stable and a budget is selected.",
    }),
    spec({
      id: "studio_gpu_workers",
      label: "Studio GPU Workers",
      priority: "P2",
      category: "video",
      env: ["STUDIO_GPU_VIDEO_URL", "STUDIO_GPU_AUDIO_URL", "STUDIO_GPU_IMAGE_URL", "STUDIO_GPU_VOICE_URL", "STUDIO_GPU_VISION_URL", "STUDIO_GPU_GENERAL_URL"],
      capabilities: ["premium_video", "premium_audio", "premium_image", "premium_voice", "premium_vision"],
      freeFirstRole: "Future premium lane for heavy generation while keeping Railway as orchestrator.",
      fallbackStrategy: "Fallback to local FFmpeg/audio/image fallbacks and return missing_config for premium buttons.",
      notes: "Explicitly deferred in free_personal mode.",
    }),
    spec({
      id: "runware",
      label: "Runware",
      priority: "P2",
      category: "image",
      env: ["RUNWARE_API_KEY"],
      capabilities: ["image_premium", "video_secondary", "media_api"],
      freeFirstRole: "Future low-cost secondary media provider for controlled experiments.",
      fallbackStrategy: "Fallback to Gemini/HF/Pollinations/FFmpeg depending on media task.",
      notes: "Not part of the current zero-budget personal phase.",
    }),
    spec({
      id: "r2_storage",
      label: "Cloudflare R2 / S3 Storage",
      priority: "P2",
      category: "storage",
      env: ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "S3_BUCKET", "S3_ENDPOINT"],
      capabilities: ["durable_media", "uploads", "generated_assets"],
      freeFirstRole: "Future durable storage for generated videos/images/audio after local /tmp export.",
      fallbackStrategy: "Fallback to temporary local media URLs with clear non-durable warning.",
      notes: "Not required while the project remains personal and validation-focused.",
    }),
  ];
}

function byCapability(providers: ProviderSpec[], capability: string): string[] {
  return providers.filter(p => p.configured && p.capabilities.includes(capability)).map(p => p.id);
}

export function platformCapabilities(): CapabilityStatus[] {
  const providers = providerRegistry();
  const llmProviders = configuredProviders(providers.filter(p => p.capabilities.some(c => c.startsWith("llm") || c === "reasoning")));
  const imageProviders = [
    ...byCapability(providers, "image"),
    ...byCapability(providers, "image_fallback"),
  ];
  const premiumVideoProviders = paidProvidersAllowed()
    ? [
        ...byCapability(providers, "video_premium"),
        ...byCapability(providers, "premium_video"),
      ]
    : [];

  return [
    {
      id: "llm_core",
      label: "LLM / Chat / Reasoning",
      verdict: llmProviders.length > 0 ? "PASS" : "FAIL",
      providers: llmProviders,
      evidence: llmProviders.length > 0 ? `Configured LLM lanes: ${llmProviders.join(", ")}` : "No LLM provider configured.",
      risk: llmProviders.length === 1 ? "Single-provider dependency; acceptable for personal validation but not for multi-tenant." : undefined,
      nextAction: llmProviders.length > 0 ? "Use only free/allowed models and keep provider calls routed through the AI router." : "Configure at least one free-first provider: GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, or HF_TOKEN.",
    },
    {
      id: "multimodal",
      label: "Multimodal / Vision / Documents",
      verdict: hasProvider(providers, ["gemini"]) ? "PASS" : hasProvider(providers, ["huggingface", "groq"]) ? "WARN" : "FAIL",
      providers: configuredProviders(providers.filter(p => ["gemini", "huggingface", "groq"].includes(p.id))),
      evidence: hasProvider(providers, ["gemini"]) ? "Gemini configured for free-first multimodal/vision/document workflows." : "Gemini is missing; multimodal capability is degraded.",
      nextAction: "Keep Gemini Flash-class models as the primary personal multimodal lane; do not use Pro/Veo until paid_controlled mode is chosen.",
    },
    {
      id: "image_generation",
      label: "Image Generation",
      verdict: imageProviders.some(p => p !== "pollinations") ? "PASS" : "WARN",
      providers: Array.from(new Set(imageProviders)),
      evidence: imageProviders.some(p => p !== "pollinations") ? `Image providers available: ${Array.from(new Set(imageProviders)).join(", ")}` : "Only Pollinations free fallback is guaranteed.",
      risk: imageProviders.every(p => p === "pollinations") ? "Community fallback only, not a premium SLA." : undefined,
      nextAction: "Use Gemini/HF if already configured, Pollinations as honest fallback. Do not add paid image providers yet.",
    },
    {
      id: "video_generation",
      label: "Video / Studio Media",
      verdict: "WARN",
      providers: Array.from(new Set(["ffmpeg", ...premiumVideoProviders])),
      evidence: premiumVideoProviders.length > 0 ? `Premium video lanes configured but ignored unless paid providers are allowed: ${premiumVideoProviders.join(", ")}; FFmpeg remains fallback.` : "Free-personal mode: FFmpeg local media backbone only. Premium GPU/video providers are deferred.",
      risk: "AI video premium is expensive/heavy and is not part of the zero-budget personal phase.",
      nextAction: "Stabilize FFmpeg MP4 output, montage, and photo-to-video first. Return missing_config for premium video buttons.",
    },
    {
      id: "voice_audio",
      label: "Voice / STT / TTS / Audio",
      verdict: hasProvider(providers, ["groq", "gemini", "huggingface"]) ? "PASS" : "FAIL",
      providers: configuredProviders(providers.filter(p => ["groq", "gemini", "huggingface"].includes(p.id))),
      evidence: hasProvider(providers, ["groq"]) ? "Groq configured for low-latency STT/TTS lane." : "Groq missing; voice/audio fallback depends on Gemini/HF or local audio.",
      nextAction: "Use Groq/Gemini/HF free-first if configured; otherwise return clear missing_config.",
    },
    {
      id: "memory_rag",
      label: "Memory / RAG",
      verdict: hasProvider(providers, ["database"]) ? "WARN" : "FAIL",
      providers: configuredProviders(providers.filter(p => ["database", "pgvector"].includes(p.id))),
      evidence: hasProvider(providers, ["database"]) ? "Database configured; pgvector migration/extension verification still required." : "No durable database configured.",
      risk: "Without pgvector migration checks, semantic memory may be decorative.",
      nextAction: "Enable/verify pgvector and embedding tables on the existing DB before adding any paid vector database.",
    },
    {
      id: "web_research",
      label: "Web Research / Extraction",
      verdict: hasProvider(providers, ["tavily", "firecrawl"]) ? "WARN" : hasProvider(providers, ["gemini", "openrouter"]) ? "WARN" : "FAIL",
      providers: configuredProviders(providers.filter(p => ["tavily", "firecrawl", "gemini", "openrouter"].includes(p.id))),
      evidence: hasProvider(providers, ["tavily", "firecrawl"]) ? "Dedicated search/extraction provider configured, but still optional in free_personal mode." : "No dedicated web extraction provider configured; acceptable for personal phase if core platform works.",
      nextAction: "Do not block the platform on Tavily/Firecrawl. Add them later only if free-tier signup is acceptable and P0 is stable.",
    },
    {
      id: "observability",
      label: "AI Observability",
      verdict: hasProvider(providers, ["langfuse", "cloudflare_ai_gateway"]) ? "WARN" : "WARN",
      providers: configuredProviders(providers.filter(p => ["langfuse", "cloudflare_ai_gateway"].includes(p.id))),
      evidence: hasProvider(providers, ["langfuse", "cloudflare_ai_gateway"]) ? "AI traces/gateway telemetry configured, but optional in personal mode." : "No dedicated AI observability provider configured; use structured logs first.",
      risk: "Without traces, provider failures are harder to debug, but this should not create a budget obligation today.",
      nextAction: "Use structured logs/readiness first. Add Langfuse later only when the platform is stable.",
    },
    {
      id: "automation",
      label: "Workflow Automation",
      verdict: hasProvider(providers, ["n8n"]) ? "WARN" : "WARN",
      providers: configuredProviders(providers.filter(p => p.id === "n8n")),
      evidence: hasProvider(providers, ["n8n"]) ? "n8n configured as external workflow lane." : "n8n missing_config; internal/manual workflows only.",
      nextAction: "Keep TAMS usable without n8n. Add self-hosted n8n later only if it helps personal workflows.",
    },
  ];
}

export function providerSummary() {
  const providers = providerRegistry();
  const capabilities = platformCapabilities();
  const p0 = providers.filter(p => p.priority === "P0");
  const missingP0 = p0.filter(p => !p.configured && p.status !== "free_builtin" && p.status !== "local_runtime");
  const failedCapabilities = capabilities.filter(c => c.verdict === "FAIL");
  const warnCapabilities = capabilities.filter(c => c.verdict === "WARN");
  const mode = operatingMode();

  const p0FreeFirstEnv = [
    "GEMINI_API_KEY",
    "GROQ_API_KEY",
    "OPENROUTER_API_KEY",
    "HF_TOKEN",
    "DATABASE_URL",
  ].filter(key => !env(key));

  const optionalFreeLaterEnv = [
    "TAVILY_API_KEY",
    "FIRECRAWL_API_KEY",
    "LANGFUSE_PUBLIC_KEY",
    "LANGFUSE_SECRET_KEY",
    "LANGFUSE_HOST",
    "N8N_WEBHOOK_URL",
  ].filter(key => !env(key));

  return {
    verdict: failedCapabilities.length > 0 ? "FAIL" : warnCapabilities.length > 0 || missingP0.length > 0 ? "WARN" : "PASS",
    operatingMode: mode,
    paidProvidersAllowed: paidProvidersAllowed(),
    providers,
    capabilities,
    missingP0: missingP0.map(p => p.id),
    configured: providers.filter(p => p.configured).map(p => p.id),
    recommendedNextEnv: mode === "free_personal" ? p0FreeFirstEnv : [...p0FreeFirstEnv, ...optionalFreeLaterEnv],
    optionalFreeLaterEnv,
    deferredPaidOrScaleEnv: [
      "COMFYUI_BASE_URL",
      "RUNWARE_API_KEY",
      "STUDIO_GPU_VIDEO_URL",
      "R2_ACCOUNT_ID",
      "CLOUDFLARE_AI_GATEWAY_URL",
      "QDRANT_URL",
    ].filter(key => !env(key)),
    rules: [
      "Current mode is personal validation, not multi-tenant production.",
      "No paid provider is required while operatingMode=free_personal.",
      "Premium media must return missing_config unless paid providers are explicitly allowed.",
      "Move to paid_controlled only after the personal platform is stable and a monthly budget is chosen.",
      "Move to multi_tenant only after auth, quotas, billing, isolation and data retention are validated.",
    ],
  };
}
