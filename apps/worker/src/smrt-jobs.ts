import { randomUUID } from "node:crypto";
import { ObjectRegistry } from "@happyvertical/smrt-core";
import {
  createScheduleRunner,
  createTaskRunner,
  type JobStatus,
  type ScheduleRunner,
  SmrtJobCollection,
  type SmrtJobData,
  type TaskRunner,
} from "@happyvertical/smrt-jobs";
import {
  parseWorkerJob,
  type WorkerCycleJob,
  type WorkerJobResult,
  type WorkerLogger,
} from "./jobs.js";
import {
  STARTER_MAINTENANCE_JOB_OBJECT_TYPE,
  StarterMaintenanceJob,
  type StarterMaintenanceJobArgs,
} from "./maintenance-job.js";
import { ensureWorkerTenancy, getWorkerDatabase } from "./runtime.js";

export const STARTER_MAINTENANCE_QUEUE = "starter-maintenance";
export const SMRT_AGENT_QUEUE = "agents";

const DEFAULT_TASK_POLL_INTERVAL_MS = 1_000;
const DEFAULT_ONE_SHOT_POLL_INTERVAL_MS = 100;
const DEFAULT_SCHEDULE_POLL_INTERVAL_MS = 60_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_STALE_JOB_THRESHOLD_MS = 90_000;
const DEFAULT_JOB_TIMEOUT_MS = 300_000;
const DEFAULT_RUN_ONCE_TIMEOUT_MS = 60_000;

export type WorkerMode = "direct" | "enqueue" | "runner" | "smrt-once";
export type StarterMaintenanceJobName = Exclude<WorkerCycleJob, "all">;
export type StarterMaintenanceJobMethod = "reconcileSubscriptions" | "auditUsageThresholds";

export interface StarterMaintenanceJobRequest {
  job: StarterMaintenanceJobName;
  method: StarterMaintenanceJobMethod;
  args: StarterMaintenanceJobArgs;
}

export interface StarterMaintenanceScheduleDefinition extends StarterMaintenanceJobRequest {
  cron: string;
  timeout: number;
}

export interface EnqueuedMaintenanceJobsResult extends WorkerJobResult {
  queue: string;
  queued: number;
  jobIds: string[];
}

export interface SmrtJobCreator {
  create(data: SmrtJobData & Record<string, unknown>): Promise<{ id?: string | null }>;
}

export interface WorkerDatabase {
  query(sql: string, ...params: unknown[]): Promise<{ rows: unknown[] }>;
  close?(): Promise<void> | void;
}

export interface EnqueueMaintenanceJobsOptions {
  job?: WorkerCycleJob;
  limit?: number;
  queue?: string;
  runAt?: Date;
  database?: WorkerDatabase;
  collection?: SmrtJobCreator;
  logger?: WorkerLogger;
}

export interface EnsureStarterMaintenanceSchedulesOptions {
  enabled?: boolean;
  limit?: number;
  subscriptionReconcileCron?: string;
  usageAuditCron?: string;
  timeoutMs?: number;
  database?: WorkerDatabase;
  schedules?: StarterMaintenanceScheduleStore;
  logger?: WorkerLogger;
}

export interface StarterMaintenanceScheduleStore {
  listByJobObject(): Promise<MutableStarterMaintenanceSchedule[]>;
  create(definition: StarterMaintenanceScheduleDefinition): Promise<void>;
}

export interface MutableStarterMaintenanceSchedule {
  method: string;
  cron: string;
  enabled: boolean;
  status: string;
  methodArgs: Record<string, unknown>;
  timeout: number;
  maxConcurrent: number;
  runningCount: number;
  save(): Promise<unknown>;
  calculateNextRun?(): void;
}

export interface StartSmrtWorkerRuntimeOptions {
  database?: WorkerDatabase;
  queue?: string;
  includeAgentQueue?: boolean;
  startScheduleRunner?: boolean;
  ensureMaintenanceSchedules?: boolean;
  concurrency?: number;
  taskPollIntervalMs?: number;
  schedulePollIntervalMs?: number;
  heartbeatIntervalMs?: number;
  staleJobThresholdMs?: number;
  logger?: WorkerLogger;
  onJobCompleted?: (job: { id?: string | null }, result: unknown) => void;
  onJobFailed?: (job: { id?: string | null }, error: Error) => void;
}

