import { createLogger } from "@happyvertical/logger";
import { parseWorkerJob, runWorkerCycle, type WorkerJobResult } from "./jobs.js";
import {
  enqueueMaintenanceJobs,
  parseWorkerMode,
  runQueuedMaintenanceJobsOnce,
  type SmrtWorkerRuntime,
  startSmrtWorkerRuntime,
} from "./smrt-jobs.js";

const logLevel =
  process.env.LOG_LEVEL === "debug"
    ? "debug"
    : process.env.LOG_LEVEL === "error"
      ? "error"
      : "info";
const logger = createLogger({ level: logLevel });

export async function main(): Promise<void> {
  const mode = parseWorkerMode(process.env.WORKER_MODE);
  const job = parseWorkerJob(process.env.WORKER_JOB);
  const limit = readPositiveInteger(process.env.WORKER_JOB_LIMIT);

  if (mode === "direct") {
    logResults(await runWorkerCycle({ job, limit, logger }));
    return;
  }

  if (mode === "enqueue") {
    logger.info("Enqueueing SMRT maintenance jobs", { job });
    logResults([await enqueueMaintenanceJobs({ job, limit, logger })]);
    return;
  }

  if (mode === "smrt-once") {
    logger.info("Running queued SMRT maintenance jobs once", { job });
    logResults(await runQueuedMaintenanceJobsOnce({ job, limit, logger }));
    return;
  }

  const runtime = await startSmrtWorkerRuntime({
    queue: process.env.WORKER_QUEUE,
    includeAgentQueue: readBoolean(process.env.WORKER_RUN_AGENT_QUEUE, true),
    startScheduleRunner: readBoolean(process.env.WORKER_RUN_SCHEDULER, true),
    ensureMaintenanceSchedules: readBoolean(process.env.WORKER_ENSURE_MAINTENANCE_SCHEDULES, true),
    logger,
  });
  await waitForShutdown(runtime);
}

function logResults(results: WorkerJobResult[]): void {
  for (const result of results) {
    logger.info("Worker job complete", { ...result });
  }
}

function readPositiveInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  return value === "true" || value === "1" || value === "yes";
}

async function waitForShutdown(runtime: SmrtWorkerRuntime): Promise<void> {
  await new Promise<void>((resolve) => {
    let stopping = false;
    const stop = () => {
      if (stopping) {
        return;
      }
      stopping = true;
      runtime
        .stop()
        .catch((error) =>
          logger.error("Worker shutdown failed", {
            message: error instanceof Error ? error.message : String(error),
          }),
        )
        .finally(resolve);
    };

    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit(process.exitCode ?? 0))
    .catch((error) => {
      logger.error("Worker failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    });
}
