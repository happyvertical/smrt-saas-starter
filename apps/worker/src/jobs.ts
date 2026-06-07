import type { UsageMetricRecord } from "@happyvertical/smrt-subscriptions";

export interface WorkerJobResult {
  job: string;
  processed: number;
}

export async function reconcileSubscriptions(): Promise<WorkerJobResult> {
  return {
    job: "subscriptions.reconcile",
    processed: 0,
  };
}

export async function rollupUsage(events: UsageMetricRecord[]): Promise<WorkerJobResult> {
  const summaryKeys = new Set(
    events.map((event) =>
      [
        event.tenantId,
        event.metricKey,
        event.windowStart.toISOString(),
        event.windowEnd.toISOString(),
      ].join(":"),
    ),
  );

  return {
    job: "usage.rollup",
    processed: summaryKeys.size,
  };
}
