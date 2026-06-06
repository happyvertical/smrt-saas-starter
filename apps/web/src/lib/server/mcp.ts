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

export function listRuntimeTools(enabledFeatures: Record<string, boolean>) {
  return runtimeTools.filter((tool) => enabledFeatures[tool.requiredFeature] === true);
}

export async function callRuntimeTool(name: string, input: unknown) {
  if (name === "tenant.usage.summary") {
    return {
      content: [{ type: "text", text: "Usage summary is available in the Usage page." }],
      structuredContent: { input },
    };
  }

  return {
    content: [
      { type: "text", text: `Tool ${name} is registered but requires its upstream handler.` },
    ],
    structuredContent: { input },
  };
}
