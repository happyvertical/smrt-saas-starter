import { getTenantActivityReport } from "$lib/server/activity-report";
import { requirePermission, starterPermissions } from "$lib/server/authz";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const membership = await requirePermission(locals, starterPermissions.usageRead);
  const page = positiveInteger(url.searchParams.get("page"));
  const pageSize = positiveInteger(url.searchParams.get("pageSize"));
  const sort = readSort(url.searchParams.get("sort"));
  const direction = url.searchParams.get("direction") === "asc" ? "asc" : "desc";
  const metricKey = boundedMetricKey(url.searchParams.get("metricKey"));
  const report = await getTenantActivityReport(membership.tenantId, {
    ...(page ? { page } : {}),
    ...(pageSize ? { pageSize } : {}),
    ...(sort ? { sort } : {}),
    direction,
    ...(metricKey ? { metricKey } : {}),
  });

  return { ...report, tenantId: membership.tenantId };
};

function positiveInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readSort(
  value: string | null,
): "id" | "metric_key" | "window_start" | "quantity" | undefined {
  return value === "id" ||
    value === "metric_key" ||
    value === "window_start" ||
    value === "quantity"
    ? value
    : undefined;
}

function boundedMetricKey(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= 120 ? trimmed : undefined;
}
