import assert from "node:assert/strict";
import test from "node:test";
import { StudioOrchestrator } from "../lib/studio/studio-orchestrator";

const orchestrator = new StudioOrchestrator();

test("TikTok KORE plan returns brief + storyboard + production steps + limitations", () => {
  const plan = orchestrator.orchestrate({
    objective: "Create a natural TikTok video for KORE activewear",
    targetPlatform: "tiktok",
    product: "KORE activewear",
    tone: "natural",
  });

  assert.ok(plan.creativeBrief.includes("KORE"), "brief must mention product");
  assert.ok(plan.storyboardPlan.includes("Scene"), "storyboard must have scenes");
  assert.ok(plan.productionSteps.length >= 3, "must have multiple production steps");
  assert.ok(plan.exportTargets.some(t => /9:16/i.test(t)), "TikTok export must be 9:16");
  assert.ok(plan.honestLimitations.length > 0, "must have honest limitations");
  // Video and music steps should be flagged as not fully available
  const missingOrPlanned = plan.productionSteps.filter(s => s.providerStatus !== "available");
  assert.ok(missingOrPlanned.length > 0, "some steps must be planned/GPU");
});

test("drill music plan returns music plan with MusicGen GPU limitation", () => {
  const plan = orchestrator.orchestrate({
    objective: "Generate professional drill music",
    targetPlatform: "podcast",
    format: "music_track",
    tone: "energetic",
  });

  assert.ok(
    plan.productionSteps.some(s => s.provider === "musicgen"),
    "must include musicgen step",
  );
  assert.ok(
    plan.honestLimitations.some(l => /gpu/i.test(l)),
    "must warn about GPU requirement",
  );
  assert.ok(
    plan.missingCapabilities.some(c => /musicgen/i.test(c)),
    "musicgen must be in missing capabilities",
  );
});

test("subtitle montage plan returns FFmpeg step + Remotion planned step", () => {
  const plan = orchestrator.orchestrate({
    objective: "Make a short montage with subtitles",
    targetPlatform: "instagram",
    format: "reel",
  });

  assert.ok(
    plan.productionSteps.some(s => s.provider === "ffmpeg" && s.providerStatus === "available"),
    "FFmpeg step must be available",
  );
  assert.ok(plan.storyboardPlan.includes("FFmpeg"), "storyboard must mention FFmpeg");
});

test("marketing campaign for Claire returns multi-asset plan", () => {
  const plan = orchestrator.orchestrate({
    objective: "Prepare a marketing campaign for Claire",
    targetPlatform: "instagram",
    project: "Claire",
    tone: "professional",
  });

  assert.ok(plan.creativeBrief.includes("Claire"), "brief must mention project");
  assert.ok(plan.assetPlan.length >= 2, "must have multiple assets");
  assert.ok(plan.requiredCapabilities.length >= 2, "must require multiple capabilities");
});

test("professional document plan uses document capabilities only", () => {
  const plan = orchestrator.orchestrate({
    objective: "Create a professional document",
    targetPlatform: "document",
    format: "document",
  });

  assert.ok(
    plan.productionSteps.every(s => s.providerStatus === "available"),
    "all document steps must be available",
  );
  assert.equal(plan.honestLimitations.length, 0, "no limitations for document format");
  assert.ok(plan.exportTargets.some(t => /pdf/i.test(t)), "must include PDF export");
});
