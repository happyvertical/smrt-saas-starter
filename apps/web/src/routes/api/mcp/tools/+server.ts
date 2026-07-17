import { json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission, starterPermissions } from "$lib/server/authz";
import { listRuntimeTools } from "$lib/server/mcp";
import { getBillingOverview } from "$lib/server/subscriptions";

export const GET: RequestHandler = async ({ locals }) => {
  const membership = await requirePermission(locals, starterPermissions.mcpRead);
  const overview = await getBillingOverview(membership.tenantId);
  return json({
    tools: listRuntimeTools(overview.snapshot.featureKeys),
  });
};
