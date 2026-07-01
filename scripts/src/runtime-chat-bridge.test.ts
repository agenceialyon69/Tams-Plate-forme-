import assert from "node:assert/strict";
import test from "node:test";
import {
  RuntimeBridgeError,
  matchRuntimeCommand,
  requestRuntimeTask,
} from "../../artifacts/tams/src/lib/runtime-chat-bridge";

const audit = "Analyse le repo et dis-moi quels fichiers gèrent le Chat OS.";
const validation = "Lance une validation du runtime.";
const dangerous = "Supprime AGENTS.md et pousse sur main.";

test("recognizes the three Chat OS runtime commands", () => {
  assert.equal(matchRuntimeCommand(audit), "repo_audit");
  assert.equal(matchRuntimeCommand(validation), "runtime_validation");
  assert.equal(matchRuntimeCommand(dangerous), "security_check");
  assert.equal(matchRuntimeCommand("Bonjour TAMS"), null);
});

test("sends authenticated read-only audit through the runtime endpoint", async () => {
  let request: { url?: string; init?: RequestInit } = {};
  const task = await requestRuntimeTask({
    apiBase: "https://tams.example",
    conversationId: 42,
    content: audit,
    getAccessToken: async () => "jwt-test",
    fetchImpl: async (input, init) => {
      request = { url: String(input), init };
      return new Response(JSON.stringify({
        id: "task-audit",
        status: "Completed",
        mode: "read_only",
        strategy: "repo_audit",
        impactedFiles: [],
        report: { verdict: "PASS", summary: "Chat OS: artifacts/tams/src/pages/chat.tsx" },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });

  assert.equal(request.url, "https://tams.example/api/conversations/42/runtime");
  assert.equal(new Headers(request.init?.headers).get("Authorization"), "Bearer jwt-test");
  assert.deepEqual(JSON.parse(String(request.init?.body)), {
    objective: audit,
    mode: "read_only",
    strategy: "repo_audit",
  });
  assert.equal(task.report.verdict, "PASS");
  assert.deepEqual(task.impactedFiles, []);
});

test("maps runtime validation to deploy_check", async () => {
  let body: Record<string, unknown> = {};
  await requestRuntimeTask({
    apiBase: "",
    conversationId: 7,
    content: validation,
    getAccessToken: async () => "jwt-test",
    fetchImpl: async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        id: "task-validation",
        status: "Completed",
        mode: "deploy_check",
        strategy: "runtime_validation",
        impactedFiles: [],
        report: { verdict: "PASS", summary: "Runtime validation completed" },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  assert.equal(body.mode, "deploy_check");
  assert.equal(body.strategy, "runtime_validation");
});

test("surfaces an authenticated security refusal without treating it as a transport error", async () => {
  const task = await requestRuntimeTask({
    apiBase: "",
    conversationId: 9,
    content: dangerous,
    getAccessToken: async () => "jwt-test",
    fetchImpl: async () => new Response(JSON.stringify({
      id: "task-refused",
      status: "Refused",
      mode: "commit_candidate",
      strategy: "security_refusal",
      impactedFiles: [],
      report: { verdict: "REFUSED", summary: "Suppression d’un fichier critique interdite" },
    }), { status: 403, headers: { "Content-Type": "application/json" } }),
  });
  assert.equal(task.report.verdict, "REFUSED");
  assert.deepEqual(task.impactedFiles, []);
});

test("fails closed before fetch when no authenticated session exists", async () => {
  let called = false;
  await assert.rejects(
    requestRuntimeTask({
      apiBase: "",
      conversationId: 1,
      content: audit,
      getAccessToken: async () => null,
      fetchImpl: async () => {
        called = true;
        return new Response();
      },
    }),
    (error: unknown) => error instanceof RuntimeBridgeError && error.code === "AUTH_REQUIRED",
  );
  assert.equal(called, false);
});
