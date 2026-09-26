import type { EntitlementResolution } from "@happyvertical/smrt-subscriptions";
import { describe, expect, it, vi } from "vitest";
import {
  auditUsageThresholds,
  createSmrtSubscriptionReconciliationStore,
  createSmrtUsageAuditStore,
  type ReconcileSubscriptionRecord,
  reconcileSubscriptions,
  rollupUsage,
  runWorkerCycle,
  type SubscriptionReconciliationStore,
  type TenantUsageAuditResolver,
  type TenantUsageAuditStore,
  type WorkerDatabase,
} from "./jobs.js";

describe("worker jobs", () => {
  it("scopes production subscription stores to tenant subscribers", async () => {
    const query = vi.fn<WorkerDatabase["query"]>(async () => ({ rows: [] }));
    const db: WorkerDatabase = { query };

    const reconciliationStore = await createSmrtSubscriptionReconciliationStore(db);
    await reconciliationStore.listStripeSubscriptions(25);
    expect(query).toHaveBeenLastCalledWith(expect.stringMatching(/ORDER BY id ASC/), 25);
    expect(query.mock.calls.at(-1)?.[0]).not.toMatch(/AND id > \?/);
    await reconciliationStore.listStripeSubscriptions(25, "subscription-010");
    expect(query).toHaveBeenLastCalledWith(
      expect.stringMatching(
        /subscriber_kind = 'tenant'[\s\S]*subscriber_external_id = ''[\s\S]*external_provider = 'stripe'[\s\S]*id > \?[\s\S]*ORDER BY id ASC/,
      ),
      "subscription-010",
      25,
    );

    const usageStore = await createSmrtUsageAuditStore(db);
    await usageStore.listTenantIdsWithSubscriptions(30);
    expect(query).toHaveBeenLastCalledWith(expect.stringMatching(/ORDER BY tenant_id ASC/), 30);
    expect(query.mock.calls.at(-1)?.[0]).not.toMatch(/AND tenant_id > \?/);
    await usageStore.listTenantIdsWithSubscriptions(30, "tenant-010");
    expect(query).toHaveBeenLastCalledWith(
      expect.stringMatching(
        /subscriber_kind = 'tenant'[\s\S]*subscriber_external_id = ''[\s\S]*status IN[\s\S]*tenant_id > \?[\s\S]*ORDER BY tenant_id ASC/,
      ),
      "tenant-010",
      30,
    );
  });

  it("reconciles changed Stripe subscription status", async () => {
    const subscriptions = [baseSubscription({ status: "active" })];
    const updates: ReconcileSubscriptionRecord[] = [];
    const store = memoryReconciliationStore(subscriptions, updates);
    const billing = {
      retrieveSubscriptionStatus: vi.fn(async () => ({
        externalId: "sub_test",
        status: "past_due" as const,
        customerExternalId: "cus_test",
        currentPeriodStart: new Date("2026-06-01T00:00:00.000Z"),
        currentPeriodEnd: new Date("2026-07-01T00:00:00.000Z"),
        cancelAtPeriodEnd: false,
      })),
    };

    await expect(reconcileSubscriptions({ billing, store })).resolves.toEqual({
      job: "subscriptions.reconcile",
      processed: 1,
      updated: 1,
      skipped: 0,
      failed: 0,
    });
    expect(billing.retrieveSubscriptionStatus).toHaveBeenCalledWith("sub_test");
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      id: "subscription-1",
      status: "past_due",
      stripeCustomerId: "cus_test",
    });
  });

  it("skips reconciliation when billing is not configured", async () => {
    const store = memoryReconciliationStore([baseSubscription()]);

    await expect(reconcileSubscriptions({ billing: null, store })).resolves.toEqual({
      job: "subscriptions.reconcile",
      processed: 0,
      skipped: 1,
      reason: "billing-provider-not-configured",
    });
  });

  it("rejects non-positive worker page limits", async () => {
    await expect(
      reconcileSubscriptions({
        billing: null,
        store: memoryReconciliationStore([]),
        limit: 0,
      }),
    ).rejects.toThrow("positive integer");
    await expect(
      auditUsageThresholds({
        store: memoryUsageAuditStore([]),
        resolver: memoryUsageAuditResolver({}),
        limit: -1,
      }),
    ).rejects.toThrow("positive integer");
  });

  it("leaves unchanged subscriptions untouched", async () => {
    const periodStart = new Date("2026-06-01T00:00:00.000Z");
    const periodEnd = new Date("2026-07-01T00:00:00.000Z");
    const updates: ReconcileSubscriptionRecord[] = [];
    const store = memoryReconciliationStore(
      [
        baseSubscription({
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        }),
      ],
      updates,
    );
    const billing = {
      retrieveSubscriptionStatus: vi.fn(async () => ({
        externalId: "sub_test",
        status: "active" as const,
        customerExternalId: "cus_test",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      })),
    };

    await expect(reconcileSubscriptions({ billing, store })).resolves.toEqual({
      job: "subscriptions.reconcile",
      processed: 1,
      updated: 0,
      skipped: 1,
      failed: 0,
    });
    expect(updates).toHaveLength(0);
  });

  it("reconciles records after an unchanged first keyset page", async () => {
    const subscriptions = Array.from({ length: 101 }, (_, index) =>
      baseSubscription({
        id: `subscription-${String(index + 1).padStart(3, "0")}`,
        stripeSubscriptionId: `sub-${index + 1}`,
      }),
    );
    const updates: ReconcileSubscriptionRecord[] = [];
    const store = memoryReconciliationStore(subscriptions, updates);
    const billing = {
      retrieveSubscriptionStatus: vi.fn(async (stripeSubscriptionId: string) => ({
        externalId: stripeSubscriptionId,
        status: stripeSubscriptionId === "sub-101" ? ("past_due" as const) : ("active" as const),
        customerExternalId: "cus_test",
        cancelAtPeriodEnd: false,
      })),
    };

    await expect(reconcileSubscriptions({ billing, store, limit: 100 })).resolves.toEqual({
      job: "subscriptions.reconcile",
      processed: 101,
      updated: 1,
      skipped: 100,
      failed: 0,
    });
    expect(billing.retrieveSubscriptionStatus).toHaveBeenCalledWith("sub-101");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.id).toBe("subscription-101");
  });

  it("audits threshold states for subscribed tenants", async () => {
    const store = memoryUsageAuditStore(["tenant-1", "tenant-2"]);
    const resolver = memoryUsageAuditResolver({
      "tenant-1": entitlementResolution("tenant-1", ["ok", "warn"]),
      "tenant-2": entitlementResolution("tenant-2", ["blocked", "ok"], "observe"),
    });

    await expect(
      auditUsageThresholds({
        store,
        resolver,
        now: new Date("2026-06-08T00:00:00.000Z"),
      }),
    ).resolves.toEqual({
      job: "usage.audit",
      processed: 2,
      // tenant-1 (block enforcement): ok + warn. tenant-2 (observe): both
      // evaluations are informational, so they only count as observed — never
      // ok/blocked.
      ok: 1,
      warned: 1,
      blocked: 0,
      observed: 2,
      failed: 0,
    });
  });

  it("audits tenants after the first keyset page", async () => {
    const tenantIds = Array.from(
      { length: 101 },
      (_, index) => `tenant-${String(index + 1).padStart(3, "0")}`,
    );
    const resolver: TenantUsageAuditResolver = {
      resolveTenantEntitlements: vi.fn(async (tenantId: string) =>
        entitlementResolution(tenantId, tenantId === "tenant-101" ? ["warn"] : []),
      ),
    };

    await expect(
      auditUsageThresholds({
        store: memoryUsageAuditStore(tenantIds),
        resolver,
        limit: 100,
        now: new Date("2026-06-08T00:00:00.000Z"),
      }),
    ).resolves.toEqual({
      job: "usage.audit",
      processed: 101,
      ok: 0,
      warned: 1,
      blocked: 0,
      observed: 0,
      failed: 0,
    });
    expect(resolver.resolveTenantEntitlements).toHaveBeenCalledWith(
      "tenant-101",
      expect.anything(),
    );
  });

  it("does not warn or block for observe-enforcement thresholds reported as exceeded", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const store = memoryUsageAuditStore(["tenant-2"]);
    const resolver = memoryUsageAuditResolver({
      "tenant-2": entitlementResolution("tenant-2", ["blocked", "warn"], "observe"),
    });

    await expect(
      auditUsageThresholds({
        store,
        resolver,
        logger,
        now: new Date("2026-06-08T00:00:00.000Z"),
      }),
    ).resolves.toEqual({
      job: "usage.audit",
      processed: 1,
      ok: 0,
      warned: 0,
      blocked: 0,
      observed: 2,
      failed: 0,
    });
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      "Usage thresholds audited",
      expect.objectContaining({ blocked: 0, warned: 0, observed: 2 }),
    );
  });

  it("still blocks for block-enforcement thresholds while observing others", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const store = memoryUsageAuditStore(["tenant-1", "tenant-2"]);
    const resolver = memoryUsageAuditResolver({
      "tenant-1": entitlementResolution("tenant-1", ["blocked"]),
      "tenant-2": entitlementResolution("tenant-2", ["blocked"], "observe"),
    });

    await expect(
      auditUsageThresholds({
        store,
        resolver,
        logger,
        now: new Date("2026-06-08T00:00:00.000Z"),
      }),
    ).resolves.toEqual({
      job: "usage.audit",
      processed: 2,
      ok: 0,
      warned: 0,
      blocked: 1,
      observed: 1,
      failed: 0,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      "Usage thresholds exceeded",
      expect.objectContaining({ blocked: 1, observed: 1 }),
    );
  });

  it("runs a selected worker cycle", async () => {
    const store = memoryUsageAuditStore(["tenant-1"]);
    const resolver = memoryUsageAuditResolver({
      "tenant-1": entitlementResolution("tenant-1", []),
    });

    await expect(
      runWorkerCycle({ job: "usage.audit", usageStore: store, resolver }),
    ).resolves.toEqual([
      {
        job: "usage.audit",
        processed: 1,
        ok: 0,
        warned: 0,
        blocked: 0,
        observed: 0,
        failed: 0,
      },
    ]);
  });

  it("rolls up tenant usage events", async () => {
    await expect(
      rollupUsage([
        {
          tenantId: "demo",
          metricKey: "ai.tokens.total",
          quantity: 100,
          windowStart: new Date("2026-06-01T00:00:00.000Z"),
          windowEnd: new Date("2026-07-01T00:00:00.000Z"),
        },
        {
          tenantId: "demo",
          metricKey: "ai.tokens.total",
          quantity: 25,
          windowStart: new Date("2026-06-01T00:00:00.000Z"),
          windowEnd: new Date("2026-07-01T00:00:00.000Z"),
        },
      ]),
    ).resolves.toEqual({
      job: "usage.rollup",
      processed: 1,
    });
  });
});