export interface SmrtWorkerRuntime {
  taskRunner: TaskRunner;
  scheduleRunner: ScheduleRunner | null;
  stop(): Promise<void>;
}

export interface RunQueuedMaintenanceJobsOnceOptions extends EnqueueMaintenanceJobsOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export function parseWorkerMode(value: string | undefined): WorkerMode {
  switch (value?.trim().toLowerCase()) {
    case "direct":
    case "legacy":
      return "direct";
    case "enqueue":
      return "enqueue";
    case "runner":
    case "daemon":
      return "runner";
    case "once":
    case "smrt-once":
    case "queued-once":
      return "smrt-once";
    default:
      return "smrt-once";
  }
}

export function resolveMaintenanceJobRequests(
  job: WorkerCycleJob,
  args: StarterMaintenanceJobArgs = {},
): StarterMaintenanceJobRequest[] {
  const jobs: StarterMaintenanceJobName[] =
    job === "all" ? ["subscriptions.reconcile", "usage.audit"] : [job];

  return jobs.map((name) => ({
    job: name,
    method: name === "subscriptions.reconcile" ? "reconcileSubscriptions" : "auditUsageThresholds",
    args,
  }));
}

export function resolveStarterMaintenanceScheduleDefinitions(
  options: EnsureStarterMaintenanceSchedulesOptions = {},
): StarterMaintenanceScheduleDefinition[] {
  const timeout = options.timeoutMs ?? readPositiveInteger(process.env.WORKER_JOB_TIMEOUT_MS);
  const args = options.limit ? { limit: options.limit } : {};

  return [
    {
      ...resolveMaintenanceJobRequests("subscriptions.reconcile", args)[0],
      cron:
        options.subscriptionReconcileCron ??
        process.env.WORKER_SUBSCRIPTION_RECONCILE_CRON ??
        "*/15 * * * *",
      timeout: timeout ?? DEFAULT_JOB_TIMEOUT_MS,
    },
    {
      ...resolveMaintenanceJobRequests("usage.audit", args)[0],
      cron: options.usageAuditCron ?? process.env.WORKER_USAGE_AUDIT_CRON ?? "*/15 * * * *",
      timeout: timeout ?? DEFAULT_JOB_TIMEOUT_MS,
    },
  ];
}

export async function enqueueMaintenanceJobs(
  options: EnqueueMaintenanceJobsOptions = {},
): Promise<EnqueuedMaintenanceJobsResult> {
  ensureStarterMaintenanceJobRegistered();
  const selectedJob = options.job ?? parseWorkerJob(process.env.WORKER_JOB);
  const queue = options.queue ?? process.env.WORKER_QUEUE ?? STARTER_MAINTENANCE_QUEUE;
  const args = options.limit ? { limit: options.limit } : {};
  const requests = resolveMaintenanceJobRequests(selectedJob, args);
  const ownedDatabase = options.collection
    ? undefined
    : (options.database ?? (await getWorkerDatabase()));
  const collection = options.collection ?? (await createSmrtJobCollection(ownedDatabase));
  const jobIds: string[] = [];

  try {
    for (const request of requests) {
      const job = await collection.create({
        queue,
        objectType: STARTER_MAINTENANCE_JOB_OBJECT_TYPE,
        objectId: null,
        method: request.method,
        args: request.args,
        runAt: options.runAt ?? new Date(),
        priority: 60,
        maxAttempts: 3,
        timeout: readPositiveInteger(process.env.WORKER_JOB_TIMEOUT_MS) ?? DEFAULT_JOB_TIMEOUT_MS,
      } satisfies SmrtJobData & Record<string, unknown>);
      if (job.id) {
        jobIds.push(job.id);
      }
      options.logger?.info("Enqueued SMRT maintenance job", {
        job: request.job,
        method: request.method,
        queue,
        jobId: job.id,
      });
    }
  } finally {
    if (ownedDatabase && !options.database) {
      await closeWorkerDatabase(ownedDatabase, options.logger);
    }
  }

  return {
    job: "smrt-jobs.enqueue",
    processed: requests.length,
    queue,
    queued: requests.length,
    jobIds,
  };
}

