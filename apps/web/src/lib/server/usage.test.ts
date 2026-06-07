import { describe, expect, it } from "vitest";
import { summarizeUsageRecords } from "$lib/server/usage";

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
});
