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

async function waitForHealth(timeoutMs = 60_000) {
  // The server listens BEFORE migrations finish (resilient startup), so a 200
  // from /healthz only means "listening". Wait for db:"ready" (schema applied)
  // before asserting — otherwise the first queries can race the migration and
  // hit "relation \"users\" does not exist" on a slow runner.
  const deadline = Date.now() + timeoutMs;
  let listening = false;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/healthz`);
      if (r.ok) {
        listening = true;
        const body = await r.json().catch(() => ({}));
        if (body.db === "ready") return true;
      }
    } catch { /* not up yet */ }
    await sleep(500);
  }
  return listening; // fall back to "listening" so the existing timeout error still applies
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

    // Product verticals (personas) are listed and include the generic one.
    const prod = await fetch(`${BASE}/api/products`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const prodBody = await prod.json().catch(() => ({}));
    prod.status === 200 && Array.isArray(prodBody.products) && prodBody.products.some((p) => p.id === "tams")
      ? ok(`products: ${prodBody.products?.length ?? 0} verticals listed`)
      : ko(`expected products list with tams, got ${prod.status} ${JSON.stringify(prodBody)}`);

    // Image generation: status lists the keyless provider, and the generate
    // route validates input (empty prompt → 400) without calling the network.
    const imgStatus = await fetch(`${BASE}/api/integrations/image/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const imgBody = await imgStatus.json().catch(() => ({}));
    imgStatus.status === 200 && Array.isArray(imgBody.providers) && imgBody.providers.includes("pollinations")
      ? ok("image generation: free provider available")
      : ko(`expected image providers with pollinations, got ${imgStatus.status} ${JSON.stringify(imgBody)}`);

    const imgGen = await fetch(`${BASE}/api/integrations/image/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    imgGen.status === 400
      ? ok("image generate: validates prompt")
      : ko(`expected 400 from image generate, got ${imgGen.status}`);

    // Video maker routes are mounted + validate input (empty → 400, or 503 if
    // ffmpeg absent). Never 404/500.
    const vid = await fetch(`${BASE}/api/integrations/video/slideshow`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ images: [] }),
    });
    [400, 503].includes(vid.status)
      ? ok("video maker: mounted + validates input")
      : ko(`expected 400/503 from video slideshow, got ${vid.status}`);

    // Web search: status lists providers (keyless duckduckgo always present),
    // and the raw search route validates input (empty query → 400).
    const ws = await fetch(`${BASE}/api/web-search/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const wsBody = await ws.json().catch(() => ({}));
    ws.status === 200 && Array.isArray(wsBody.providers) && wsBody.providers.includes("duckduckgo")
      ? ok("web search: providers listed (keyless fallback present)")
      : ko(`expected web search providers, got ${ws.status} ${JSON.stringify(wsBody)}`);

    const wsSearch = await fetch(`${BASE}/api/web-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    wsSearch.status === 400
      ? ok("web search: validates query")
      : ko(`expected 400 from web-search, got ${wsSearch.status}`);

    // FFmpeg status endpoint answers without crashing whether or not the
    // binary is installed (configured is a boolean either way).
    const ff = await fetch(`${BASE}/api/integrations/ffmpeg/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const ffBody = await ff.json().catch(() => ({}));
    ff.status === 200 && typeof ffBody.configured === "boolean"
      ? ok("ffmpeg integration: status answers gracefully")
      : ko(`expected ffmpeg status, got ${ff.status} ${JSON.stringify(ffBody)}`);

    // Processing route is mounted + guarded: missing media → 400 (ffmpeg
    // present) or 503 (absent). Either way it must not 404/500.
    const ffx = await fetch(`${BASE}/api/integrations/ffmpeg/extract-audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    [400, 503].includes(ffx.status)
      ? ok("ffmpeg extract-audio: mounted + validates input")
      : ko(`expected 400/503 from extract-audio, got ${ffx.status}`);

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
