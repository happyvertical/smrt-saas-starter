import { requirePermission, starterPermissions } from "$lib/server/authz";
import { getBillingOverview } from "$lib/server/subscriptions";
import { getUsageSummaries } from "$lib/server/usage";
import { readableMetricLabel, usageMetricUnit } from "$lib/usage-metrics";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const membership = await requirePermission(locals, starterPermissions.usageRead);
  const [summaries, overview] = await Promise.all([
    getUsageSummaries(membership.tenantId),
    getBillingOverview(membership.tenantId),
  ]);

  return {
    planName: overview.currentPlan.name,
    periodEnd: overview.periodEnd,
    snapshot: overview.snapshot,
    summaries: summaries.map((summary) => ({
      metricKey: summary.metricKey,
      label: readableMetricLabel(summary.metricKey),
      quantity: summary.quantity,
      unit: usageMetricUnit(summary.metricKey),
      windowStart: summary.windowStart.toISOString(),
      windowEnd: summary.windowEnd.toISOString(),
    })),
  };
};
