import { describe, expect, it } from "vitest";
import { mergeUsageSummaries, summarizeUsageRecords } from "$lib/server/usage";

describe("tenant usage metrics", () => {
  it("records and summarizes tenant-scoped usage records", () => {
    const windowStart = new Date("2026-06-01T00:00:00.000Z");
    const windowEnd = new Date("2026-07-01T00:00:00.000Z");

    expect(
      summarizeUsageRecords(
        [
          {
            tenantId: "acme",
            metricKey: "mcp.calls",
            quantity: 1,
            windowStart,
            windowEnd,
            source: "smrt-app-mcp",
            sourceId: "tenant.usage.summary",
            dimensions: { readOnly: true },
          },
          {
            tenantId: "acme",
            metricKey: "mcp.calls",
            quantity: 2,
            windowStart,
            windowEnd,
            source: "smrt-app-mcp",
          },
          {
            tenantId: "demo",
            metricKey: "mcp.calls",
            quantity: 128,
            windowStart,
            windowEnd,
            source: "smrt-app-mcp",
          },
        ],
        "acme",
      ),
    ).toEqual([
      {
        tenantId: "acme",
        metricKey: "mcp.calls",
        quantity: 3,
        windowStart,
        windowEnd,
      },
    ]);
  });

  it("merges summaries for the requested tenant instead of defaulting to demo", () => {
    const windowStart = new Date("2026-06-01T00:00:00.000Z");
    const windowEnd = new Date("2026-07-01T00:00:00.000Z");
    const tenantId = "11111111-1111-4111-8111-111111111111";

    expect(
      mergeUsageSummaries(
        [
          {
            tenantId,
            metricKey: "mcp.calls",
            quantity: 2,
            windowStart,
            windowEnd,
          },
          {
            tenantId,
            metricKey: "mcp.calls",
            quantity: 3,
            windowStart,
            windowEnd,
          },
          {
            tenantId: "00000000-0000-4000-8000-000000000001",
            metricKey: "mcp.calls",
            quantity: 128,
            windowStart,
            windowEnd,
          },
        ],
        tenantId,
      ),
    ).toEqual([
      {
        tenantId,
        metricKey: "mcp.calls",
        quantity: 5,
        windowStart,
        windowEnd,
      },
    ]);
  });
});
