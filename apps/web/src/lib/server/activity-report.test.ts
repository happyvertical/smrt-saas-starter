import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildReportAdapterDescriptor: vi.fn(),
  queryReportMaterializedRows: vi.fn(),
  getAppDatabase: vi.fn(async () => ({ driver: "test" })),
  withActiveTenant: vi.fn(async (_tenantId: string, fn: () => Promise<unknown>) => await fn()),
}));

vi.mock("@happyvertical/smrt-reports", () => ({
  buildReportAdapterDescriptor: mocks.buildReportAdapterDescriptor,
  queryReportMaterializedRows: mocks.queryReportMaterializedRows,
}));
vi.mock("$lib/server/db", () => ({ getAppDatabase: mocks.getAppDatabase }));
vi.mock("$lib/server/tenant-context", () => ({ withActiveTenant: mocks.withActiveTenant }));

import {
  createTenantActivityReportRequest,
  getTenantActivityReport,
  getTenantActivityReportDescriptor,
} from "$lib/server/activity-report";

const tenantId = "11111111-1111-4111-8111-111111111111";
const descriptor = {
  resourceId: "@happyvertical/smrt-saas-web:TenantActivityReport#current",
  columns: ["id", "metric_key", "quantity", "window_start"].map((id) => ({ id })),
  dataTable: { manualPagination: true, manualSorting: true },
};

describe("tenant activity materialized report adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildReportAdapterDescriptor.mockResolvedValue(descriptor);
    mocks.queryReportMaterializedRows.mockResolvedValue({
      rows: [],
      total: { kind: "exact", value: 0 },
      queryFingerprint: "dq1_empty",
    });
  });

  it("exposes the report descriptor with the fixed aggregate-safe fields", async () => {
    await expect(getTenantActivityReportDescriptor()).resolves.toBe(descriptor);
    expect(mocks.buildReportAdapterDescriptor).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        tenantScope: "current",
        refreshPermission: "reports.refresh",
      }),
    );
  });

  it("builds one bounded public query with no caller-controlled projection", () => {
    expect(
      createTenantActivityReportRequest(tenantId, {
        metricKey: " mcp.calls ",
        page: 99_999,
        pageSize: 99_999,
        sort: "quantity",
        direction: "asc",
      }),
    ).toEqual({
      version: 1,
      requestId: `tenant-activity:${tenantId}:10000:100:quantity:asc:mcp.calls`,
      mode: "rows",
      projection: ["id", "metric_key", "window_start", "quantity"],
      filter: { kind: "condition", field: "metric_key", operator: "eq", value: "mcp.calls" },
      sort: [{ field: "quantity", direction: "asc" }],
      page: { kind: "offset", offset: 999_900, limit: 100 },
    });
  });

  it("queries inside the selected tenant and preserves the existing page DTO", async () => {
    mocks.queryReportMaterializedRows.mockResolvedValueOnce({
      rows: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          metric_key: "mcp.calls",
          window_start: new Date("2026-09-01T00:00:00.000Z"),
          quantity: 10,
          source: "must-not-leak",
        },
      ],
      total: { kind: "exact", value: 1 },
      queryFingerprint: "dq1_activity",
    });

    await expect(
      getTenantActivityReport(tenantId, {
        page: 1,
        pageSize: 1,
        sort: "quantity",
        direction: "desc",
      }),
    ).resolves.toEqual({
      descriptor,
      rows: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          metric_key: "mcp.calls",
          window_start: "2026-09-01T00:00:00.000Z",
          quantity: 10,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 1,
      queryFingerprint: "dq1_activity",
    });

    expect(mocks.withActiveTenant).toHaveBeenCalledWith(tenantId, expect.any(Function));
    expect(mocks.queryReportMaterializedRows).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        projection: ["id", "metric_key", "window_start", "quantity"],
        page: { kind: "offset", offset: 0, limit: 1 },
      }),
      expect.objectContaining({ execution: "visible" }),
    );
  });

  it("fails closed when a materialized field has an invalid type", async () => {
    mocks.queryReportMaterializedRows.mockResolvedValueOnce({
      rows: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          metric_key: "mcp.calls",
          window_start: "not-a-date",
          quantity: 10,
        },
      ],
      total: { kind: "exact", value: 1 },
      queryFingerprint: "dq1_bad",
    });

    await expect(getTenantActivityReport(tenantId)).rejects.toThrow(/invalid datetime field/);
  });
});
