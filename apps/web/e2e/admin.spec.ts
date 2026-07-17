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
