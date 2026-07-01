import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ChatControlPlane, RepositoryIntelligence, RepositoryTools, TaskExecutionEngine } from "./dev-runtime";

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "tams-runtime-test-"));
  await mkdir(path.join(root, "src", "routes"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    name: "fixture",
    scripts: {},
    dependencies: { express: "1.0.0" },
  }));
  await writeFile(path.join(root, "src", "routes", "health.ts"), 'import express from "express";\nexport const health = true;\n');
  return root;
}

test("repository intelligence indexes packages, routes and dependencies", async () => {
  const root = await fixture();
  try {
    const tools = new RepositoryTools(root);
    const analysis = await new RepositoryIntelligence(tools).analyze();
    assert.equal(analysis.packageFiles.includes("package.json"), true);
    assert.equal(analysis.routes.includes("src/routes/health.ts"), true);
    assert.equal(analysis.dependencies.includes("express"), true);
    const matches = await tools.searchCode("health");
    assert.equal(matches[0]?.file, "src/routes/health.ts");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tool layer confines file access to repository root", async () => {
  const root = await fixture();
  try {
    const tools = new RepositoryTools(root);
    assert.throws(() => tools.resolve("../outside.txt"), /escapes repository/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("chat control plane creates and reads a persisted task", async () => {
  const root = await fixture();
  try {
    const engine = new TaskExecutionEngine(new RepositoryTools(root));
    const chat = new ChatControlPlane(engine);
    const created = await chat.handle({
      action: "create",
      objective: "Analyse le repo et ajoute un fichier runtime-check sans casser le projet.",
    }) as { id: string; status: string };
    assert.equal(created.status, "Queued");
    const status = await chat.handle({ action: "status", taskId: created.id }) as { objective: string };
    assert.match(status.objective, /runtime-check/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
