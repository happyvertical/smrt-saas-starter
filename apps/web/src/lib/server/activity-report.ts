import {
  buildReportAdapterDescriptor,
  queryReportMaterializedRows,
  type ReportAdapterDescriptor,
  type ReportDataQueryResult,
} from "@happyvertical/smrt-reports";
import { TenantActivityReport } from "@happyvertical/smrt-saas-objects";
import type { DataQueryRequest } from "@happyvertical/smrt-types";
import { getAppDatabase } from "$lib/server/db";
import { withActiveTenant } from "$lib/server/tenant-context";

const PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const activityReportAdapterOptions = {
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

export interface TenantActivityReportQuery {
  page?: number;
  pageSize?: number;
  sort?: "id" | "metric_key" | "window_start" | "quantity";
  direction?: "asc" | "desc";
  metricKey?: string;
}

export interface TenantActivityReportPage {
  descriptor: ReportAdapterDescriptor;
  rows: Array<{ id: string; metric_key: string; window_start: string; quantity: number }>;
  total: number;
  page: number;
  pageSize: number;
  queryFingerprint: string;
  asOf?: string;
}

export function createTenantActivityReportRequest(
  tenantId: string,
  query: TenantActivityReportQuery = {},
): DataQueryRequest {
  const page = boundedPage(query.page);
  const pageSize = boundedPageSize(query.pageSize);
  const sort = query.sort ?? "window_start";
  const direction = query.direction ?? "desc";
  const metricKey = query.metricKey?.trim();

  return {
    version: 1,
    requestId: `tenant-activity:${tenantId}:${page}:${pageSize}:${sort}:${direction}:${metricKey ?? ""}`,
    mode: "rows",
    projection: ["id", "metric_key", "window_start", "quantity"],
    ...(metricKey
      ? { filter: { kind: "condition", field: "metric_key", operator: "eq", value: metricKey } }
      : {}),
    sort: [{ field: sort, direction }],
    page: { kind: "offset", offset: (page - 1) * pageSize, limit: pageSize },
  };
}

export async function queryTenantActivityReportRows(
  tenantId: string,
  query: TenantActivityReportQuery = {},
  options: {
    lifecycle?: boolean;
    execution?: "visible" | "silent";
    db?: Awaited<ReturnType<typeof getAppDatabase>>;
  } = {},
): Promise<ReportDataQueryResult> {
  return await executeTenantActivityReportRequest(
    tenantId,
    createTenantActivityReportRequest(tenantId, query),
    options,
  );
}

export async function executeTenantActivityReportRequest(
  tenantId: string,
  request: DataQueryRequest,
  options: {
    lifecycle?: boolean;
    execution?: "visible" | "silent";
    db?: Awaited<ReturnType<typeof getAppDatabase>>;
  } = {},
): Promise<ReportDataQueryResult> {
  const db = options.db ?? (await getAppDatabase());
  return await withActiveTenant(tenantId, async () =>
    queryReportMaterializedRows(TenantActivityReport, request, {
      db,
      adapter: activityReportAdapterOptions,
      ...(options.lifecycle ? { lifecycle: {} } : {}),
      execution: options.execution ?? "visible",
    }),
  );
}

export async function getTenantActivityReport(
  tenantId: string,
  query: TenantActivityReportQuery = {},
): Promise<TenantActivityReportPage> {
  const page = boundedPage(query.page);
  const pageSize = boundedPageSize(query.pageSize);
  const [descriptor, result] = await Promise.all([
    getTenantActivityReportDescriptor(),
    queryTenantActivityReportRows(tenantId, query, { lifecycle: true }),
  ]);

  return {
    descriptor,
    rows: result.rows.map((row) => ({
      id: requiredString(row.id),
      metric_key: requiredString(row.metric_key),
      window_start: requiredIsoString(row.window_start),
      quantity: requiredNumber(row.quantity),
    })),
    total: result.total.kind === "exact" ? result.total.value : 0,
    page,
    pageSize,
    queryFingerprint: result.queryFingerprint,
    ...((result.reportLifecycle?.snapshot?.asOf ?? result.freshness?.asOf)
      ? { asOf: result.reportLifecycle?.snapshot?.asOf ?? result.freshness?.asOf }
      : {}),
  };
}

export async function getTenantActivityReportDescriptor(): Promise<ReportAdapterDescriptor> {
  return await buildReportAdapterDescriptor(TenantActivityReport, activityReportAdapterOptions);
}

function boundedPage(value: number | undefined): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? Math.min(value, 10_000)
    : 1;
}

function boundedPageSize(value: number | undefined): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? Math.min(value, MAX_PAGE_SIZE)
    : PAGE_SIZE;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string") throw new Error("Report result contained an invalid string field");
  return value;
}

function requiredIsoString(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value)))
    return new Date(value).toISOString();
  throw new Error("Report result contained an invalid datetime field");
}

function requiredNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error("Report result contained an invalid numeric field");
  return value;
}
