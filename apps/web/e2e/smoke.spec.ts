import { expect, test } from "@playwright/test";

test("public site opens the demo workspace", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SMRT SaaS Starter" })).toBeVisible();
  await page.getByRole("link", { name: "Open demo workspace" }).click();
  await expect(page).toHaveURL(/\/app$/);
});
