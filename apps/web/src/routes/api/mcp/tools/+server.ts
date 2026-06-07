import { json, type RequestHandler } from "@sveltejs/kit";
import { listRuntimeTools } from "$lib/server/mcp";
import { getBillingOverview } from "$lib/server/subscriptions";

export const GET: RequestHandler = async ({ locals }) => {
  const overview = await getBillingOverview(locals.tenantId);
  return json({
    tools: listRuntimeTools(overview.snapshot.featureKeys),
  });
};
