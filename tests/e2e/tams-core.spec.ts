import { expect, test } from "@playwright/test";

const routes = ["/chat", "/studio", "/capabilities", "/mon-agent", "/systeme", "/vie", "/dev-agent-pro"];

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

  // Ce test couvre le flux LEGACY (Kernel route-intent → plan Studio de secours).
  // Le mode Agent est activé par défaut : on le désactive pour cibler ce flux.
  await page.getByLabel("Basculer le mode Agent").click();

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
  // Le message de secours réseau est désormais honnête (plus de faux « aucun
  // fichier vidéo / pas connecté ») : il invite à réessayer pour générer le MP4.
  expect(bodyText.toLowerCase()).toContain("plan de secours");
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
