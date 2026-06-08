import type { ThresholdEvaluation } from "@happyvertical/smrt-subscriptions";

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

export function assertMetricAllowed(
  evaluations: ThresholdEvaluation[],
  metricKey: string,
): ThresholdEvaluation | null {
  const evaluation = findThresholdEvaluation(evaluations, metricKey);
  if (evaluation && !evaluation.allowed) {
    throw new TenantQuotaError(evaluation);
  }
  return evaluation;
}