export async function ensureStarterMaintenanceSchedules(
  options: EnsureStarterMaintenanceSchedulesOptions = {},
): Promise<WorkerJobResult> {
  if (options.enabled === false) {
    return {
      job: "smrt-jobs.schedules.ensure",
      processed: 0,
      skipped: 1,
      reason: "starter-maintenance-schedules-disabled",
    };
  }

  ensureStarterMaintenanceJobRegistered();
  const definitions = resolveStarterMaintenanceScheduleDefinitions(options);
  const ownedDatabase =
    options.schedules || options.database ? undefined : await getWorkerDatabase();
  const store =
    options.schedules ?? createStarterMaintenanceScheduleStore(options.database ?? ownedDatabase);
  let updated = 0;
  let skipped = 0;

  try {
    const existing = await store.listByJobObject();

    for (const definition of definitions) {
      const schedule = existing.find((candidate) => candidate.method === definition.method);
      if (!schedule) {
        await store.create(definition);
        updated += 1;
        continue;
      }

      if (!applyScheduleDefinition(schedule, definition)) {
        skipped += 1;
        continue;
      }

      await schedule.save();
      updated += 1;
    }
  } finally {
    if (ownedDatabase) {
      await closeWorkerDatabase(ownedDatabase, options.logger);
    }
  }

  const result = {
    job: "smrt-jobs.schedules.ensure",
    processed: definitions.length,
    updated,
    skipped,
  };
  options.logger?.info("Starter maintenance schedules ensured", result);
  return result;
}

export async function startSmrtWorkerRuntime(
  options: StartSmrtWorkerRuntimeOptions = {},
): Promise<SmrtWorkerRuntime> {
  ensureWorkerTenancy();
  ensureStarterMaintenanceJobRegistered();

  const database = options.database ?? (await getWorkerDatabase());
  if (options.ensureMaintenanceSchedules !== false) {
    await ensureStarterMaintenanceSchedules({
      limit: readPositiveInteger(process.env.WORKER_JOB_LIMIT),
      database,
      logger: options.logger,
    });
  }

  const queue = options.queue ?? process.env.WORKER_QUEUE ?? STARTER_MAINTENANCE_QUEUE;
  const queues = options.includeAgentQueue === false ? [queue] : [queue, SMRT_AGENT_QUEUE];
  const taskRunner = createTaskRunner({
    queues,
    concurrency: options.concurrency ?? readPositiveInteger(process.env.WORKER_CONCURRENCY) ?? 2,
    pollInterval: options.taskPollIntervalMs ?? DEFAULT_TASK_POLL_INTERVAL_MS,
    heartbeatInterval: options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
    staleJobThresholdMs: options.staleJobThresholdMs ?? DEFAULT_STALE_JOB_THRESHOLD_MS,
  });
  const scheduleRunner =
    options.startScheduleRunner === false
      ? null
      : createScheduleRunner({
          pollInterval: options.schedulePollIntervalMs ?? DEFAULT_SCHEDULE_POLL_INTERVAL_MS,
          taskHeartbeatInterval: options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
          staleJobThresholdMs: options.staleJobThresholdMs ?? DEFAULT_STALE_JOB_THRESHOLD_MS,
        });

  await taskRunner.initialize(database as Parameters<TaskRunner["initialize"]>[0]);
  if (scheduleRunner) {
    await scheduleRunner.initialize(database as Parameters<ScheduleRunner["initialize"]>[0]);
  }

  wireTaskRunner(taskRunner, scheduleRunner, options);
  wireScheduleRunner(scheduleRunner, options.logger);

  if (scheduleRunner) {
    await scheduleRunner.start();
  }
  await taskRunner.start();

  options.logger?.info("SMRT worker runtime started", {
    queue,
    queues,
    scheduler: Boolean(scheduleRunner),
    taskRunnerId: taskRunner.id,
    scheduleRunnerId: scheduleRunner?.id ?? null,
  });

  return {
    taskRunner,
    scheduleRunner,
    async stop() {
      await scheduleRunner?.stop();
      await taskRunner.stop();
    },
  };
}

