import { test, expect, type Page } from "@playwright/test";

// The in-app help center (help-navigator widget mounted in the (app) layout).
// Playwright locators pierce the widget's shadow root automatically.
// Requires seed data: `npm run setup` (alice@acme.example / password).

async function signInAsAlice(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("alice@acme.example").fill("alice@acme.example");
  await page.getByPlaceholder("••••••••").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/$/, { timeout: 15_000 });
}

test.describe("help center", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAlice(page);
  });

  test("launcher opens contextual help; context follows the route", async ({ page }) => {
    await page.getByRole("button", { name: "Open help" }).click();
    const panel = page.getByRole("dialog", { name: "Contractable Help" });
    await expect(panel.getByText("Suggested for this page")).toBeVisible();
    await expect(panel.getByText("Your dashboard and pending actions")).toBeVisible();
    await expect(panel.getByText("Browse by topic")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(panel.getByText("Browse by topic")).not.toBeVisible();

    await page.getByRole("link", { name: "Obligations" }).first().click();
    await page.waitForURL(/\/obligations/);
    await page.keyboard.press("F1");
    await expect(
      panel.getByText("Obligations: payments, renewals, expirations"),
    ).toBeVisible();
  });

  test("search, article rendering, feedback, and back navigation", async ({ page }) => {
    await page.keyboard.press("F1");
    const panel = page.getByRole("dialog", { name: "Contractable Help" });

    await panel.getByPlaceholder("Search help articles…").fill("redline");
    await expect(panel.locator("mark").first()).toBeVisible();
    await panel.locator("button.hn-item", { hasText: "Redlining and version compare" }).click();
    await expect(
      panel.getByRole("heading", { name: "Redlining and version compare" }),
    ).toBeVisible();
    await expect(panel.getByText("How redlines work")).toBeVisible();

    await panel.getByRole("button", { name: "Yes", exact: true }).click();
    await expect(panel.getByText("Thanks for the feedback!")).toBeVisible();

    await panel.getByRole("button", { name: "Back" }).click();
    await expect(panel.locator("mark").first()).toBeVisible(); // back on search results
  });

  test("category browsing drills into workflow help", async ({ page }) => {
    await page.keyboard.press("F1");
    const panel = page.getByRole("dialog", { name: "Contractable Help" });

    await panel.locator("button.hn-item", { hasText: "Review & approval" }).click();
    await expect(
      panel.getByText("Configurable workflows, ANY/ALL rules, and pending actions."),
    ).toBeVisible();
    await panel
      .locator("button.hn-item", { hasText: "How review & approval workflows work" })
      .click();
    await expect(panel.getByText("An example")).toBeVisible();
    await expect(panel.locator(".hn-article").getByText(/rule ANY/)).toBeVisible();

    await panel.getByRole("button", { name: "Back" }).click();
    await panel.getByRole("button", { name: "Back" }).click();
    await expect(panel.getByText("Browse by topic")).toBeVisible();
  });
});
