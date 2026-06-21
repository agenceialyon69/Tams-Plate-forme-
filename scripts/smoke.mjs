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

async function getJson(path, init) {
  const r = await fetch(`${BASE}${path}`, init);
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

async function main() {
  if (!(await waitForHealth())) { ko("server did not become healthy"); return; }
  ok("server healthy (/api/healthz)");

  // Fresh install → onboarding reports bootstrap before any account exists.
  const status0 = await getJson("/api/auth/status");
  status0.body.bootstrap === true
    ? ok("auth status: bootstrap=true on fresh DB")
    : ko(`expected bootstrap=true, got ${JSON.stringify(status0.body)}`);

  // Auth required on data routes.
  const noAuth = await fetch(`${BASE}/api/tasks`);
  noAuth.status === 401 ? ok("data route requires auth (401)") : ko(`expected 401, got ${noAuth.status}`);

  // Bootstrap the first account (owner) — register is open only for the first user.
  const email = `smoke+${Date.now()}@example.com`;
  const reg = await getJson("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "smokepassword1", name: "Smoke" }),
  });
  const token = reg.body.token;
  reg.status === 201 && token ? ok("bootstrap register (201 + token)") : ko(`register failed (${reg.status})`);

  // After bootstrap → onboarding reports no longer bootstrap.
  const status1 = await getJson("/api/auth/status");
  status1.body.bootstrap === false
    ? ok("auth status: bootstrap=false after first account")
    : ko(`expected bootstrap=false, got ${JSON.stringify(status1.body)}`);

  // Self-registration is closed after the first account (security invariant).
  const reg2 = await getJson("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `intruder+${Date.now()}@example.com`, password: "smokepassword1", name: "X" }),
  });
  reg2.status === 403 ? ok("second registration blocked without code (403)") : ko(`expected 403, got ${reg2.status}`);

  // ...but registration with the valid owner code (API_AUTH_TOKEN) creates an owner.
  const reg3 = await getJson("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `owner2+${Date.now()}@example.com`, password: "smokepassword1", name: "Owner2", accessCode: MASTER }),
  });
  reg3.status === 201 && reg3.body.user?.role === "owner"
    ? ok("register with owner code → owner (201)")
    : ko(`expected 201 owner, got ${reg3.status} ${JSON.stringify(reg3.body.user ?? {})}`);

  // Login with the same credentials.
  const login = await getJson("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "smokepassword1" }),
  });
  login.status === 200 ? ok("login (200)") : ko(`login failed (${login.status})`);

  if (token) {
    // Authenticated data route works.
    const tasks = await fetch(`${BASE}/api/tasks`, { headers: { Authorization: `Bearer ${token}` } });
    tasks.status === 200 ? ok("authenticated data route (200)") : ko(`tasks failed (${tasks.status})`);

    // Feature-flagged integration degrades gracefully when no token is set:
    // the owner sees the GitHub integration reported as not configured (200),
    // never a crash. (GITHUB_TOKEN is absent in the smoke environment.)
    const gh = await fetch(`${BASE}/api/integrations/github/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const ghBody = await gh.json().catch(() => ({}));
    gh.status === 200 && ghBody.configured === false
      ? ok("github integration: disabled gracefully without token")
      : ko(`expected github disabled, got ${gh.status} ${JSON.stringify(ghBody)}`);

    // Logout works (authenticated route).
    const logout = await fetch(`${BASE}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    logout.status === 200 ? ok("logout (200)") : ko(`logout failed (${logout.status})`);
  }

  // Health reports DB ready once the schema is applied (poll briefly).
  let dbReady = false;
  for (let i = 0; i < 20; i++) {
    const h = await getJson("/api/healthz");
    if (h.body.db === "ready") { dbReady = true; break; }
    await sleep(500);
  }
  dbReady ? ok("healthz reports db=ready") : ko("healthz never reported db=ready");
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