export async function runQueuedMaintenanceJobsOnce(
  options: RunQueuedMaintenanceJobsOnceOptions = {},
): Promise<WorkerJobResult[]> {
  const database = options.database ?? (await getWorkerDatabase());
  const queue = options.queue ?? process.env.WORKER_QUEUE ?? STARTER_MAINTENANCE_QUEUE;
  const completed: WorkerJobResult[] = [];
  const failed: Error[] = [];
  let runtime: SmrtWorkerRuntime | null = null;
  let queuedCount = 0;

  try {
    const enqueueResult = await enqueueMaintenanceJobs({ ...options, database, queue });
    const jobIds = new Set(enqueueResult.jobIds);
    queuedCount = jobIds.size;

    if (jobIds.size === 0) {
      return [enqueueResult];
    }

    runtime = await startSmrtWorkerRuntime({
      database,
      queue,
      includeAgentQueue: false,
      startScheduleRunner: false,
      ensureMaintenanceSchedules: false,
      concurrency: Math.max(1, Math.min(jobIds.size, 2)),
      taskPollIntervalMs: options.pollIntervalMs ?? DEFAULT_ONE_SHOT_POLL_INTERVAL_MS,
      logger: options.logger,
      onJobCompleted(job, result) {
        if (job.id && jobIds.has(job.id)) {
          completed.push(toWorkerJobResult(result));
        }
      },
      onJobFailed(job, error) {
        if (job.id && jobIds.has(job.id)) {
          failed.push(error);
        }
      },
    });

    const summary = await waitForJobIds(database, jobIds, {
      timeoutMs: options.timeoutMs ?? DEFAULT_RUN_ONCE_TIMEOUT_MS,
      pollIntervalMs: options.pollIntervalMs ?? DEFAULT_ONE_SHOT_POLL_INTERVAL_MS,
    });

    if (summary.failed > 0 || failed.length > 0) {
      throw new Error(
        `SMRT maintenance jobs failed: ${summary.failed} failed, ${failed.length} runner errors`,
      );
    }
  } finally {
    await runtime?.stop();
    if (!options.database) {
      await closeWorkerDatabase(database, options.logger);
    }
  }

  return completed.length > 0
    ? completed
    : [
        {
          job: "smrt-jobs.run-once",
          processed: queuedCount,
        },
      ];
}

async function createSmrtJobCollection(database?: WorkerDatabase): Promise<SmrtJobCreator> {
  ensureWorkerTenancy();
  const db = database ?? (await getWorkerDatabase());
  const collection = await SmrtJobCollection.create({
    db,
  } as Parameters<typeof SmrtJobCollection.create>[0]);

  return {
    create(data) {
      return collection.create(data as Parameters<typeof collection.create>[0]);
    },
  };
}

