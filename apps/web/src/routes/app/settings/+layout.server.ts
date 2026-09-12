import { requirePermission, starterPermissions } from "$lib/server/authz";
import { getTenantCustomizationOverview } from "$lib/server/experience";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals }) => {
  const membership = await requirePermission(locals, starterPermissions.settingsRead);
  const customization = await getTenantCustomizationOverview(membership.tenantId);
  const settingsHeading = customization.languages.find(
    (language) => language.key === "starter.settings.heading" && language.locale === "en",
  );

  return {
    canConfigureSignupForm: membership.permissions.includes(starterPermissions.fieldPolicyManage),
    settingsHeading: settingsHeading?.previewText ?? "Tenant configuration",
  };
};
