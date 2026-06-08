import type { ThresholdEvaluation, UsageWindow } from "@happyvertical/smrt-subscriptions";

export class TenantQuotaError extends Error {
  readonly status = 429;
  readonly metricKey: string;
  readonly evaluation: ThresholdEvaluation;

  constructor(evaluation: ThresholdEvaluation) {
    const label = evaluation.threshold.label ?? evaluation.threshold.metricKey;
    super(`Tenant exceeded the ${label} threshold`);
    this.name = "TenantQuotaError";
    this.metricKey = evaluation.threshold.metricKey;
    this.evaluation = evaluation;
  }
}

export function findThresholdEvaluation(
  evaluations: ThresholdEvaluation[],
  metricKey: string,
): ThresholdEvaluation | null {
  return evaluations.find((evaluation) => evaluation.threshold.metricKey === metricKey) ?? null;
}

export function findThresholdEvaluations(
  evaluations: ThresholdEvaluation[],
  metricKey: string,
): ThresholdEvaluation[] {
  return evaluations.filter((evaluation) => evaluation.threshold.metricKey === metricKey);
}

export function assertMetricAllowed(
  evaluations: ThresholdEvaluation[],
  metricKey: string,
): ThresholdEvaluation[] {
  const matches = findThresholdEvaluations(evaluations, metricKey);
  const blocked = matches.find((evaluation) => !evaluation.allowed);
  if (blocked) {
    throw new TenantQuotaError(blocked);
  }
  return matches;
}

export function getContainedThresholdUsageWindow(
  evaluations: ThresholdEvaluation[],
): UsageWindow | null {
  let start: Date | null = null;
  let end: Date | null = null;

  for (const evaluation of evaluations) {
    const windowStart = evaluation.usage.windowStart;
    const windowEnd = evaluation.usage.windowEnd;
    if (!start || windowStart > start) {
      start = windowStart;
    }
    if (!end || windowEnd < end) {
      end = windowEnd;
    }
  }

  if (!start || !end) {
    return null;
  }
  if (start >= end) {
    throw new Error("Matching threshold windows do not overlap");
  }
  return { start, end };
}
