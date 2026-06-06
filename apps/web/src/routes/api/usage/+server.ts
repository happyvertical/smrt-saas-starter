import { json, type RequestHandler } from "@sveltejs/kit";
import { getUsageSummaries } from "$lib/server/usage";

export const GET: RequestHandler = async ({ locals }) => {
  return json({
    tenantId: locals.tenantId ?? "demo",
    summaries: getUsageSummaries(locals.tenantId ?? "demo"),
  });
};
