import { getUsageSummaries } from "$lib/server/usage";

export interface RuntimeTool {
  name: string;
  description: string;
  readOnly: boolean;
  requiredFeature: string;
}

export const runtimeTools: RuntimeTool[] = [
  {
    name: "tenant.usage.summary",
    description: "Summarize tenant usage meters and thresholds.",
    readOnly: true,
    requiredFeature: "mcp.read_tools",
  },
  {
    name: "tenant.prompt.preview",
    description: "Preview the effective prompt after tenant overrides.",
    readOnly: true,
    requiredFeature: "prompts.tenant_overrides",
  },
  {
    name: "tenant.subscription.update",
    description: "Prepare a subscription change after user confirmation.",
    readOnly: false,
    requiredFeature: "mcp.write_tools",
  },
];

export function listRuntimeTools(enabledFeatureKeys: Iterable<string>) {
  const enabledFeatures = new Set(enabledFeatureKeys);
  return runtimeTools.filter((tool) => enabledFeatures.has(tool.requiredFeature));
}

export interface RuntimeToolContext {
  tenantId: string;
}

export async function callRuntimeTool(name: string, input: unknown, context: RuntimeToolContext) {
  if (name === "tenant.usage.summary") {
    const summaries = getUsageSummaries(context.tenantId).map((summary) => ({
      ...summary,
      windowStart: summary.windowStart.toISOString(),
      windowEnd: summary.windowEnd.toISOString(),
    }));

    return {
      content: [{ type: "text", text: "Tenant usage summary loaded." }],
      structuredContent: { tenantId: context.tenantId, summaries, input },
    };
  }

  return {
    content: [
      { type: "text", text: `Tool ${name} is registered but requires its upstream handler.` },
    ],
    structuredContent: { input },
  };
}
