import { field, smrt } from "@happyvertical/smrt-core";
import { groupBy, report, SmrtReport, sum } from "@happyvertical/smrt-reports";
import { TenantUsageMetric } from "@happyvertical/smrt-subscriptions";
import { TenantScoped, tenantId } from "@happyvertical/smrt-tenancy";

/** Neutral, tenant-partitioned usage aggregate used by the starter report. */
@TenantScoped({ mode: "required" })
@report({ source: TenantUsageMetric, refresh: { mode: "rebuild", manual: true } })
@smrt({
  tableName: "starter_tenant_activity_report",
  conflictColumns: ["tenant_id", "metric_key", "window_start"],
  api: false,
  cli: false,
  mcp: false,
})
export class TenantActivityReport extends SmrtReport {
  @tenantId()
  tenantId?: string;

  @groupBy("metricKey")
  @field({ type: "text", required: true })
  metricKey = "";

  @groupBy("windowStart")
  @field({ type: "datetime", required: true })
  windowStart = new Date();

  @sum("quantity")
  @field({ type: "integer", required: true })
  quantity = 0;

  @field({ type: "datetime", nullable: true })
  refreshedAt: Date | null = null;
}
