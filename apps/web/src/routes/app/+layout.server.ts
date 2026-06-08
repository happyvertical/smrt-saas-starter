import { requirePermission, starterPermissions } from "$lib/server/authz";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals, url }) => {
  const membership = await requirePermission(locals, starterPermissions.appAccess);

  return {
    tenantId: membership.tenantId,
    tenantLabel: membership.tenantLabel,
    userLabel: membership.userEmail,
    roleLabel: membership.roleLabel,
    currentRole: membership.roleSlug,
    permissions: membership.permissions,
    tenants: membership.availableTenants,
    activePath: url.pathname,
  };
};
