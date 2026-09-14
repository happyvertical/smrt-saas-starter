import { createHash } from "node:crypto";
import { queryReportMaterializedRows } from "@happyvertical/smrt-reports";
import { TenantActivityReport } from "../models/TenantActivityReport.js";

export interface ReportOperationDatabase {
  query(sql: string, ...params: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface ActivityReportOperationQuery {
  page?: number;
  pageSize?: number;
  sort?: "id" | "metric_key" | "window_start" | "quantity";
  direction?: "asc" | "desc";
  metricKey?: string;
}

export interface ActivityReportSnapshot {
  schema: "starter-activity-report-snapshot:v1";
  query: Required<ActivityReportOperationQuery>;
  rows: Array<{ id: string; metric_key: string; window_start: string; quantity: number }>;
  total: number;
  capturedAt: string;
}

export function normalizeActivityReportOperationQuery(
  value: ActivityReportOperationQuery = {},
): Required<ActivityReportOperationQuery> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => !["page", "pageSize", "sort", "direction", "metricKey"].includes(key),
    )
  )
    throw new Error("Invalid report query");
  if (
    value.page !== undefined &&
    (!Number.isSafeInteger(value.page) || value.page < 1 || value.page > 10000)
  )
    throw new Error("Invalid report page");
  if (
    value.pageSize !== undefined &&
    (!Number.isSafeInteger(value.pageSize) || value.pageSize < 1 || value.pageSize > 100)
  )
    throw new Error("Invalid report page size");
  if (
    value.sort !== undefined &&
    !["id", "metric_key", "window_start", "quantity"].includes(value.sort)
  )
    throw new Error("Invalid report sort");
  if (value.direction !== undefined && !["asc", "desc"].includes(value.direction))
    throw new Error("Invalid report direction");
  if (
    value.metricKey !== undefined &&
    (typeof value.metricKey !== "string" || value.metricKey.length > 200)
  )
    throw new Error("Invalid report activity filter");
  const page = value.page ?? 1;
  const pageSize = value.pageSize ?? 25;
  const sort = value.sort ?? "window_start";
  const direction = value.direction ?? "desc";
  return { page, pageSize, sort, direction, metricKey: value.metricKey?.trim() ?? "" };
}

export function activityReportOperationFingerprint(
  query: Required<ActivityReportOperationQuery>,
): string {
  return createHash("sha256").update(JSON.stringify(query)).digest("hex");
}

/** Executes the same report adapter projection/policy used by browser report reads. */
export async function captureActivityReportSnapshot(
  db: ReportOperationDatabase,
  tenantId: string,
  input: ActivityReportOperationQuery = {},
): Promise<ActivityReportSnapshot> {
  const query = normalizeActivityReportOperationQuery(input);
  const request = {
    version: 1 as const,
    requestId: `report-operation:${tenantId}:${activityReportOperationFingerprint(query)}`,
    mode: "rows" as const,
    projection: ["id", "metric_key", "window_start", "quantity"],
    ...(query.metricKey
      ? {
          filter: {
            kind: "condition" as const,
            field: "metric_key",
            operator: "eq" as const,
            value: query.metricKey,
          },
        }
      : {}),
    sort: [{ field: query.sort, direction: query.direction }],
    page: {
      kind: "offset" as const,
      offset: (query.page - 1) * query.pageSize,
      limit: query.pageSize,
    },
  };
  const result = await queryReportMaterializedRows(TenantActivityReport, request, {
    db: db as never,
    adapter: activityReportOperationAdapterOptions,
    execution: "silent",
    lifecycle: {},
  });
  return {
    schema: "starter-activity-report-snapshot:v1",
    query,
    rows: result.rows.map(normalizeRow),
    total: result.total.kind === "exact" ? result.total.value : 0,
    capturedAt: new Date().toISOString(),
  };
}

export const activityReportOperationAdapterOptions = {
  tenantScope: "current" as const,
  refreshPermission: "reports.refresh",
  dataTable: {
    columns: {
      metric_key: { label: "Activity", responsive: { keepVisible: true, priority: 3 } },
      window_start: {
        label: "Window",
        valueFormat: "datetime" as const,
        responsive: { priority: 2 },
      },
      quantity: { label: "Count", valueFormat: "number" as const, responsive: { priority: 3 } },
    },
  },
};

function normalizeRow(value: unknown): {
  id: string;
  metric_key: string;
  window_start: string;
  quantity: number;
} {
  const row = value as Record<string, unknown>;
  if (typeof row?.id !== "string" || typeof row.metric_key !== "string")
    throw new Error("Invalid report row");
  const windowStart =
    row.window_start instanceof Date ? row.window_start.toISOString() : String(row.window_start);
  const quantity = Number(row.quantity);
  if (!Number.isFinite(quantity) || Number.isNaN(Date.parse(windowStart)))
    throw new Error("Invalid report row");
  return {
    id: row.id,
    metric_key: row.metric_key,
    window_start: new Date(windowStart).toISOString(),
    quantity,
  };
}
