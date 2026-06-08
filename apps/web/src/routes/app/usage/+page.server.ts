import { requirePermission, starterPermissions } from "$lib/server/authz";
import { getUsageSummaries } from "$lib/server/usage";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const membership = await requirePermission(locals, starterPermissions.usageRead);
  return {
    summaries: await getUsageSummaries(membership.tenantId),
  };
};
