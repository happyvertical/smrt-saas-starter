import { error, json, type RequestHandler } from "@sveltejs/kit";
import { callRuntimeTool, listRuntimeTools } from "$lib/server/mcp";
import { getBillingOverview } from "$lib/server/subscriptions";

export const POST: RequestHandler = async ({ locals, request }) => {
  const body = (await request.json()) as { name?: string; input?: unknown };
  if (!body.name) {
    throw error(400, "Missing tool name");
  }

  const overview = getBillingOverview(locals.tenantId ?? "demo");
  const allowed = listRuntimeTools(overview.snapshot.featureKeys);
  if (!allowed.some((tool) => tool.name === body.name)) {
    throw error(403, "Tool is not available for the current tenant");
  }

  return json(await callRuntimeTool(body.name, body.input));
};