function baseSubscription(
  overrides: Partial<ReconcileSubscriptionRecord> = {},
): ReconcileSubscriptionRecord {
  return {
    id: "subscription-1",
    tenantId: "tenant-1",
    status: "active",
    stripeCustomerId: "cus_test",
    stripeSubscriptionId: "sub_test",
    currentPeriodStart: null,
    currentPeriodEnd: null,
    trialEndsAt: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    metadata: {},
    ...overrides,
  };
}

function memoryReconciliationStore(
  subscriptions: ReconcileSubscriptionRecord[],
  updates: ReconcileSubscriptionRecord[] = [],
): SubscriptionReconciliationStore {
  return {
    async listStripeSubscriptions(limit, afterId) {
      return subscriptions
        .filter((subscription) => !afterId || subscription.id > afterId)
        .sort((left, right) => left.id.localeCompare(right.id))
        .slice(0, limit);
    },
    async updateStripeSubscription(subscription, update) {
      const next = { ...subscription, ...update };
      Object.assign(subscription, next);
      updates.push(next);
    },
  };
}

function memoryUsageAuditStore(tenantIds: string[]): TenantUsageAuditStore {
  return {
    async listTenantIdsWithSubscriptions(limit, afterTenantId) {
      return tenantIds
        .filter((tenantId) => !afterTenantId || tenantId > afterTenantId)
        .sort()
        .slice(0, limit);
    },
  };
}

