/**
 * Studio Orchestrator — transforms a creative request into a structured production plan.
 *
 * This module ONLY produces plans. It never claims to generate actual video/audio
 * if the required provider is not connected. Honest limitations are always included.
 */

import type {
  StudioRequest,
  StudioPlan,
  StudioAssetPlan,
  StudioProductionStep,
  StudioPlatform,
} from "./studio-types";

// Provider availability truth table — must match capability-registry.ts
const PROVIDER_STATUS = {
  groq: "available",
  gemini: "available",
  pollinations: "available",
  huggingface: "available",
  ffmpeg: "available",
  remotion: "planned",
  musicgen: "requires_local_gpu",
  riffusion: "experimental",
  whisper: "planned",
  piper: "planned",
  comfyui: "planned",
} as const;

type ProviderKey = keyof typeof PROVIDER_STATUS;
type ProviderStatus = (typeof PROVIDER_STATUS)[ProviderKey];

function providerStatus(id: string): ProviderStatus {
  return (PROVIDER_STATUS as Record<string, ProviderStatus>)[id] ?? "planned";
}

function platformExportTargets(platform: string): string[] {
  const targets: Record<string, string[]> = {
    tiktok: ["MP4 9:16, max 60s, 1080x1920", "SRT subtitles file", "Cover image 1:1"],
    instagram: ["Reel MP4 9:16, max 90s", "Feed post 4:5 or 1:1", "Story 9:16"],
    youtube: ["MP4 16:9, 1080p or 4K", "Thumbnail 1280x720", "SRT captions"],
    twitter: ["MP4 16:9, max 140s", "GIF preview", "Alt text"],
    linkedin: ["MP4 16:9 or 1:1", "PDF document option"],
    podcast: ["MP3 or AAC audio", "Cover art 3000x3000", "RSS feed entry"],
    document: ["PDF", "DOCX", "Markdown"],
  };
  return targets[platform] ?? ["Output format to be determined based on target platform"];
}

function buildLimitations(steps: StudioProductionStep[]): string[] {
  const limitations: string[] = [];
  for (const step of steps) {
    if (step.providerStatus === "planned") {
      limitations.push(
        `${step.name}: ${step.provider} is planned but not yet connected. This step will produce a plan only.`,
      );
    } else if (step.providerStatus === "requires_local_gpu") {
      limitations.push(
        `${step.name}: ${step.provider} requires a local GPU — NOT available on Railway. Local worker needed.`,
      );
    } else if (step.providerStatus === "experimental") {
      limitations.push(
        `${step.name}: ${step.provider} is experimental. Output quality may vary.`,
      );
    }
  }
  return limitations;
}

export class StudioOrchestrator {
  orchestrate(request: StudioRequest): StudioPlan {
    const platform = request.targetPlatform ?? "generic";
    const tone = request.tone ?? "natural";
    const product = request.product ?? request.project ?? "the project";
    const format = request.format ?? this.inferFormat(platform);
    const objective = request.objective;

    const productionSteps = this.buildProductionSteps(objective, platform, format, tone);
    const assetPlan = this.buildAssetPlan(objective, platform, format);
    const limitations = buildLimitations(productionSteps);

    const requiredCapabilities = [
      ...new Set(productionSteps.map(s => s.capability)),
    ];
    const recommendedProviders = [
      ...new Set(productionSteps.map(s => s.provider)),
    ];
    const missingCapabilities = productionSteps
      .filter(s => s.providerStatus !== "available")
      .map(s => `${s.capability} (${s.providerStatus}: ${s.provider})`);

    return {
      creativeBrief: this.buildBrief(objective, product, platform, tone),
      scriptPlan: this.buildScriptPlan(objective, platform, format, tone),
      storyboardPlan: this.buildStoryboardPlan(objective, platform, format),
      assetPlan,
      requiredCapabilities,
      recommendedProviders,
      productionSteps,
      validationChecklist: this.buildValidationChecklist(productionSteps),
      exportTargets: platformExportTargets(platform),
      missingCapabilities,
      honestLimitations: limitations,
    };
  }

  private inferFormat(platform: StudioPlatform | string): string {
    const map: Record<string, string> = {
      tiktok: "short_video",
      instagram: "reel",
      youtube: "long_video",
      podcast: "music_track",
      document: "document",
    };
    return map[platform] ?? "generic";
  }

