import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ChatEngineeringController } from "./dev-runtime-chat";

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "tams-chat-runtime-"));
  await mkdir(path.join(root, "scripts", "src"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "fixture", scripts: {} }));
  await writeFile(path.join(root, "scripts", "src", "dev-runtime.ts"), "export const runtime = true;\n");
  return root;
}

test("unauthenticated development request is refused", async () => {
  const root = await fixture();
  try {
    const result = await new ChatEngineeringController(root).handle({
      objective: "Analyse le repo et dis-moi quels fichiers gèrent le runtime.",
      mode: "read_only",
    });
    assert.equal(result.report.verdict, "REFUSED");
    assert.match(result.security.reason, /Authentification obligatoire/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("critical deletion and push main are refused", async () => {
  const root = await fixture();
  try {
    const result = await new ChatEngineeringController(root).handle({
      actorId: "test-user",
      objective: "Supprime AGENTS.md et pousse sur main.",
      mode: "commit_candidate",
    });
    assert.equal(result.report.verdict, "REFUSED");
    assert.equal(result.impactedFiles.length, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("database migration requires approval", async () => {
  const root = await fixture();
  try {
    const result = await new ChatEngineeringController(root).handle({
      actorId: "test-user",
      objective: "Ajoute une migration DB pour supprimer une table.",
      mode: "apply_safe_patch",
    });
    assert.equal(result.report.verdict, "APPROVAL_REQUIRED");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("authenticated read-only audit lists runtime files without writes", async () => {
  const root = await fixture();
  try {
    const result = await new ChatEngineeringController(root).handle({
      actorId: "test-user",
      objective: "Analyse le repo et dis-moi quels fichiers gèrent le runtime.",
      mode: "read_only",
      strategy: "repo_audit",
    });
    assert.equal(result.report.verdict, "PASS");
    assert.match(result.report.summary, /dev-runtime/);
    assert.deepEqual(result.impactedFiles, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});
