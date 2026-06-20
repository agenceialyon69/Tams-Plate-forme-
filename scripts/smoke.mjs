#!/usr/bin/env node
// Minimal smoke test: boot the built server and assert the critical paths work
// end-to-end (health, schema bootstrap, auth, an authenticated data route).
// Catches runtime regressions that typecheck/build cannot (e.g. login 500).
//
// Requires: a reachable Postgres (DATABASE_URL), API_AUTH_TOKEN, JWT_SECRET.
// The server bundle must be built first (artifacts/api-server/dist/index.mjs).

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = process.env.SMOKE_PORT ?? "8099";
const BASE = `http://127.0.0.1:${PORT}`;
const MASTER = process.env.API_AUTH_TOKEN ?? "smoke-master-token-0123456789";

let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const ko = (m) => { console.error(`  ✗ ${m}`); failures++; };

const server = spawn("node", ["artifacts/api-server/dist/index.mjs"], {
  env: {
    ...process.env,
    PORT,
    NODE_ENV: "production",
    API_AUTH_TOKEN: MASTER,
    JWT_SECRET: process.env.JWT_SECRET ?? "smoke-jwt-secret-at-least-32-characters-long",
  },
  stdio: ["ignore", "inherit", "inherit"],
});

async function waitForHealth(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/healthz`);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  return false;
}

async function main() {
  if (!(await waitForHealth())) { ko("server did not become healthy"); return; }
  ok("server healthy (/api/healthz)");

  // Auth required on data routes.
  const noAuth = await fetch(`${BASE}/api/tasks`);
  noAuth.status === 401 ? ok("data route requires auth (401)") : ko(`expected 401, got ${noAuth.status}`);

  // Bootstrap the first account (owner) — register is open only for the first user.
  const email = `smoke+${Date.now()}@example.com`;
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "smokepassword1", name: "Smoke" }),
  });
  const regBody = await reg.json().catch(() => ({}));
  const token = regBody.token;
  reg.status === 201 && token ? ok("bootstrap register (201 + token)") : ko(`register failed (${reg.status})`);

  // Login with the same credentials.
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "smokepassword1" }),
  });
  login.status === 200 ? ok("login (200)") : ko(`login failed (${login.status})`);

  // Authenticated data route works.
  if (token) {
    const tasks = await fetch(`${BASE}/api/tasks`, { headers: { Authorization: `Bearer ${token}` } });
    tasks.status === 200 ? ok("authenticated data route (200)") : ko(`tasks failed (${tasks.status})`);
  }
}

try {
  await main();
} catch (e) {
  ko(`unexpected error: ${e}`);
} finally {
  server.kill("SIGTERM");
}

if (failures > 0) {
  console.error(`\nSMOKE FAILED (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nSMOKE OK");
process.exit(0);
