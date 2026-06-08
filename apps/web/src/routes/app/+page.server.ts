import { requirePermission, starterPermissions } from "$lib/server/authz";
import { getBillingOverview } from "$lib/server/subscriptions";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const membership = await requirePermission(locals, starterPermissions.tenantRead);
  return await getBillingOverview(membership.tenantId);
};
