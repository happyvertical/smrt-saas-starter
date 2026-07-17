import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enqueueMaintenanceJobs,
  ensureStarterMaintenanceSchedules,
  getNextCronDate,
  type MutableStarterMaintenanceSchedule,
  parseWorkerMode,
  resolveMaintenanceJobRequests,
  resolveStarterMaintenanceScheduleDefinitions,
  resolveTaskRunnerQueues,
} from "./smrt-jobs.js";

describe("getNextCronDate field bounds", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("steps the month field from its 1-based minimum", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 1, 12, 0, 0)); // 2026-02-01 12:00 local
    // `*/3` month is Jan(1), Apr(4), Jul(7), Oct(10); next after Feb is April.
    const next = getNextCronDate("0 0 1 */3 *");
    expect(next.getMonth() + 1).toBe(4);
    expect(next.getDate()).toBe(1);
    expect(next.getHours()).toBe(0);
    expect(next.getMinutes()).toBe(0);
  });

  it("steps the day-of-month field from its 1-based minimum", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 2, 12, 0, 0)); // 2026-06-02 12:00 local
    // `*/10` day-of-month is the 1st, 11th, 21st, 31st; next after the 2nd is the 11th.
    const next = getNextCronDate("0 0 */10 * *");
    expect(next.getMonth() + 1).toBe(6);
    expect(next.getDate()).toBe(11);
    expect(next.getHours()).toBe(0);
    expect(next.getMinutes()).toBe(0);
  });

  it("keeps 0-based hour stepping anchored at zero", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 2, 12, 30, 0)); // 2026-06-02 12:30 local
    // `*/5` hour is 0,5,10,15,20; next slot after 12:30 is hour 15.
    const next = getNextCronDate("0 */5 * * *");
    expect(next.getDate()).toBe(2);
    expect(next.getHours()).toBe(15);
    expect(next.getMinutes()).toBe(0);
  });
});

describe("SMRT worker job adapter", () => {
  it("parses worker modes with a queued one-shot default", () => {
    expect(parseWorkerMode(undefined)).toBe("smrt-once");
    expect(parseWorkerMode("runner")).toBe("runner");
    expect(parseWorkerMode("daemon")).toBe("runner");
    expect(parseWorkerMode("legacy")).toBe("direct");
    expect(parseWorkerMode("queued-once")).toBe("smrt-once");
  });

  it("resolves starter maintenance requests", () => {
    expect(resolveMaintenanceJobRequests("all", { limit: 25 })).toEqual([
      {
        job: "subscriptions.reconcile",
        method: "reconcileSubscriptions",
        args: { limit: 25 },
      },
      {
        job: "usage.audit",
        method: "auditUsageThresholds",
        args: { limit: 25 },
      },
    ]);
  });

  it("includes the SMRT agents queue whenever the schedule runner is enabled", () => {
    expect(
      resolveTaskRunnerQueues({
        queue: "starter-maintenance",
        includeAgentQueue: false,
        startScheduleRunner: true,
      }),
    ).toEqual(["starter-maintenance", "agents"]);
    expect(
      resolveTaskRunnerQueues({
        queue: "starter-maintenance",
        includeAgentQueue: false,
        startScheduleRunner: false,
      }),
    ).toEqual(["starter-maintenance"]);
    expect(
      resolveTaskRunnerQueues({
        queue: "agents",
        includeAgentQueue: true,
        startScheduleRunner: true,
      }),
    ).toEqual(["agents"]);
  });

  it("enqueues starter maintenance jobs into SMRT jobs", async () => {
    const created: unknown[] = [];
    const result = await enqueueMaintenanceJobs({
      job: "all",
      limit: 25,
      queue: "test-maintenance",
      collection: {
        async create(data) {
          created.push(data);
          return { id: `job-${created.length}` };
        },
      },
    });

    expect(result).toMatchObject({
      job: "smrt-jobs.enqueue",
      processed: 2,
      queued: 2,
      queue: "test-maintenance",
      jobIds: ["job-1", "job-2"],
    });
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({
      queue: "test-maintenance",
      objectType: "StarterMaintenanceJob",
      objectId: null,
      method: "reconcileSubscriptions",
      args: { limit: 25 },
    });
    expect(created[1]).toMatchObject({
      queue: "test-maintenance",
      objectType: "StarterMaintenanceJob",
      objectId: null,
      method: "auditUsageThresholds",
      args: { limit: 25 },
    });
  });

  it("resolves starter maintenance schedule defaults", () => {
    expect(
      resolveStarterMaintenanceScheduleDefinitions({
        limit: 10,
        subscriptionReconcileCron: "0 * * * *",
        usageAuditCron: "30 * * * *",
        timeoutMs: 120_000,
      }),
    ).toEqual([
      {
        job: "subscriptions.reconcile",
        method: "reconcileSubscriptions",
        args: { limit: 10 },
        cron: "0 * * * *",
        timeout: 120_000,
      },
      {
        job: "usage.audit",
        method: "auditUsageThresholds",
        args: { limit: 10 },
        cron: "30 * * * *",
        timeout: 120_000,
      },
    ]);
  });

  it("creates missing schedules and updates drifted schedules", async () => {
    const drifted = memorySchedule({
      method: "auditUsageThresholds",
      cron: "0 * * * *",
      enabled: false,
      status: "disabled",
      methodArgs: {},
      timeout: 1,
    });
    const created: unknown[] = [];

    await expect(
      ensureStarterMaintenanceSchedules({
        limit: 10,
        subscriptionReconcileCron: "0 * * * *",
        usageAuditCron: "30 * * * *",
        timeoutMs: 120_000,
        schedules: {
          async listByJobObject() {
            return [drifted];
          },
          async create(definition) {
            created.push(definition);
          },
        },
      }),
    ).resolves.toEqual({
      job: "smrt-jobs.schedules.ensure",
      processed: 2,
      updated: 2,
      skipped: 0,
    });

    expect(created).toEqual([
      {
        job: "subscriptions.reconcile",
        method: "reconcileSubscriptions",
        args: { limit: 10 },
        cron: "0 * * * *",
        timeout: 120_000,
      },
    ]);
    expect(drifted.save).toHaveBeenCalledTimes(1);
    expect(drifted.calculateNextRun).toHaveBeenCalledTimes(1);
    expect(drifted).toMatchObject({
      cron: "30 * * * *",
      enabled: true,
      status: "active",
      methodArgs: { limit: 10 },
      timeout: 120_000,
      maxConcurrent: 1,
      runningCount: 0,
    });
  });
});

function memorySchedule(
  overrides: Partial<MutableStarterMaintenanceSchedule>,
): MutableStarterMaintenanceSchedule {
  return {
    method: "reconcileSubscriptions",
    cron: "*/15 * * * *",
    enabled: true,
    status: "active",
    methodArgs: {},
    timeout: 300_000,
    maxConcurrent: 1,
    runningCount: 0,
    save: vi.fn(async () => undefined),
    calculateNextRun: vi.fn(),
    ...overrides,
  };
}