async function closeWorkerDatabase(database: WorkerDatabase, logger?: WorkerLogger): Promise<void> {
  if (typeof database.close !== "function") {
    return;
  }

  try {
    await database.close();
  } catch (error) {
    logger?.warn("Failed to close worker database", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function createStarterMaintenanceScheduleStore(
  database: WorkerDatabase | undefined,
): StarterMaintenanceScheduleStore {
  if (!database) {
    throw new Error("Worker database is required to ensure SMRT maintenance schedules");
  }

  ensureWorkerTenancy();

  return {
    async listByJobObject() {
      const aliases = getStarterMaintenanceJobObjectTypeAliases();
      const placeholders = aliases.map(() => "?").join(", ");
      const result = await database.query(
        `SELECT id, method, cron, enabled, status, method_args, timeout, max_concurrent, running_count
           FROM _smrt_agent_schedules
          WHERE agent_type IN (${placeholders})
          ORDER BY next_run ASC
          LIMIT ?`,
        ...aliases,
        20,
      );
      return result.rows
        .map((row) => toMutableMaintenanceSchedule(database, row))
        .filter(isPresent);
    },
    async create(definition) {
      const now = new Date().toISOString();
      await database.query(
        `INSERT INTO _smrt_agent_schedules (
            id, slug, context, created_at, updated_at, tenant_id,
            agent_type, agent_id, agent_config, cron, timezone, enabled, status,
            last_run, next_run, last_status, last_error, run_count, success_count,
            failure_count, max_concurrent, running_count, timeout, method, method_args
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        toScheduleSlug(definition.method),
        "",
        now,
        now,
        null,
        STARTER_MAINTENANCE_JOB_OBJECT_TYPE,
        null,
        "{}",
        definition.cron,
        "UTC",
        true,
        "active",
        null,
        getNextCronDate(definition.cron).toISOString(),
        null,
        null,
        0,
        0,
        0,
        1,
        0,
        definition.timeout,
        definition.method,
        JSON.stringify(definition.args),
      );
    },
  };
}

function toMutableMaintenanceSchedule(
  database: WorkerDatabase,
  value: unknown,
): MutableStarterMaintenanceSchedule | null {
  const record = readRecord(value);
  const id = readString(record?.id);
  const method = readString(record?.method);
  if (!id || !method) {
    return null;
  }

  let nextRun = getNextCronDate(readString(record?.cron) ?? "*/15 * * * *");
  const schedule: MutableStarterMaintenanceSchedule = {
    method,
    cron: readString(record?.cron) ?? "*/15 * * * *",
    enabled: readBoolean(record?.enabled),
    status: readString(record?.status) ?? "active",
    methodArgs: readJsonObject(record?.method_args) ?? {},
    timeout: readInteger(record?.timeout) ?? DEFAULT_JOB_TIMEOUT_MS,
    maxConcurrent: readInteger(record?.max_concurrent) ?? 1,
    runningCount: readInteger(record?.running_count) ?? 0,
    calculateNextRun() {
      nextRun = getNextCronDate(schedule.cron);
    },
    async save() {
      await database.query(
        `UPDATE _smrt_agent_schedules
            SET updated_at = ?,
                cron = ?,
                enabled = ?,
                status = ?,
                next_run = ?,
                method_args = ?,
                timeout = ?,
                max_concurrent = ?,
                running_count = ?
          WHERE id = ?`,
        new Date().toISOString(),
        schedule.cron,
        schedule.enabled,
        schedule.status,
        nextRun.toISOString(),
        JSON.stringify(schedule.methodArgs),
        schedule.timeout,
        schedule.maxConcurrent,
        schedule.runningCount,
        id,
      );
    },
  };

  return schedule;
}

function toScheduleSlug(method: StarterMaintenanceJobMethod): string {
  return `starter-maintenance-${method.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`;
}

function getStarterMaintenanceJobObjectTypeAliases(): string[] {
  const registered = ObjectRegistry.getClass(STARTER_MAINTENANCE_JOB_OBJECT_TYPE);
  return [STARTER_MAINTENANCE_JOB_OBJECT_TYPE, registered?.name, registered?.qualifiedName].filter(
    (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index,
  );
}

function applyScheduleDefinition(
  schedule: MutableStarterMaintenanceSchedule,
  definition: StarterMaintenanceScheduleDefinition,
): boolean {
  let changed = false;

  if (schedule.cron !== definition.cron) {
    schedule.cron = definition.cron;
    changed = true;
  }
  if (!schedule.enabled) {
    schedule.enabled = true;
    changed = true;
  }
  if (schedule.status !== "active") {
    schedule.status = "active";
    changed = true;
  }
  if (schedule.timeout !== definition.timeout) {
    schedule.timeout = definition.timeout;
    changed = true;
  }
  if (schedule.maxConcurrent !== 1) {
    schedule.maxConcurrent = 1;
    changed = true;
  }
  if (schedule.runningCount < 0) {
    schedule.runningCount = 0;
    changed = true;
  }
  if (!sameJsonObject(schedule.methodArgs, definition.args)) {
    schedule.methodArgs = definition.args;
    changed = true;
  }

  if (changed) {
    schedule.calculateNextRun?.();
  }

  return changed;
}

function wireTaskRunner(
  taskRunner: TaskRunner,
  scheduleRunner: ScheduleRunner | null,
  options: StartSmrtWorkerRuntimeOptions,
): void {
  taskRunner.on("runner:started", () => options.logger?.info("SMRT TaskRunner started"));
  taskRunner.on("runner:stopped", () => options.logger?.info("SMRT TaskRunner stopped"));
  taskRunner.on("runner:error", (error) =>
    options.logger?.error("SMRT TaskRunner error", { message: error.message }),
  );
  taskRunner.on("job:started", (job) =>
    options.logger?.info("SMRT job started", readJobLogMetadata(job)),
  );
  taskRunner.on("job:completed", (job, result) => {
    options.logger?.info("SMRT job completed", readJobLogMetadata(job));
    options.onJobCompleted?.(job, result);
    const scheduleId = readScheduleId(job.args);
    if (scheduleId) {
      scheduleRunner?.handleJobCompletion(scheduleId, true).catch((error) =>
        options.logger?.error("Failed to mark scheduled job complete", {
          scheduleId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  });
  taskRunner.on("job:failed", (job, error) => {
    options.logger?.error("SMRT job failed", {
      ...readJobLogMetadata(job),
      message: error.message,
    });
    options.onJobFailed?.(job, error);
    const scheduleId = readScheduleId(job.args);
    if (scheduleId) {
      scheduleRunner?.handleJobCompletion(scheduleId, false, error.message).catch((nextError) =>
        options.logger?.error("Failed to mark scheduled job failed", {
          scheduleId,
          message: nextError instanceof Error ? nextError.message : String(nextError),
        }),
      );
    }
  });
  taskRunner.on("job:retrying", (job, error, delay) =>
    options.logger?.warn("SMRT job retrying", {
      ...readJobLogMetadata(job),
      delay,
      message: error.message,
    }),
  );
}

function wireScheduleRunner(scheduleRunner: ScheduleRunner | null, logger?: WorkerLogger): void {
  scheduleRunner?.on("runner:started", () => logger?.info("SMRT ScheduleRunner started"));
  scheduleRunner?.on("runner:stopped", () => logger?.info("SMRT ScheduleRunner stopped"));
  scheduleRunner?.on("runner:error", (error) =>
    logger?.error("SMRT ScheduleRunner error", { message: error.message }),
  );
  scheduleRunner?.on("schedule:triggered", (schedule) =>
    logger?.info("SMRT schedule triggered", {
      scheduleId: schedule.id,
      agentType: schedule.agentType,
      agentId: schedule.agentId,
      cron: schedule.cron,
    }),
  );
  scheduleRunner?.on("schedule:error", (schedule, error) =>
    logger?.error("SMRT schedule failed to trigger", {
      scheduleId: schedule.id,
      agentType: schedule.agentType,
      message: error.message,
    }),
  );
}

async function waitForJobIds(
  database: WorkerDatabase,
  jobIds: Set<string>,
  options: { timeoutMs: number; pollIntervalMs: number },
): Promise<{ completed: number; failed: number; cancelled: number }> {
  const deadline = Date.now() + options.timeoutMs;

  while (Date.now() <= deadline) {
    const statuses = await listJobStatuses(database, [...jobIds]);
    const active = statuses.filter((status) => status === "pending" || status === "running").length;

    if (active === 0) {
      return {
        completed: statuses.filter((status) => status === "completed").length,
        failed: statuses.filter((status) => status === "failed").length,
        cancelled: statuses.filter((status) => status === "cancelled").length,
      };
    }

    await sleep(options.pollIntervalMs);
  }

  throw new Error(`Timed out waiting for ${jobIds.size} SMRT maintenance job(s)`);
}

async function listJobStatuses(database: WorkerDatabase, jobIds: string[]): Promise<JobStatus[]> {
  if (jobIds.length === 0) {
    return [];
  }

  const placeholders = jobIds.map(() => "?").join(", ");
  const result = await database.query(
    `SELECT status FROM _smrt_jobs WHERE id IN (${placeholders})`,
    ...jobIds,
  );

  return result.rows.map((row) => readJobStatus(readRecord(row)?.status)).filter(isPresent);
}

function readScheduleId(args: Record<string, unknown> | string | undefined): string | null {
  const record = typeof args === "string" ? readJsonObject(args) : readRecord(args);
  const scheduleId = record?._scheduleId;
  return typeof scheduleId === "string" && scheduleId ? scheduleId : null;
}

function readJobLogMetadata(job: {
  id?: string | null;
  queue?: string;
  objectType?: string;
  method?: string;
}): Record<string, unknown> {
  return {
    jobId: job.id ?? null,
    queue: job.queue ?? null,
    objectType: job.objectType ?? null,
    method: job.method ?? null,
  };
}

function toWorkerJobResult(result: unknown): WorkerJobResult {
  const wrapper = readRecord(result);
  const record = readRecord(wrapper?.result) ?? wrapper;
  const job = record?.job;
  const processed = record?.processed;
  if (typeof job === "string" && typeof processed === "number") {
    return record as unknown as WorkerJobResult;
  }

  return {
    job: "smrt-jobs.completed",
    processed: 1,
  };
}

function ensureStarterMaintenanceJobRegistered(): void {
  void StarterMaintenanceJob;
}

function readPositiveInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readJobStatus(value: unknown): JobStatus | null {
  switch (value) {
    case "pending":
    case "running":
    case "completed":
    case "failed":
    case "cancelled":
      return value;
    default:
      return null;
  }
}

function sameJsonObject(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function readJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") {
    return readRecord(value);
  }

  try {
    return readRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    return value === "true" || value === "1";
  }
  return false;
}

function readInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : null;
  }
  return null;
}

function getNextCronDate(cron: string): Date {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: expected 5 fields, got ${parts.length}`);
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const candidate = new Date();
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  for (let index = 0; index < 525_600; index += 1) {
    if (
      matchesCronField(candidate.getMinutes(), minute) &&
      matchesCronField(candidate.getHours(), hour) &&
      matchesCronField(candidate.getDate(), dayOfMonth) &&
      matchesCronField(candidate.getMonth() + 1, month) &&
      matchesCronField(candidate.getDay(), dayOfWeek, { allowSundaySeven: true })
    ) {
      return candidate;
    }

    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  throw new Error(`Could not find next run date for cron: ${cron}`);
}

function matchesCronField(
  value: number,
  expression: string,
  options: { allowSundaySeven?: boolean } = {},
): boolean {
  return expression.split(",").some((part) => matchesCronPart(value, part.trim(), options));
}

function matchesCronPart(
  value: number,
  expression: string,
  options: { allowSundaySeven?: boolean },
): boolean {
  if (expression === "*") {
    return true;
  }

  const [range, stepText] = expression.split("/");
  const step = stepText ? Number.parseInt(stepText, 10) : null;
  if (stepText && (!Number.isInteger(step) || step === null || step <= 0)) {
    return false;
  }

  const [start, end] = parseCronRange(range, options);
  if (start === null || end === null || value < start || value > end) {
    return false;
  }

  return step === null ? true : (value - start) % step === 0;
}

function parseCronRange(
  value: string,
  options: { allowSundaySeven?: boolean },
): [number | null, number | null] {
  if (value === "*") {
    return [0, options.allowSundaySeven ? 6 : 59];
  }
  if (value.includes("-")) {
    const [start, end] = value.split("-");
    return [parseCronNumber(start, options), parseCronNumber(end, options)];
  }
  const parsed = parseCronNumber(value, options);
  return [parsed, parsed];
}

function parseCronNumber(
  value: string | undefined,
  options: { allowSundaySeven?: boolean },
): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    return null;
  }
  return options.allowSundaySeven && parsed === 7 ? 0 : parsed;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
