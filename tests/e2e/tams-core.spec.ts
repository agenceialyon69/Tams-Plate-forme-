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
  const prompt =
    "Génère une vidéo TikTok naturelle pour un legging activewear femme, format 9:16, style UGC, avec hook, scènes, captions et CTA.";
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.route(/\/api\/conversations(?:\?.*)?$/, async route => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: 9001,
          title: "E2E vidéo",
          mode: "chat",
          lastMessage: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]),
    });
  });
  await page.route(/\/api\/conversations\/9001\/messages(?:\?.*)?$/, route =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route("**/api/kernel/route-intent", route =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "kernel unavailable in E2E" }),
    }),
  );
  await page.route("**/api/conversations/9001/stream", route =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "stream unavailable in E2E" }),
    }),
  );

  await page.goto("/chat", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /E2E vidéo/ }).click();

  const composer = page.getByPlaceholder(/Envoyer un message/);
  await composer.fill(prompt);
  await page.getByRole("button", { name: "Envoyer" }).click();

  await expect(page.getByText(prompt, { exact: true })).toBeVisible();
  await expect(page.getByText("HOOK", { exact: true })).toBeVisible();
  await expect(page.getByText("SCRIPT", { exact: true })).toBeVisible();
  await expect(page.getByText("SHOT LIST", { exact: true })).toBeVisible();
  await expect(page.getByText("CAPTIONS", { exact: true })).toBeVisible();
  await expect(page.getByText("CTA", { exact: true })).toBeVisible();
  await expect(page.getByText(/aucun fichier vidéo n.a été généré/i)).toBeVisible();
  expect(pageErrors).toEqual([]);
});