  private buildBrief(objective: string, product: string, platform: string, tone: string): string {
    return [
      `**Objective**: ${objective}`,
      `**Product/Project**: ${product}`,
      `**Target Platform**: ${platform}`,
      `**Tone**: ${tone}`,
      `**Core Message**: Authentic, value-first content designed for the ${platform} audience.`,
      `**Key Insight**: Content must feel native to ${platform} — not like an ad.`,
    ].join("\n");
  }

  private buildScriptPlan(objective: string, platform: string, format: string, tone: string): string {
    if (format === "document" || platform === "document") {
      return [
        `**Document Structure**`,
        `1. Executive Summary`,
        `2. Context & Background`,
        `3. Core Content / Analysis`,
        `4. Recommendations`,
        `5. Conclusion & Next Steps`,
        `Provider: Groq or Gemini (available)`,
      ].join("\n");
    }
    if (platform === "podcast" || format === "music_track") {
      return [
        `**Audio Content Plan** (objective: ${objective})`,
        `Hook (0:00–0:15): Attention-grabbing opening`,
        `Body (0:15–3:00): Core value / story`,
        `CTA (3:00–3:30): Clear call to action`,
        `Provider: Groq/Gemini for script (available). Audio generation: Piper (planned).`,
      ].join("\n");
    }
    return [
      `**Video Script Plan** (platform: ${platform}, tone: ${tone})`,
      `Hook (0:00–0:03): ${tone === "energetic" ? "Fast-paced opener" : "Authentic scene or question"}`,
      `Problem/Value (0:03–0:15): Show, don't tell`,
      `Solution/Product (0:15–0:30): Feature highlight`,
      `Social Proof (0:30–0:45): Real result or testimonial`,
      `CTA (0:45–1:00): Clear next step`,
      `Provider: Groq or Gemini (available)`,
    ].join("\n");
  }

  private buildStoryboardPlan(objective: string, platform: string, format: string): string {
    if (format === "document" || platform === "document") {
      return "No storyboard required for document format.";
    }
    if (format === "music_track" || platform === "podcast") {
      return `Audio storyboard: mood → build → drop → resolution. Music direction: ${objective}. Generation: MusicGen (requires_local_gpu).`;
    }
    return [
      `**Storyboard** (${platform})`,
      `Scene 1: Establishing shot or hook visual — Provider: image.generate via Pollinations (available)`,
      `Scene 2: Product/person in context — Real footage preferred, or image.generate fallback`,
      `Scene 3: Key feature close-up — image.generate or sourced asset`,
      `Scene 4: Result/transformation — Before/after or testimonial`,
      `Scene 5: CTA frame — Text overlay via FFmpeg (available)`,
      `Assembly: FFmpeg for cuts/transitions (available). Programmatic video: Remotion (planned).`,
    ].join("\n");
  }

  private buildAssetPlan(objective: string, platform: string, format: string): StudioAssetPlan[] {
    const assets: StudioAssetPlan[] = [
      {
        type: "text",
        description: "Creative brief and script",
        provider: "groq",
        providerStatus: "available",
      },
      {
        type: "text",
        description: "Social media captions and hashtags",
        provider: "groq",
        providerStatus: "available",
      },
    ];

    if (format !== "document" && platform !== "document") {
      assets.push({
        type: "image",
        description: "Visual assets and thumbnails",
        provider: "pollinations",
        providerStatus: "available",
      });
    }

    if (format === "document" || platform === "document") {
      assets.push({
        type: "document",
        description: "Professional document output (PDF/DOCX)",
        provider: "groq",
        providerStatus: "available",
      });
    }

    if (["short_video", "long_video", "reel"].includes(format) || ["tiktok", "instagram", "youtube"].includes(platform)) {
      assets.push(
        {
          type: "video",
          description: "Video assembly (cuts, transitions, subtitles)",
          provider: "ffmpeg",
          providerStatus: "available",
          honestNote: "FFmpeg handles assembly. AI video generation requires Remotion (planned).",
        },
        {
          type: "audio",
          description: "Background music / soundtrack",
          provider: "musicgen",
          providerStatus: "requires_local_gpu",
          honestNote: "MusicGen requires local GPU. Not available on Railway. Use royalty-free music as alternative.",
        },
      );
    }

    if (platform === "podcast" || format === "music_track") {
      assets.push(
        {
          type: "audio",
          description: "Generated music track",
          provider: "musicgen",
          providerStatus: "requires_local_gpu",
          honestNote: "MusicGen requires local GPU. Not available on Railway.",
        },
        {
          type: "audio",
          description: "Voice narration",
          provider: "piper",
          providerStatus: "planned",
          honestNote: "Piper TTS planned for local offline synthesis.",
        },
      );
    }

    return assets;
  }

