import { SmrtObject, smrt } from "@happyvertical/smrt-core";
import { TenantScoped, tenantId } from "@happyvertical/smrt-tenancy";

@TenantScoped({ mode: "required" })
@smrt({
  conflictColumns: ["tenant_id", "metric_key", "window_start", "source_id"],
  api: { include: ["list", "get", "create"] },
  mcp: { include: ["list", "get"] },
  cli: true,
})
export class TenantUsageMetric extends SmrtObject {
  @tenantId()
  tenantId = "";

  metricKey = "";
  value = 0.0;
  unit = "count";
  source = "smrt";
  sourceId = "";
  windowStart: Date = new Date();
  windowEnd: Date = new Date();
  tagsJson = "{}";

  getTags(): Record<string, string> {
    try {
      const parsed = JSON.parse(this.tagsJson);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, string>)
        : {};
    } catch {
      return {};
    }
  }

  setTags(tags: Record<string, string>): void {
    this.tagsJson = JSON.stringify(tags);
  }
}
