import { error, json, type RequestHandler } from "@sveltejs/kit";
import { callRuntimeTool, listRuntimeTools } from "$lib/server/mcp";
import { getBillingOverview } from "$lib/server/subscriptions";
import { getUsageWindow, recordUsageMetric } from "$lib/server/usage";

export const POST: RequestHandler = async ({ locals, request }) => {
  const body = (await request.json()) as { name?: string; input?: unknown };
  if (!body.name) {
    throw error(400, "Missing tool name");
  }

  const tenantId = locals.tenantId ?? "demo";
  const overview = getBillingOverview(tenantId);
  const allowed = listRuntimeTools(overview.snapshot.featureKeys);
  const tool = allowed.find((candidate) => candidate.name === body.name);
  if (!tool) {
    throw error(403, "Tool is not available for the current tenant");
  }

  const blockedMetric = overview.snapshot.thresholdEvaluations.find(
    (evaluation) => evaluation.threshold.metricKey === "mcp.calls" && !evaluation.allowed,
  );
  if (blockedMetric) {
    throw error(429, "Tenant exceeded the MCP calls threshold");
  }

  const response = await callRuntimeTool(body.name, body.input, { tenantId });
  const window = getUsageWindow("month");
  recordUsageMetric({
    tenantId,
    metricKey: "mcp.calls",
    quantity: 1,
    windowStart: window.start,
    windowEnd: window.end,
    source: "smrt-app-mcp",
    sourceId: body.name,
    dimensions: {
      toolName: tool.name,
      readOnly: tool.readOnly,
    },
  });

  return json(response);
};
