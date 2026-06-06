import { summarizeUsage, type UsageEvent } from "@happyvertical/smrt-saas-objects";

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

export async function rollupUsage(events: UsageEvent[]): Promise<WorkerJobResult> {
  const summaries = summarizeUsage(events, "month");
  return {
    job: "usage.rollup",
    processed: summaries.length,
  };
}
