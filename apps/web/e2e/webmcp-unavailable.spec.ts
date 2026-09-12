import { expect, test } from "@playwright/test";

test.use({
  launchOptions: {
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
    chromiumSandbox: true,
    args: ["--disable-blink-features=WebMCP,WebMCPTesting"],
  },
});

test("shell navigation remains usable when the native WebMCP host is unavailable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/app");
  expect(
    await page.evaluate(() =>
      Boolean((document as unknown as { modelContext?: unknown }).modelContext),
    ),
  ).toBe(false);
  await expect(page.locator("[data-webmcp-ack]")).toHaveText("");
  await page.locator('a[href="/app/settings"]').first().click();
  await expect(page).toHaveURL(/\/app\/settings$/);
  await expect(page.getByRole("heading", { name: "Tenant configuration" })).toBeVisible();
  expect(errors).toEqual([]);
});
