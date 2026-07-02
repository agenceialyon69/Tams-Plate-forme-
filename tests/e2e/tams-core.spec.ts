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
