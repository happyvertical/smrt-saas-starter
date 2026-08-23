import { requirePermission, starterPermissions } from "$lib/server/authz";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals }) => {
  const membership = await requirePermission(locals, starterPermissions.settingsRead);
  return {
    canConfigureSignupForm: membership.permissions.includes(starterPermissions.fieldPolicyManage),
  };
};
