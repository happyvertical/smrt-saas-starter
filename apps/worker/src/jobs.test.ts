import type { EntitlementResolution } from "@happyvertical/smrt-subscriptions";
import { describe, expect, it, vi } from "vitest";
import {
  auditUsageThresholds,
  type ReconcileSubscriptionRecord,
  reconcileSubscriptions,
  rollupUsage,
  runWorkerCycle,
  type SubscriptionReconciliationStore,
  type TenantUsageAuditResolver,
  type TenantUsageAuditStore,
} from "./jobs.js";

describe("worker jobs", () => {
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
      ok: 2,
      warned: 1,
      blocked: 1,
      observed: 2,
      failed: 0,
    });
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
    async listStripeSubscriptions() {
      return subscriptions;
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
    async listTenantIdsWithSubscriptions() {
      return tenantIds;
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
