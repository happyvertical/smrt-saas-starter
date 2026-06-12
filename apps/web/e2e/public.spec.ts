import { expect, test } from "@playwright/test";

// @public tests must pass against any deployed environment: unauthenticated,
// read-only, and free of dev-auth or seed-data assumptions beyond the public
// marketing/login surface.

test("landing page renders the starter hero @public", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SMRT SaaS Starter" })).toBeVisible();
});

test("login page renders the sign-in form @public", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Open your workspace" })).toBeVisible();
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("health endpoint reports ok @public", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { status: string; version: string | null };
  expect(body.status).toBe("ok");
});
