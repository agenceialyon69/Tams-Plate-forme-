/**
 * Studio Types — shared interfaces for the Studio Creative Factory
 */

export type StudioPlatform =
  | "tiktok"
  | "instagram"
  | "youtube"
  | "twitter"
  | "linkedin"
  | "podcast"
  | "document"
  | "generic";

export type StudioFormat =
  | "short_video"
  | "long_video"
  | "reel"
  | "post"
  | "article"
  | "script"
  | "music_track"
  | "document"
  | "campaign";

export type StudioTone =
  | "natural"
  | "professional"
  | "energetic"
  | "calm"
  | "humorous"
  | "inspirational"
  | "educational";

export interface StudioRequest {
  objective: string;
  targetPlatform?: StudioPlatform;
  project?: string;
  product?: string;
  format?: StudioFormat;
  tone?: StudioTone;
  constraints?: string[];
  availableCapabilities?: string[];
}

export interface StudioAssetPlan {
  type: "image" | "video" | "audio" | "text" | "document";
  description: string;
  provider: string;
  providerStatus: "available" | "planned" | "requires_local_gpu" | "experimental";
  honestNote?: string;
}

export interface StudioProductionStep {
  order: number;
  name: string;
  capability: string;
  provider: string;
  providerStatus: "available" | "planned" | "requires_local_gpu" | "experimental";
  duration?: string;
  notes?: string;
}

export interface StudioPlan {
  creativeBrief: string;
  scriptPlan: string;
  storyboardPlan: string;
  assetPlan: StudioAssetPlan[];
  requiredCapabilities: string[];
  recommendedProviders: string[];
  productionSteps: StudioProductionStep[];
  validationChecklist: string[];
  exportTargets: string[];
  missingCapabilities: string[];
  honestLimitations: string[];
}
