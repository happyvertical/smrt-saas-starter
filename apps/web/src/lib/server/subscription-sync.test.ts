import type { StripeWebhookEvent } from "@happyvertical/smrt-saas-objects";
import { describe, expect, it } from "vitest";
import {
  normalizeStripeSubscriptionUpdate,
  type SubscriptionSyncPlan,
  type SubscriptionSyncStore,
  type SyncedSubscriptionRecord,
  syncStripeBillingEvent,
} from "$lib/server/subscription-sync";

const tenantId = "11111111-1111-4111-8111-111111111111";
const growthPlan: SubscriptionSyncPlan = {
  id: "22222222-2222-4222-8222-222222222222",
  planKey: "growth",
};

describe("Stripe subscription sync", () => {
  it("creates a tenant subscription from checkout completion metadata", async () => {
    const store = new MemorySubscriptionStore([growthPlan]);
    const event = stripeEvent("checkout.session.completed", {
      id: "cs_test",
      object: "checkout.session",
      mode: "subscription",
      customer: "cus_test",
      subscription: "sub_test",
      client_reference_id: tenantId,
      metadata: {
        tenantId,
        planId: growthPlan.id,
      },
    });

    await expect(syncStripeBillingEvent(event, store)).resolves.toMatchObject({
      action: "created",
      tenantId,
      planId: growthPlan.id,
    });

    expect(store.subscriptions).toHaveLength(1);
    expect(store.subscriptions[0]).toMatchObject({
      tenantId,
      planId: growthPlan.id,
      status: "active",
      stripeCustomerId: "cus_test",
      stripeSubscriptionId: "sub_test",
      stripeCheckoutSessionId: "cs_test",
    });
  });

  it("updates the existing row from subscription events without tenant metadata", async () => {
    const store = new MemorySubscriptionStore(
      [growthPlan],
      [
        subscriptionRecord({
          tenantId,
          planId: growthPlan.id,
          stripeCustomerId: "cus_test",
          stripeSubscriptionId: "sub_test",
        }),
      ],
    );
    const event = stripeEvent("customer.subscription.updated", {
      id: "sub_test",
      object: "subscription",
      customer: "cus_test",
      status: "past_due",
      current_period_start: 1_780_272_000,
      current_period_end: 1_782_864_000,
      cancel_at_period_end: true,
      items: {
        data: [{ price: { id: "price_growth" } }],
      },
    });

    await expect(syncStripeBillingEvent(event, store)).resolves.toMatchObject({
      action: "updated",
      tenantId,
      planId: growthPlan.id,
    });

    expect(store.subscriptions).toHaveLength(1);
    expect(store.subscriptions[0]).toMatchObject({
      tenantId,
      status: "past_due",
      cancelAtPeriodEnd: true,
      stripeSubscriptionId: "sub_test",
    });
    expect(store.subscriptions[0]?.currentPeriodStart?.toISOString()).toBe(
      "2026-06-01T00:00:00.000Z",
    );
    expect(store.subscriptions[0]?.currentPeriodEnd?.toISOString()).toBe(
      "2026-07-01T00:00:00.000Z",
    );
  });

  it("marks matching subscriptions canceled when Stripe deletes them", async () => {
    const store = new MemorySubscriptionStore(
      [growthPlan],
      [
        subscriptionRecord({
          tenantId,
          planId: growthPlan.id,
          stripeCustomerId: "cus_test",
          stripeSubscriptionId: "sub_test",
          status: "active",
        }),
      ],
    );
    const event = stripeEvent("customer.subscription.deleted", {
      id: "sub_test",
      object: "subscription",
      customer: "cus_test",
      status: "canceled",
      canceled_at: 1_780_272_000,
    });

    await expect(syncStripeBillingEvent(event, store)).resolves.toMatchObject({
      action: "updated",
      tenantId,
    });

    expect(store.subscriptions).toHaveLength(1);
    expect(store.subscriptions[0]?.status).toBe("canceled");
    expect(store.subscriptions[0]?.canceledAt?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("ignores unrelated Stripe events", () => {
    expect(
      normalizeStripeSubscriptionUpdate(
        stripeEvent("invoice.paid", {
          id: "in_test",
          object: "invoice",
          customer: "cus_test",
        }),
      ),
    ).toBeNull();
  });
});

class MemorySubscriptionStore implements SubscriptionSyncStore {
  readonly subscriptions: SyncedSubscriptionRecord[];
  private readonly plans: SubscriptionSyncPlan[];

  constructor(plans: SubscriptionSyncPlan[], subscriptions: SyncedSubscriptionRecord[] = []) {
    this.plans = plans;
    this.subscriptions = [...subscriptions];
  }

  async findCurrentByTenant(tenantId: string): Promise<SyncedSubscriptionRecord | null> {
    return this.subscriptions.find((subscription) => subscription.tenantId === tenantId) ?? null;
  }

  async findByStripeSubscriptionId(
    stripeSubscriptionId: string,
  ): Promise<SyncedSubscriptionRecord | null> {
    return (
      this.subscriptions.find(
        (subscription) => subscription.stripeSubscriptionId === stripeSubscriptionId,
      ) ?? null
    );
  }

  async findByStripeCustomerId(stripeCustomerId: string): Promise<SyncedSubscriptionRecord | null> {
    return (
      this.subscriptions.find(
        (subscription) => subscription.stripeCustomerId === stripeCustomerId,
      ) ?? null
    );
  }

  async findPlanByIdOrKey(planIdOrKey: string): Promise<SubscriptionSyncPlan | null> {
    return (
      this.plans.find((plan) => plan.id === planIdOrKey || plan.planKey === planIdOrKey) ?? null
    );
  }

  async findPlanByStripePriceId(stripePriceId: string): Promise<SubscriptionSyncPlan | null> {
    return stripePriceId === "price_growth" ? growthPlan : null;
  }

  async upsertTenantSubscription(record: SyncedSubscriptionRecord): Promise<void> {
    const index = this.subscriptions.findIndex(
      (subscription) => subscription.tenantId === record.tenantId,
    );

    if (index === -1) {
      this.subscriptions.push(record);
      return;
    }

    this.subscriptions[index] = record;
  }
}

function subscriptionRecord(
  overrides: Partial<SyncedSubscriptionRecord>,
): SyncedSubscriptionRecord {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    slug: "demo-subscription",
    tenantId,
    planId: growthPlan.id,
    status: "active",
    startedAt: new Date("2026-06-01T00:00:00.000Z"),
    currentPeriodStart: new Date("2026-06-01T00:00:00.000Z"),
    currentPeriodEnd: new Date("2026-07-01T00:00:00.000Z"),
    trialEndsAt: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    stripeCustomerId: "",
    stripeSubscriptionId: "",
    stripeCheckoutSessionId: "",
    metadata: {},
    ...overrides,
  };
}

function stripeEvent(type: string, object: Record<string, unknown>): StripeWebhookEvent {
  return {
    id: `evt_${type.replaceAll(".", "_")}`,
    type,
    data: {
      provider: "stripe",
      timestamp: "2026-06-07T00:00:00.000Z",
      resourceType: "customer",
      resourceId: typeof object.id === "string" ? object.id : undefined,
      payload: {
        id: `evt_${type.replaceAll(".", "_")}`,
        type,
        created: 1_780_790_400,
        data: { object },
      },
    },
  };
}
