import { expect, test } from "@playwright/test";

const routes = ["/chat", "/studio", "/capabilities", "/agents", "/systeme"];

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
