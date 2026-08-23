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
