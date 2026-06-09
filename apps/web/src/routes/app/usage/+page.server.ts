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
    thresholds: overview.snapshot.thresholdEvaluations.map((evaluation) => ({
      metricKey: evaluation.threshold.metricKey,
      label: evaluation.threshold.label ?? readableMetricLabel(evaluation.threshold.metricKey),
      enforcement: evaluation.threshold.enforcement,
      state: evaluation.state,
      allowed: evaluation.allowed,
      used: evaluation.usage.quantity,
      limit: evaluation.threshold.limit,
      remaining: evaluation.remaining,
      ratio: evaluation.ratio,
      unit: usageMetricUnit(evaluation.threshold.metricKey),
      window: evaluation.threshold.window,
      windowStart: evaluation.usage.windowStart.toISOString(),
      windowEnd: evaluation.usage.windowEnd.toISOString(),
    })),
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
