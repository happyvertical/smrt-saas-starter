import { expect, test } from "@playwright/test";

// Local-only (untagged, like smoke.spec): reaches /app/admin through the
// dev-auth fallback, which signs in the demo owner as a super user. The seed
// creates one open access request, so the triage queue — and its graduation
// form — renders. Deployed super-user coverage would need the session-mint
// endpoint plus a seeded super user, so this stays out of @public/@authed.
test("admin graduation form offers an existing-tenant picker", async ({ page }) => {
  await page.goto("/app/admin");
  await expect(page.getByRole("heading", { name: "Access requests" })).toBeVisible();

  const tenantPicker = page
    .getByRole("combobox", { name: "Graduate into an existing tenant" })
    .first();
  await expect(tenantPicker).toBeVisible();

  // The seeded demo tenant is a selectable graduation target (change #2), and the
  // default keeps the new-tenant / user-only behaviour.
  await tenantPicker.selectOption({ label: "Demo Tenant" });
  await expect(tenantPicker).toHaveValue(/.+/);
  await tenantPicker.selectOption({ label: "New tenant / user only" });
  await expect(tenantPicker).toHaveValue("");

  const rolePicker = page
    .getByRole("combobox", { name: "Membership role for existing tenant" })
    .first();
  await expect(rolePicker).toBeVisible();
});

test("admin signup settings use the policy basic/advanced form", async ({ page }) => {
  await page.goto("/app/admin");

  await expect(page.getByRole("radiogroup", { name: "View mode" })).toBeVisible();
  await expect(
    page.getByText("Value applied by the starter application for this setting."),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Metadata" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Save access mode" })).toBeVisible();
  const policyGear = page.getByRole("main").getByRole("button", { name: "Field settings" });
  await expect(policyGear).toBeVisible();

  await page.getByRole("radio", { name: "Advanced" }).click();
  const metadata = page.getByRole("textbox", { name: "Metadata" });
  await expect(metadata).toBeVisible();
  await expect(metadata).toHaveValue(/seededBy/);

  await page.getByRole("button", { name: "Save access mode" }).click();
  await expect(page.getByText("Signup access updated.")).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("main").getByRole("button", { name: "Field settings" }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Advanced" }).click();
  await expect(page.getByRole("textbox", { name: "Metadata" })).toHaveValue(/seededBy/);

  await page.getByRole("main").getByRole("button", { name: "Field settings" }).click();
  await expect(page.getByRole("tab", { name: "Organization" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Just me" })).toBeVisible();
});

test("admin shell exposes the field-policy control-panel destination", async ({ page }) => {
  await page.goto("/app");
  const workspaceTools = page.getByRole("navigation", { name: "Workspace tools" });
  await expect(workspaceTools).toBeInViewport();
  await expect(workspaceTools.getByRole("button", { name: "Chat tool" })).toBeInViewport();

  await page.getByRole("link", { name: "Field settings" }).click();
  await expect(page).toHaveURL(/\/app\/settings\/field-policies$/);
  await expect(page.getByRole("heading", { name: "Field settings" })).toBeVisible();
});
