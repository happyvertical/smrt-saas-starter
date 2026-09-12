import { expect, type Page, test } from "@playwright/test";

interface NativeTool {
  name: string;
}

interface NativeModelContext {
  getTools(): Promise<NativeTool[]>;
  executeTool(tool: NativeTool, args: string): Promise<string>;
}

async function executeShellTool(page: Page, name: string, args: Record<string, unknown>) {
  return await page.evaluate(
    async ({ name, args }) => {
      const context = document.modelContext as unknown as NativeModelContext | undefined;
      if (!context) throw new Error("WebMCP is unavailable in this browser");
      const tool = (await context.getTools()).find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`Missing WebMCP tool: ${name}`);
      return await context.executeTool(tool, JSON.stringify(args));
    },
    { name, args },
  );
}

async function expectShellTools(page: Page, names: string[]) {
  await expect
    .poll(async () => {
      return await page.evaluate(async () => {
        const context = document.modelContext as unknown as NativeModelContext | undefined;
        return context ? (await context.getTools()).map((tool) => tool.name) : [];
      });
    })
    .toEqual(expect.arrayContaining(names));
}

test("mounted shell tools execute through the native Chromium WebMCP API", async ({ page }) => {
  await page.goto("/app");

  await expectShellTools(page, [
    "starter_shell_navigate",
    "starter_shell_set_theme",
    "starter_shell_prepare_billing_portal",
  ]);

  await expect(
    executeShellTool(page, "starter_shell_set_theme", { colorScheme: "dark" }),
  ).resolves.toContain('"completion":"applied"');
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "dark");
  await expect(page.locator("[data-webmcp-ack]")).toHaveText("Color scheme set to dark.");

  await expect(
    executeShellTool(page, "starter_shell_prepare_billing_portal", { confirm: false }),
  ).resolves.toContain('"reason":"confirmation_required"');

  const navigation = executeShellTool(page, "starter_shell_navigate", { href: "/app/settings" });
  await expect(navigation).resolves.toContain('"completion":"navigation_started"');
  await expect(page).toHaveURL(/\/app\/settings$/);
  await expect(page.getByRole("heading", { name: "Tenant configuration" })).toBeVisible();
  await expect(page.locator("[data-webmcp-ack]")).toHaveText("Opening Settings.");
});

test("mounted form filling stays client-side and tenant switching keeps its confirmation gate", async ({
  page,
}) => {
  await page.goto("/app/settings/members");
  await expectShellTools(page, ["starter_shell_fill_form", "starter_shell_switch_tenant"]);

  await expect(
    executeShellTool(page, "starter_shell_fill_form", {
      action: "settings.invite-member",
      fields: { email: "webmcp@example.test", roleSlug: "viewer" },
    }),
  ).resolves.toContain('"completion":"filled"');
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveValue("webmcp@example.test");
  await expect(page.locator("[data-webmcp-ack]")).toHaveText("Form fields updated.");

  await expect(
    executeShellTool(page, "starter_shell_switch_tenant", {
      tenantId: "00000000-0000-4000-8000-000000000001",
      confirm: false,
    }),
  ).resolves.toContain('"reason":"confirmation_required"');

  await expect(
    executeShellTool(page, "starter_shell_switch_tenant", {
      tenantId: "00000000-0000-4000-8000-000000000001",
      confirm: true,
    }),
  ).resolves.toContain('"completion":"switched"');
  await expect(page.locator("[data-webmcp-ack]")).toHaveText("Switched to Demo Tenant.");

  await page.goto("/");
  await expect
    .poll(async () => {
      return await page.evaluate(async () => {
        const context = document.modelContext as unknown as NativeModelContext | undefined;
        return context ? (await context.getTools()).map((tool) => tool.name) : [];
      });
    })
    .not.toEqual(expect.arrayContaining(["starter_shell_navigate", "starter_shell_fill_form"]));
});
