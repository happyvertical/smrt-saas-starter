import { json, type RequestHandler } from "@sveltejs/kit";
import { getActiveTenantId } from "$lib/server/starter-data";
import { getUsageSummaries } from "$lib/server/usage";

export const GET: RequestHandler = async ({ locals }) => {
  const tenantId = getActiveTenantId(locals.tenantId);
  return json({
    tenantId,
    summaries: await getUsageSummaries(tenantId),
  });
};
