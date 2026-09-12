import { expect, test } from "@playwright/test";

// Local-only: this walks straight into /app via the dev-auth fallback, which
// is off on deployed environments — so it is intentionally untagged (neither
// @public nor @authed) and does not run in remote mode. Deployed authenticated
// coverage lives in authed.spec.ts via the session-mint endpoint.
test("public site opens the demo workspace", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Build the SaaS beneath your next product." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open the seeded demo" }).click();
  await expect(page).toHaveURL(/\/app$/);
});

test("activity report sorting resets pagination in one navigation", async ({ page }) => {
  await page.goto("/app/reports?page=2&pageSize=1&sort=quantity&direction=desc");
  await expect(page.getByRole("heading", { name: "Tenant activity reports" })).toBeVisible();

  await page.getByRole("button", { name: /ID/u }).click();
  await expect(page).toHaveURL(/\/app\/reports\?page=1&pageSize=1&sort=id&direction=asc$/);
});
