import { expect, test } from "@playwright/test";

// @authed specs exercise authenticated reads against a DEPLOYED environment
// (and locally when you opt in). They mint a real smrt-users session for the
// seeded e2e user via POST /api/e2e/session — gated by E2E_AUTH_SECRET — then
// hit the tenant surfaces. Playwright's `page.request` shares the browser
// context cookie jar, so the minted session cookie carries into `page.goto`.
const secret = process.env.E2E_AUTH_SECRET ?? "";

test.beforeEach(async ({ page }) => {
  const response = await page.request.post("/api/e2e/session", {
    headers: { "x-e2e-auth": secret },
  });
  expect(response.ok(), "e2e session mint should succeed").toBeTruthy();
});

test("authenticated tenant dashboard loads @authed", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Tenant overview" })).toBeVisible();
});

test("authenticated billing page lists plans @authed", async ({ page }) => {
  await page.goto("/app/billing");
  await expect(page.getByRole("heading", { name: "Plans and subscription" })).toBeVisible();
});
