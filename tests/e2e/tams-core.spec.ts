import { expect, test } from "@playwright/test";

const routes = ["/chat", "/studio", "/capabilities", "/agents", "/systeme", "/vie", "/dev-agent-pro"];

for (const route of routes) {
  test(`${route} page loads`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: "networkidle" });
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator("body")).toBeVisible();
    const text = await page.locator("body").innerText();
    expect(text.length).toBeGreaterThan(40);
  });
}

test("chat keeps a TikTok video request visible when APIs fail", async ({ page }) => {
  const prompt = "Génère une vidéo TikTok naturelle pour un legging activewear femme, format 9:16, style UGC, avec hook, scènes, captions et CTA.";
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.route("**/*", async route => {
    const request = route.request();
    const { pathname } = new URL(request.url());

    if (request.method() === "GET" && pathname === "/api/conversations") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ id: 9001, title: "E2E vidéo", mode: "chat", lastMessage: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]),
      });
      return;
    }

    if (request.method() === "GET" && pathname === "/api/conversations/9001/messages") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }

    if (request.method() === "POST" && pathname === "/api/kernel/route-intent") {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "kernel unavailable for e2e" }) });
      return;
    }

    await route.continue();
  });

  await page.goto("/chat", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /E2E vidéo/ }).click();

  const composer = page.getByPlaceholder(/Envoyer un message/);
  await composer.fill(prompt);
  await page.getByRole("button", { name: "Envoyer" }).click();

  await expect(page.getByText(prompt, { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => page.locator("body").innerText(), { timeout: 20_000 }).toContain("SHOT LIST");

  const bodyText = await page.locator("body").innerText();
  expect(bodyText).toContain(prompt);
  expect(bodyText).toContain("HOOK");
  expect(bodyText).toContain("SCRIPT");
  expect(bodyText).toContain("CAPTIONS");
  expect(bodyText).toContain("CTA");
  expect(bodyText.toLowerCase()).toContain("aucun fichier vidéo");
  expect(pageErrors).toEqual([]);
});


test("Life OS final exposes cockpit, safeguards and honest integrations", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto("/vie", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Centre de commandement personnel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Risk Radar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Coach" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Automatisations" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Historique" })).toBeVisible();

  await page.getByRole("button", { name: "Emails" }).click();
  await expect(page.getByText("missing_config", { exact: true })).toBeVisible();
  await expect(page.getByText(/Aucun faux email/)).toBeVisible();

  await page.getByRole("button", { name: "Agenda" }).click();
  await expect(page.getByText("missing_config", { exact: true })).toBeVisible();
  await expect(page.getByText(/Aucun faux événement/)).toBeVisible();

  await page.getByRole("button", { name: "Automatisations" }).click();
  await expect(page.getByText("Daily Life Briefing", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tester en dry-run" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Mémoire" }).click();
  await page.getByPlaceholder(/Capture une contrainte/).fill("J'ai une facture urgente demain.");
  await page.getByRole("button", { name: "Prévisualiser sans persister" }).click();
  await expect(page.getByText(/admin_finance/)).toBeVisible();

  await page.getByRole("button", { name: "Coach" }).click();
  await page.getByPlaceholder(/Décris une situation réelle/).fill("Je suis fatigué mais je veux lancer trois projets.");
  await page.getByRole("button", { name: "Red Team" }).click();
  await expect(page.getByRole("heading", { name: "Réponse structurée" })).toBeVisible();
  await expect(page.getByText("Faits connus", { exact: true })).toBeVisible();
  await expect(page.getByText("Suppositions", { exact: true })).toBeVisible();
  await expect(page.getByText("Limites", { exact: true })).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test("Dev Agent Pro exposes core controls", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto("/dev-agent-pro", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Agent développeur contrôlé" })).toBeVisible();
  await expect(page.getByText("Sandbox terminal")).toBeVisible();
  await expect(page.getByText("pluginRegistry")).toBeVisible();
  await expect(page.getByText("Sous-agents")).toBeVisible();
  expect(pageErrors).toEqual([]);
});


test("Studio executes real action paths and never creates ghost results", async ({ page }) => {
  const createdAssets: Array<Record<string, unknown>> = [];
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.route("**/api/**", async route => {
    const request = route.request();
    const { pathname } = new URL(request.url());

    if (request.method() === "GET" && pathname === "/api/assets") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(createdAssets) });
      return;
    }
    if (request.method() === "GET" && pathname === "/api/studio/status") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "partial", capabilities: { video: { status: "available", provider: "ffmpeg" }, audio: { status: "missing_config", provider: "none" } } }),
      });
      return;
    }
    if (request.method() === "POST" && pathname === "/api/capabilities/execute") {
      const payload = request.postDataJSON() as { capabilityId: string };
      if (payload.capabilityId === "video.generate") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            capabilityId: "video.generate",
            status: "success",
            mode: "real",
            title: "Vidéo MP4 générée",
            result: "MP4 réel par diaporama FFmpeg.",
            providerUsed: "ffmpeg",
            artifact: { type: "file", url: "/api/studio/video/e2e.mp4" },
            limitations: ["Pas de génération vidéo IA native."],
          }),
        });
        return;
      }
      if (payload.capabilityId === "audio.music.generate") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: "missing_config",
            mode: "disabled",
            title: "MusicGen non configuré",
            result: "Configurer HF_TOKEN ou MUSICGEN_WORKER_URL.",
            providerUsed: "none",
            artifact: { type: "none" },
            limitations: ["Aucun fichier audio généré."],
          }),
        });
        return;
      }
    }
    if (request.method() === "POST" && pathname === "/api/assets") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      const asset = { id: createdAssets.length + 7000, createdAt: new Date().toISOString(), ...payload };
      createdAssets.unshift(asset);
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ data: asset }) });
      return;
    }
    if (pathname === "/api/studio/video/e2e.mp4") {
      await route.fulfill({ status: 200, contentType: "video/mp4", body: "" });
      return;
    }
    await route.continue();
  });

  await page.goto("/studio", { waitUntil: "networkidle" });
  await expect(page.getByText("Studio opérationnel", { exact: true })).toBeVisible();
  await expect(page.getByText("API : partial", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Lancer video/ }).click();
  await expect(page.getByText("Vidéo MP4 générée", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Provider :/).locator("strong")).toHaveText("ffmpeg");
  await expect(page.getByRole("link", { name: "Ouvrir l’artefact réel" })).toBeVisible();
  expect(createdAssets).toHaveLength(1);

  await page.getByRole("button", { name: "Audio", exact: true }).click();
  await page.getByRole("button", { name: /Lancer audio/ }).click();
  await expect(page.getByText("MusicGen non configuré", { exact: true })).toBeVisible();
  await expect(page.getByText("Aucun asset ajouté.", { exact: true })).toBeVisible();
  expect(createdAssets).toHaveLength(1);
  expect(pageErrors).toEqual([]);
});

test("Capabilities displays provider status before execution", async ({ page }) => {
  await page.route("**/api/capabilities/status", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      status: "partial",
      capabilities: {
        image: { status: "external_unverified", provider: "pollinations" },
        video: { status: "available", provider: "ffmpeg" },
        audio: { status: "missing_config", provider: "none" },
      },
    }),
  }));
  await page.goto("/capabilities", { waitUntil: "networkidle" });
  await expect(page.getByText("Statut providers : partial", { exact: true })).toBeVisible();
  await expect(page.getByText("audio : missing_config · none", { exact: true })).toBeVisible();
});
