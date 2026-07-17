import type { SmrtObjectOptions } from "@happyvertical/smrt-core";
import { field, SmrtObject, smrt } from "@happyvertical/smrt-core";
import type { JobExecutionContext } from "@happyvertical/smrt-jobs";
import {
  reconcileSubscriptions as runSubscriptionReconciliation,
  auditUsageThresholds as runUsageAudit,
  runWorkerCycle,
  type WorkerCycleJob,
  type WorkerJobResult,
  type WorkerLogger,
} from "./jobs.js";

export const STARTER_MAINTENANCE_JOB_OBJECT_TYPE = "StarterMaintenanceJob";

export interface StarterMaintenanceJobArgs {
  [key: string]: unknown;
  limit?: number | string;
  now?: string;
}

@smrt({
  tableName: "starter_maintenance_jobs",
  api: false,
  mcp: false,
  cli: false,
})
export class StarterMaintenanceJob extends SmrtObject {
  @field({ required: true, default: "starter-maintenance" })
  name = "starter-maintenance";

  constructor(options: SmrtObjectOptions = {}) {
    super(options);
  }

  async reconcileSubscriptions(
    args: StarterMaintenanceJobArgs = {},
    context?: JobExecutionContext,
  ): Promise<WorkerJobResult> {
    await context?.progress({
      stage: "subscriptions.reconcile",
      progress: 10,
      message: "Reconciling Stripe subscriptions",
    });

    const result = await runSubscriptionReconciliation({
      limit: readLimit(args.limit),
      logger: readWorkerLogger(context),
    });

    await emitResultProgress(context, result);
    return result;
  }

  async auditUsageThresholds(
    args: StarterMaintenanceJobArgs = {},
    context?: JobExecutionContext,
  ): Promise<WorkerJobResult> {
    await context?.progress({
      stage: "usage.audit",
      progress: 10,
      message: "Auditing tenant usage thresholds",
    });

    const result = await runUsageAudit({
      limit: readLimit(args.limit),
      now: readDate(args.now),
      logger: readWorkerLogger(context),
    });

    await emitResultProgress(context, result);
    return result;
  }

  async runAll(
    args: StarterMaintenanceJobArgs = {},
    context?: JobExecutionContext,
  ): Promise<WorkerJobResult[]> {
    await context?.progress({
      stage: "maintenance.all",
      progress: 5,
      message: "Running all starter maintenance jobs",
    });

    const results = await runWorkerCycle({
      job: "all" satisfies WorkerCycleJob,
      limit: readLimit(args.limit),
      now: readDate(args.now),
      logger: readWorkerLogger(context),
    });

    await context?.progress({
      stage: "maintenance.all",
      progress: 100,
      message: "Starter maintenance complete",
      data: { results },
    });

    return results;
  }
}

async function emitResultProgress(
  context: JobExecutionContext | undefined,
  result: WorkerJobResult,
): Promise<void> {
  await context?.progress({
    stage: result.job,
    progress: 100,
    message: "Starter maintenance job complete",
    data: { ...result },
  });
}

function readWorkerLogger(context: JobExecutionContext | undefined): WorkerLogger | undefined {
  return context?.logger;
}

function readLimit(value: number | string | undefined): number | undefined {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}