  private buildProductionSteps(
    objective: string,
    platform: string,
    format: string,
    tone: string,
  ): StudioProductionStep[] {
    const steps: StudioProductionStep[] = [
      {
        order: 1,
        name: "Creative Brief",
        capability: "studio.brief.generate",
        provider: "groq",
        providerStatus: providerStatus("groq"),
        notes: "Generate strategic brief from objective",
      },
      {
        order: 2,
        name: "Script Writing",
        capability: format === "document" ? "studio.document.generate" : "studio.script.generate",
        provider: "groq",
        providerStatus: providerStatus("groq"),
        notes: `${tone} tone, ${platform}-optimized`,
      },
    ];

    if (format !== "document" && platform !== "document") {
      steps.push({
        order: 3,
        name: "Storyboard",
        capability: "studio.storyboard.generate",
        provider: "gemini",
        providerStatus: providerStatus("gemini"),
        notes: "Scene-by-scene visual plan",
      });

      steps.push({
        order: 4,
        name: "Image Assets",
        capability: "image.generate",
        provider: "pollinations",
        providerStatus: providerStatus("pollinations"),
        notes: "Free, no API key required",
      });
    }

    if (["short_video", "long_video", "reel"].includes(format) || ["tiktok", "instagram", "youtube"].includes(platform)) {
      steps.push(
        {
          order: 5,
          name: "Video Assembly",
          capability: "video.edit",
          provider: "ffmpeg",
          providerStatus: providerStatus("ffmpeg"),
          notes: "Cuts, transitions, subtitle overlay. FFmpeg available in Railway build.",
        },
        {
          order: 6,
          name: "Music Generation",
          capability: "audio.music.generate",
          provider: "musicgen",
          providerStatus: providerStatus("musicgen"),
          notes: "PLANNED: requires local GPU. Not available on Railway.",
        },
      );
    }

    if (platform === "podcast" || format === "music_track") {
      steps.push(
        {
          order: 3,
          name: "Music Generation",
          capability: "audio.music.generate",
          provider: "musicgen",
          providerStatus: providerStatus("musicgen"),
          notes: "REQUIRES LOCAL GPU. Plan only on Railway.",
        },
        {
          order: 4,
          name: "Voice Narration",
          capability: "audio.synthesize",
          provider: "piper",
          providerStatus: providerStatus("piper"),
          notes: "PLANNED: Piper TTS local synthesis.",
        },
      );
    }

    steps.push({
      order: steps.length + 1,
      name: "Caption & Hashtags",
      capability: "studio.caption.generate",
      provider: "groq",
      providerStatus: providerStatus("groq"),
      notes: `Platform-optimized for ${platform}`,
    });

    steps.push({
      order: steps.length + 1,
      name: "Export & Distribution Plan",
      capability: "studio.export.social",
      provider: "groq",
      providerStatus: providerStatus("groq"),
      notes: platformExportTargets(platform).join("; "),
    });

    return steps.sort((a, b) => a.order - b.order);
  }

  private buildValidationChecklist(steps: StudioProductionStep[]): string[] {
    const base = [
      "Brief approved by user before production",
      "Script reviewed for brand voice and accuracy",
      "All images generated are appropriate and on-brand",
      "Captions reviewed for platform guidelines",
    ];
    const hasVideo = steps.some(s => s.capability === "video.edit" || s.capability === "video.generate");
    const hasAudio = steps.some(s => s.capability === "audio.music.generate" || s.capability === "audio.synthesize");
    const hasMissing = steps.some(s => s.providerStatus !== "available");

    if (hasVideo) base.push("Video assembly output reviewed before publish");
    if (hasAudio) base.push("Audio quality and licensing verified");
    if (hasMissing) {
      base.push(
        "IMPORTANT: Some steps have planned/GPU providers. Review honestLimitations before presenting to client.",
      );
    }
    return base;
  }
}
