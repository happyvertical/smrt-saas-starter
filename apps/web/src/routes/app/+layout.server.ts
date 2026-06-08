import { isHttpError, redirect } from "@sveltejs/kit";
import { requirePermission, starterPermissions } from "$lib/server/authz";
import { resolveSuperUserContext } from "$lib/server/super-users";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals, url }) => {
  const membership = await requirePermission(locals, starterPermissions.appAccess).catch(
    (authError: unknown) => {
      if (isHttpError(authError) && authError.status === 401) {
        throw redirect(303, `/login?returnTo=${encodeURIComponent(url.pathname)}`);
      }
      throw authError;
    },
  );

  return {
    tenantId: membership.tenantId,
    tenantLabel: membership.tenantLabel,
    userLabel: membership.userEmail,
    roleLabel: membership.roleLabel,
    currentRole: membership.roleSlug,
    permissions: membership.permissions,
    isSuperUser: Boolean(resolveSuperUserContext({ ...locals, membership })),
    tenants: membership.availableTenants,
    activePath: url.pathname,
  };
};
