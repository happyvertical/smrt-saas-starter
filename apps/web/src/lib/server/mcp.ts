import { resolveStarterPromptPreview } from "$lib/server/experience";
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
    const summaries = (await getUsageSummaries(context.tenantId)).map((summary) => ({
      ...summary,
      windowStart: summary.windowStart.toISOString(),
      windowEnd: summary.windowEnd.toISOString(),
    }));

    return {
      content: [{ type: "text", text: "Tenant usage summary loaded." }],
      structuredContent: { tenantId: context.tenantId, summaries, input },
    };
  }

  if (name === "tenant.prompt.preview") {
    const prompt = await resolveStarterPromptPreview(context.tenantId, readPromptKey(input));

    return {
      content: [{ type: "text", text: "Tenant prompt preview loaded." }],
      structuredContent: {
        tenantId: context.tenantId,
        prompt: {
          key: prompt.key,
          template: prompt.template,
          text: prompt.text,
          ai: prompt.ai,
        },
      },
    };
  }

  return {
    content: [
      { type: "text", text: `Tool ${name} is registered but requires its upstream handler.` },
    ],
    structuredContent: { input },
  };
}

function readPromptKey(input: unknown): string | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const key = (input as { key?: unknown }).key;
  return typeof key === "string" && key.trim().length > 0 ? key : undefined;
}
