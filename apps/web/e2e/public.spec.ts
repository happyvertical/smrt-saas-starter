import { expect, test } from "@playwright/test";

// @public tests must pass against any deployed environment: unauthenticated,
// read-only, and free of dev-auth or seed-data assumptions beyond the public
// marketing/login surface.

test("landing page renders the starter hero @public", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Build the SaaS beneath your next product." }),
  ).toBeVisible();
});

test("login page renders the unified email form @public", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Continue with email." })).toBeVisible();
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="tenantName"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with email" })).toBeVisible();
});

test("signup directs public visitors to the unified email form @public", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Continue with email." })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("health endpoint reports ok @public", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { status: string; version: string | null };
  expect(body.status).toBe("ok");
});

test("request-access page renders the waitlist form @public", async ({ page }) => {
  await page.goto("/request-access");
  await expect(page.getByRole("heading", { name: "Request access" })).toBeVisible();
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Request access" })).toBeVisible();
});

// Not @public: this submission writes an AccessRequest, so keep it to the local
// full suite (the service de-dups open requests by email, so it's idempotent).
test("request-access form captures a waitlist submission", async ({ page }) => {
  await page.goto("/request-access");
  await page.waitForLoadState("networkidle");
  await page.locator('input[name="email"]').fill("waitlist+e2e@example.com");
  await page.locator('input[name="name"]').fill("Waitlist E2E");
  await page.getByRole("button", { name: "Request access" }).click();
  await expect(page.getByTestId("request-access-success")).toBeVisible();
});
