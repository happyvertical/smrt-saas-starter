import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBillingOverview: vi.fn(),
  resolveStarterPromptPreview: vi.fn(),
  getUsageSummaries: vi.fn(),
  getUsageWindow: vi.fn(),
  recordUsageMetric: vi.fn(),
}));

vi.mock("$lib/server/subscriptions", () => ({
  getBillingOverview: mocks.getBillingOverview,
}));

vi.mock("$lib/server/experience", () => ({
  resolveStarterPromptPreview: mocks.resolveStarterPromptPreview,
}));

vi.mock("$lib/server/usage", () => ({
  getUsageSummaries: mocks.getUsageSummaries,
  getUsageWindow: mocks.getUsageWindow,
  recordUsageMetric: mocks.recordUsageMetric,
}));

import {
  executeRuntimeToolForTenant,
  listRuntimeTools,
  RuntimeToolExecutionError,
} from "$lib/server/mcp";

const tenantId = "11111111-1111-4111-8111-111111111111";
const windowStart = new Date("2026-06-01T00:00:00.000Z");
const windowEnd = new Date("2026-07-01T00:00:00.000Z");

describe("tenant MCP runtime tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUsageWindow.mockReturnValue({ start: windowStart, end: windowEnd });
    mocks.getUsageSummaries.mockResolvedValue([]);
    mocks.resolveStarterPromptPreview.mockResolvedValue({
      key: "starter.assistant.system",
      template: "Tenant {{tenantName}}",
      text: "Tenant Acme",
      ai: { profile: "starter", params: {} },
    });
  });

  it("lists the subscription summary tool with read MCP feature grants", () => {
    expect(listRuntimeTools(["mcp.read_tools"]).map((tool) => tool.name)).toEqual([
      "tenant.usage.summary",
      "tenant.subscription.summary",
    ]);
  });

  it("executes available tools and records tenant-scoped MCP usage", async () => {
    mocks.getBillingOverview.mockResolvedValue(overview(["mcp.read_tools"]));

    await expect(
      executeRuntimeToolForTenant("tenant.subscription.summary", { message: "plan?" }, tenantId),
    ).resolves.toMatchObject({
      tool: {
        name: "tenant.subscription.summary",
        readOnly: true,
      },
      response: {
        structuredContent: {
          tenantId,
          subscription: {
            planName: "Growth",
            planKey: "growth",
            status: "active",
          },
        },
      },
    });

    expect(mocks.recordUsageMetric).toHaveBeenCalledWith({
      tenantId,
      metricKey: "mcp.calls",
      quantity: 1,
      windowStart,
      windowEnd,
      source: "smrt-app-mcp",
      sourceId: "tenant.subscription.summary",
      dimensions: {
        toolName: "tenant.subscription.summary",
        readOnly: true,
      },
    });
  });

  it("keeps subscription update tools non-mutating until billing confirmation", async () => {
    mocks.getBillingOverview.mockResolvedValue(overview(["mcp.write_tools"]));

    await expect(
      executeRuntimeToolForTenant(
        "tenant.subscription.update",
        { requestedChange: "upgrade to scale" },
        tenantId,
      ),
    ).resolves.toMatchObject({
      tool: {
        name: "tenant.subscription.update",
        readOnly: false,
      },
      response: {
        content: [{ text: "Subscription change requires checkout confirmation." }],
        structuredContent: {
          tenantId,
          action: "requires_confirmation",
          subscription: {
            planName: "Growth",
            planKey: "growth",
            status: "active",
          },
        },
      },
    });

    expect(mocks.recordUsageMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        metricKey: "mcp.calls",
        sourceId: "tenant.subscription.update",
        dimensions: {
          toolName: "tenant.subscription.update",
          readOnly: false,
        },
      }),
    );
  });

  it("blocks unavailable tools before recording usage", async () => {
    mocks.getBillingOverview.mockResolvedValue(overview(["mcp.read_tools"]));

    await expect(
      executeRuntimeToolForTenant(
        "tenant.prompt.preview",
        { key: "starter.assistant.system" },
        tenantId,
      ),
    ).rejects.toMatchObject({
      status: 403,
      message: "Tool is not available for the current tenant",
    });
    expect(mocks.recordUsageMetric).not.toHaveBeenCalled();
  });

  it("blocks MCP calls when the tenant threshold denies the request", async () => {
    mocks.getBillingOverview.mockResolvedValue(
      overview(["mcp.read_tools"], {
        metricKey: "mcp.calls",
        allowed: false,
      }),
    );

    await expect(
      executeRuntimeToolForTenant("tenant.usage.summary", { message: "usage?" }, tenantId),
    ).rejects.toBeInstanceOf(RuntimeToolExecutionError);
    expect(mocks.recordUsageMetric).not.toHaveBeenCalled();
  });
});

function overview(
  featureKeys: string[],
  blockedThreshold?: { metricKey: string; allowed: boolean },
) {
  return {
    tenantId,
    currentPlan: {
      id: "22222222-2222-4222-8222-222222222222",
      planKey: "growth",
      name: "Growth",
    },
    periodEnd: "2026-07-01T00:00:00.000Z",
    billingPortalAvailable: true,
    snapshot: {
      status: "active",
      featureKeys,
      thresholdEvaluations: blockedThreshold
        ? [
            {
              threshold: {
                metricKey: blockedThreshold.metricKey,
                label: "MCP calls",
                enforcement: "block",
                limit: 10,
              },
              usage: { quantity: 10 },
              remaining: 0,
              state: "blocked",
              allowed: blockedThreshold.allowed,
            },
          ]
        : [],
    },
  };
}
