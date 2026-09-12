import { createHash } from "node:crypto";
import { ObjectRegistry, SmrtObject } from "@happyvertical/smrt-core";
import {
  buildReportAdapterDescriptor,
  queryReportMaterializedRows,
  type ReportAdapterDescriptor,
} from "@happyvertical/smrt-reports";
import "@happyvertical/smrt-subscriptions";
import { getUsageSummaries } from "$lib/server/usage";

const REPORT_CLASS = "TenantActivityReport";
const REPORT_NAMESPACE = "@happyvertical/smrt-saas";
const PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const activityReportAdapterOptions = {
  tenantScope: "current" as const,
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

/**
 * A neutral, aggregate-only tenant activity report. Source/provider/dimension
 * fields intentionally never enter the descriptor, so every consumer receives
 * the same redacted projection before rows are materialized.
 */
export class TenantActivityReport extends SmrtObject {
  declare metricKey: string;

  declare windowStart: Date;

  declare quantity: number;
}

registerTenantActivityReport();

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
}

export async function getTenantActivityReport(
  tenantId: string,
  query: TenantActivityReportQuery = {},
): Promise<TenantActivityReportPage> {
  const page = boundedPage(query.page);
  const pageSize = boundedPageSize(query.pageSize);
  const descriptor = await getTenantActivityReportDescriptor();
  const sort = query.sort ?? "window_start";
  const direction = query.direction ?? "desc";
  const metricKey = query.metricKey?.trim();
  const collection = new TenantActivityReportCollection(tenantId);
  const result = await queryReportMaterializedRows(
    TenantActivityReport,
    {
      version: 1,
      requestId: `tenant-activity:${tenantId}:${page}:${pageSize}:${sort}:${direction}:${metricKey ?? ""}`,
      mode: "rows",
      projection: ["id", "metric_key", "window_start", "quantity"],
      ...(metricKey
        ? { filter: { kind: "condition", field: "metric_key", operator: "eq", value: metricKey } }
        : {}),
      sort: [{ field: sort, direction }],
      page: { kind: "offset", offset: (page - 1) * pageSize, limit: pageSize },
    },
    { collection, adapter: activityReportAdapterOptions, execution: "visible" },
  );

  return {
    descriptor,
    rows: result.rows.map((row) => ({
      id: requiredString(row.id),
      metric_key: requiredString(row.metric_key),
      window_start: requiredString(row.window_start),
      quantity: requiredNumber(row.quantity),
    })),
    total: result.total.kind === "exact" ? result.total.value : 0,
    page,
    pageSize,
    queryFingerprint: result.queryFingerprint,
  };
}

export async function getTenantActivityReportDescriptor(): Promise<ReportAdapterDescriptor> {
  return await buildReportAdapterDescriptor(TenantActivityReport, activityReportAdapterOptions);
}

class TenantActivityReportCollection {
  constructor(private readonly tenantId: string) {}

  async list(options: Record<string, unknown> = {}): Promise<Record<string, unknown>[]> {
    const rows = await this.rows();
    const filtered = applyWhere(rows, options.where);
    const sorted = applySort(filtered, options.orderBy);
    const offset = boundedOffset(options.offset);
    const limit = boundedLimit(options.limit);
    return sorted.slice(offset, offset + limit).map((row) => selectRow(row, options.select));
  }

  async count(options?: { where?: unknown }): Promise<number> {
    return applyWhere(await this.rows(), options?.where).length;
  }

  private async rows(): Promise<Array<Record<string, unknown>>> {
    const summaries = await getUsageSummaries(this.tenantId);
    const grouped = new Map<string, { metricKey: string; windowStart: string; quantity: number }>();
    for (const summary of summaries.filter((candidate) => candidate.tenantId === this.tenantId)) {
      const windowStart = summary.windowStart.toISOString();
      const key = `${summary.metricKey}:${windowStart}`;
      const existing = grouped.get(key);
      grouped.set(key, {
        metricKey: summary.metricKey,
        windowStart,
        quantity: (existing?.quantity ?? 0) + summary.quantity,
      });
    }
    return [...grouped.values()].map((summary) => ({
      id: createHash("sha256")
        .update(`${this.tenantId}:${summary.metricKey}:${summary.windowStart}`)
        .digest("hex"),
      metricKey: summary.metricKey,
      windowStart: summary.windowStart,
      quantity: summary.quantity,
    }));
  }
}

function registerTenantActivityReport(): void {
  if (ObjectRegistry.getClassByConstructor(TenantActivityReport)) return;
  ObjectRegistry.registerFromManifest(
    REPORT_CLASS,
    {
      className: REPORT_CLASS,
      name: "tenantactivityreport",
      collection: "TenantActivityReportCollection",
      filePath: "src/lib/server/activity-report.ts",
      fields: {
        id: { type: "text", _meta: { __smrtSystemField: true } },
        metricKey: {
          type: "text",
          _meta: { __report: { kind: "group", sourceColumn: "metricKey" } },
        },
        windowStart: {
          type: "datetime",
          _meta: { __report: { kind: "group", sourceColumn: "windowStart" } },
        },
        quantity: {
          type: "decimal",
          _meta: { __report: { kind: "aggregate", fn: "sum", column: "quantity" } },
        },
      },
      methods: {},
      decoratorConfig: {
        tableName: "starter_tenant_activity_report",
        report: { source: "TenantUsageMetric" },
      },
      schema: {
        tableName: "starter_tenant_activity_report",
        ddl: "",
        columns: {},
        indexes: [],
        version: "1",
      },
    },
    REPORT_NAMESPACE,
  );
}

function applyWhere(
  rows: Array<Record<string, unknown>>,
  where: unknown,
): Array<Record<string, unknown>> {
  if (!where || typeof where !== "object") return rows;
  const groups = Array.isArray(where) ? where : [where];
  return rows.filter((row) =>
    groups.some(
      (group) =>
        Array.isArray(group) &&
        group.every(
          (condition) =>
            condition &&
            typeof condition === "object" &&
            Object.entries(condition as Record<string, unknown>).every(
              ([key, value]) => row[key] === value,
            ),
        ),
    ),
  );
}

function applySort(
  rows: Array<Record<string, unknown>>,
  orderBy: unknown,
): Array<Record<string, unknown>> {
  const first = Array.isArray(orderBy) ? orderBy[0] : orderBy;
  if (typeof first !== "string") return rows;
  const [field, direction] = first.split(/\s+/, 2);
  if (field !== "metricKey" && field !== "windowStart" && field !== "quantity" && field !== "id")
    return rows;
  const multiplier = direction?.toUpperCase() === "DESC" ? -1 : 1;
  return [...rows].sort((left, right) => {
    const a = left[field];
    const b = right[field];
    return (
      (typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a).localeCompare(String(b))) * multiplier
    );
  });
}

function selectRow(row: Record<string, unknown>, select: unknown): Record<string, unknown> {
  if (!Array.isArray(select)) return row;
  return Object.fromEntries(select.map((field) => [String(field), row[String(field)]]));
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

function boundedOffset(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function boundedLimit(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? Math.min(value, MAX_PAGE_SIZE)
    : PAGE_SIZE;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string") throw new Error("Report result contained an invalid string field");
  return value;
}

function requiredNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error("Report result contained an invalid numeric field");
  return value;
}
