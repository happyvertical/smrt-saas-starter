import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/usage", () => ({ getUsageSummaries: vi.fn() }));

describe("tenant activity report descriptor", () => {
  it("exposes only the aggregate-safe activity fields with manual paging and sorting", async () => {
    const { getTenantActivityReportDescriptor } = await import("$lib/server/activity-report");
    const descriptor = await getTenantActivityReportDescriptor();

    expect(descriptor.dataTable.manualPagination).toBe(true);
    expect(descriptor.dataTable.manualSorting).toBe(true);
    expect(descriptor.columns.map((column) => column.id)).toEqual([
      "id",
      "metric_key",
      "quantity",
      "window_start",
    ]);
    expect(descriptor.columns.map((column) => column.id)).not.toContain("source");
    expect(descriptor.columns.map((column) => column.id)).not.toContain("dimensions");
  });

  it("uses the public report query envelope for a bounded tenant page", async () => {
    const usage = await import("$lib/server/usage");
    vi.mocked(usage.getUsageSummaries).mockResolvedValue([
      {
        tenantId: "tenant-a",
        metricKey: "mcp.calls",
        quantity: 3,
        windowStart: new Date("2026-09-01T00:00:00.000Z"),
        windowEnd: new Date("2026-10-01T00:00:00.000Z"),
      },
      {
        tenantId: "tenant-a",
        metricKey: "chat.messages",
        quantity: 2,
        windowStart: new Date("2026-09-02T00:00:00.000Z"),
        windowEnd: new Date("2026-10-02T00:00:00.000Z"),
      },
    ]);
    const { getTenantActivityReport } = await import("$lib/server/activity-report");

    const report = await getTenantActivityReport("tenant-a", {
      metricKey: "mcp.calls",
      page: 1,
      pageSize: 1,
      sort: "quantity",
      direction: "desc",
    });

    expect(report.total).toBe(1);
    expect(report.rows).toEqual([
      expect.objectContaining({ metric_key: "mcp.calls", quantity: 3 }),
    ]);
    expect(report.queryFingerprint).toEqual(expect.any(String));
    expect(usage.getUsageSummaries).toHaveBeenCalledWith("tenant-a");
  });
});
