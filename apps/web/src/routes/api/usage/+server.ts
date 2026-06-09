import { json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission, starterPermissions } from "$lib/server/authz";
import { getUsageSummaries } from "$lib/server/usage";

export const GET: RequestHandler = async ({ locals }) => {
  const membership = await requirePermission(locals, starterPermissions.usageRead);
  const tenantId = membership.tenantId;
  return json({
    tenantId,
    summaries: await getUsageSummaries(tenantId),
  });
};
