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
});
