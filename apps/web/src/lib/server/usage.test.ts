import { afterEach, describe, expect, it } from "vitest";
import { getUsageSummaries, recordUsageMetric, resetUsageMetricsForTest } from "$lib/server/usage";

describe("tenant usage metrics", () => {
  afterEach(() => {
    resetUsageMetricsForTest();
  });

  it("records and summarizes tenant-scoped usage records", () => {
    const windowStart = new Date("2026-06-01T00:00:00.000Z");
    const windowEnd = new Date("2026-07-01T00:00:00.000Z");

    recordUsageMetric({
      tenantId: "acme",
      metricKey: "mcp.calls",
      quantity: 1,
      windowStart,
      windowEnd,
      source: "smrt-app-mcp",
      sourceId: "tenant.usage.summary",
      dimensions: { readOnly: true },
    });
    recordUsageMetric({
      tenantId: "acme",
      metricKey: "mcp.calls",
      quantity: 2,
      windowStart,
      windowEnd,
      source: "smrt-app-mcp",
    });

    expect(getUsageSummaries("acme")).toEqual([
      {
        tenantId: "acme",
        metricKey: "mcp.calls",
        quantity: 3,
        windowStart,
        windowEnd,
      },
    ]);
    expect(
      getUsageSummaries("demo").find((summary) => summary.metricKey === "mcp.calls"),
    ).toMatchObject({ quantity: 128 });
  });
});