function memoryUsageAuditResolver(
  resolutions: Record<string, EntitlementResolution>,
): TenantUsageAuditResolver {
  return {
    async resolveTenantEntitlements(tenantId) {
      const resolution = resolutions[tenantId];
      if (!resolution) {
        throw new Error(`Missing resolution for tenant ${tenantId}`);
      }
      return resolution;
    },
  };
}

function entitlementResolution(
  tenantId: string,
  states: Array<"ok" | "warn" | "blocked">,
  observedTenant: "observe" | "block" = "block",
): EntitlementResolution {
  return {
    tenantId,
    planId: "plan-growth",
    planKey: "growth",
    subscriptionId: `subscription-${tenantId}`,
    status: "active",
    featureKeys: ["mcp.write_tools"],
    thresholds: [],
    thresholdEvaluations: states.map((state, index) => ({
      threshold: {
        metricKey: `metric.${index}`,
        limit: 100,
        window: "month",
        enforcement: tenantId === "tenant-2" ? observedTenant : "block",
      },
      usage: {
        tenantId,
        metricKey: `metric.${index}`,
        quantity: state === "ok" ? 10 : state === "warn" ? 90 : 100,
        windowStart: new Date("2026-06-01T00:00:00.000Z"),
        windowEnd: new Date("2026-07-01T00:00:00.000Z"),
      },
      ratio: state === "ok" ? 0.1 : state === "warn" ? 0.9 : 1,
      state,
      allowed: state !== "blocked",
      remaining: state === "ok" ? 90 : state === "warn" ? 10 : 0,
    })),
    allowed: !states.includes("blocked"),
  };
}
