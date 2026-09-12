import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBillingOverview: vi.fn(),
  resolveStarterPromptPreview: vi.fn(),
  getUsageSummaries: vi.fn(),
  recordTenantUsageSignal: vi.fn(),
  getTenantActivityReport: vi.fn(),
}));

vi.mock("$lib/server/subscriptions", () => ({
  getBillingOverview: mocks.getBillingOverview,
}));

vi.mock("$lib/server/experience", () => ({
  resolveStarterPromptPreview: mocks.resolveStarterPromptPreview,
}));

vi.mock("$lib/server/usage", () => ({
  getUsageSummaries: mocks.getUsageSummaries,
  recordTenantUsageSignal: mocks.recordTenantUsageSignal,
}));

vi.mock("$lib/server/activity-report", () => ({
  getTenantActivityReport: mocks.getTenantActivityReport,
}));

import {
  executeRuntimeToolForTenant,
  listRuntimeTools,
  RuntimeToolExecutionError,
} from "$lib/server/mcp";

const tenantId = "11111111-1111-4111-8111-111111111111";
const windowStart = new Date("2026-06-01T00:00:00.000Z");
const windowEnd = new Date("2026-07-01T00:00:00.000Z");
const dailyWindowStart = new Date("2026-06-08T00:00:00.000Z");
const dailyWindowEnd = new Date("2026-06-09T00:00:00.000Z");

describe("tenant MCP runtime tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      "tenant.activity-report.query",
    ]);
  });

  it("uses the report's server query contract and acknowledges the visible table result", async () => {
    mocks.getBillingOverview.mockResolvedValue(overview(["mcp.read_tools"]));
    mocks.getTenantActivityReport.mockResolvedValue({
      descriptor: { columns: [{ id: "metric_key" }] },
      rows: [{ id: "row-a", metric_key: "mcp.calls", window_start: "2026-06-01", quantity: 3 }],
      total: 3,
      page: 2,
      pageSize: 1,
      queryFingerprint: "fixture-query",
    });

    await expect(
      executeRuntimeToolForTenant(
        "tenant.activity-report.query",
        { page: 2, pageSize: 1, sort: "quantity", direction: "asc", metricKey: "mcp.calls" },
        tenantId,
      ),
    ).resolves.toMatchObject({
      response: {
        content: [{ text: "Tenant activity report page 2 of 3 loaded (3 rows total)." }],
        structuredContent: {
          tenantId,
          report: {
            total: 3,
            page: 2,
            pageSize: 1,
            queryFingerprint: "fixture-query",
            query: {
              page: 2,
              pageSize: 1,
              sort: "quantity",
              direction: "asc",
              metricKey: "mcp.calls",
            },
          },
        },
      },
    });
    expect(mocks.getTenantActivityReport).toHaveBeenCalledWith(tenantId, {
      page: 2,
      pageSize: 1,
      sort: "quantity",
      direction: "asc",
      metricKey: "mcp.calls",
    });
  });

  it("drops forbidden report fields and malformed query controls before querying", async () => {
    mocks.getBillingOverview.mockResolvedValue(overview(["mcp.read_tools"]));
    mocks.getTenantActivityReport.mockResolvedValue({
      descriptor: {},
      rows: [],
      total: 0,
      page: 1,
      pageSize: 25,
      queryFingerprint: "empty",
    });

    const execution = await executeRuntimeToolForTenant(
      "tenant.activity-report.query",
      {
        page: -1,
        pageSize: "100",
        sort: "source",
        direction: "sideways",
        metricKey: "x".repeat(121),
        source: "private",
      },
      tenantId,
    );
    expect(mocks.getTenantActivityReport).toHaveBeenCalledWith(tenantId, {});
    expect(execution.response.structuredContent).toMatchObject({
      report: {
        query: {
          page: 1,
          pageSize: 25,
          sort: "window_start",
          direction: "desc",
        },
      },
    });
  });

  it("executes available tools and records tenant-scoped MCP usage", async () => {
    mocks.getBillingOverview.mockResolvedValue(
      overview(["mcp.read_tools"], {
        metricKey: "mcp.calls",
        allowed: true,
      }),
    );

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

    expect(mocks.recordTenantUsageSignal).toHaveBeenCalledWith({
      tenantId,
      metricKey: "mcp.calls",
      quantity: 1,
      source: "smrt-app-mcp",
      sourceId: "tenant.subscription.summary",
      usageWindow: { start: windowStart, end: windowEnd },
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

    expect(mocks.recordTenantUsageSignal).toHaveBeenCalledWith(
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

  it("records MCP usage against the contained matching threshold window", async () => {
    mocks.getBillingOverview.mockResolvedValue(
      overview(
        ["mcp.read_tools"],
        [
          {
            metricKey: "mcp.calls",
            allowed: true,
            windowStart,
            windowEnd,
          },
          {
            metricKey: "mcp.calls",
            allowed: true,
            windowStart: dailyWindowStart,
            windowEnd: dailyWindowEnd,
          },
        ],
      ),
    );

    await executeRuntimeToolForTenant("tenant.usage.summary", { message: "usage?" }, tenantId);

    expect(mocks.recordTenantUsageSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        metricKey: "mcp.calls",
        usageWindow: { start: dailyWindowStart, end: dailyWindowEnd },
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
    expect(mocks.recordTenantUsageSignal).not.toHaveBeenCalled();
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
    expect(mocks.recordTenantUsageSignal).not.toHaveBeenCalled();
  });
});

function overview(
  featureKeys: string[],
  blockedThreshold?:
    | { metricKey: string; allowed: boolean; windowStart?: Date; windowEnd?: Date }
    | Array<{ metricKey: string; allowed: boolean; windowStart?: Date; windowEnd?: Date }>,
) {
  const thresholdInputs = blockedThreshold
    ? Array.isArray(blockedThreshold)
      ? blockedThreshold
      : [blockedThreshold]
    : [];

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
      thresholdEvaluations: thresholdInputs.map((threshold) => ({
        threshold: {
          metricKey: threshold.metricKey,
          label: "MCP calls",
          enforcement: "block",
          limit: 10,
          window: "month",
        },
        usage: {
          tenantId,
          metricKey: threshold.metricKey,
          quantity: threshold.allowed ? 9 : 10,
          windowStart: threshold.windowStart ?? windowStart,
          windowEnd: threshold.windowEnd ?? windowEnd,
        },
        remaining: threshold.allowed ? 1 : 0,
        ratio: threshold.allowed ? 0.9 : 1,
        state: threshold.allowed ? "ok" : "blocked",
        allowed: threshold.allowed,
      })),
    },
  };
}
