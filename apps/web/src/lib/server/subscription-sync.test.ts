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
const otherTenantId = "44444444-4444-4444-8444-444444444444";
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

  it("creates a tenant subscription from subscription metadata and price id", async () => {
    const store = new MemorySubscriptionStore([growthPlan]);
    const event = stripeEvent("customer.subscription.created", {
      id: "sub_test",
      object: "subscription",
      customer: "cus_test",
      status: "trialing",
      metadata: {
        tenantId,
      },
      current_period_start: 1_780_272_000,
      current_period_end: 1_782_864_000,
      items: {
        data: [{ price: { id: "price_growth" } }],
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
      status: "trialing",
      stripeCustomerId: "cus_test",
      stripeSubscriptionId: "sub_test",
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
    expect(store.subscriptions[0]?.metadata).toMatchObject({
      planKey: "growth",
      stripe: {
        priceId: "price_growth",
      },
    });
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

  it("does not rewrite an existing subscription when event tenant metadata conflicts", async () => {
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
    const event = stripeEvent("customer.subscription.updated", {
      id: "sub_test",
      object: "subscription",
      customer: "cus_test",
      status: "past_due",
      metadata: {
        tenantId: otherTenantId,
      },
      items: {
        data: [{ price: { id: "price_growth" } }],
      },
    });

    await expect(syncStripeBillingEvent(event, store)).resolves.toMatchObject({
      action: "ignored",
      reason: "tenant-mismatch",
      tenantId: otherTenantId,
    });

    expect(store.subscriptions).toHaveLength(1);
    expect(store.subscriptions[0]).toMatchObject({
      tenantId,
      status: "active",
      stripeSubscriptionId: "sub_test",
    });
  });

  it("preserves existing Stripe price metadata when later events omit price data", async () => {
    const store = new MemorySubscriptionStore(
      [growthPlan],
      [
        subscriptionRecord({
          tenantId,
          planId: growthPlan.id,
          stripeCustomerId: "cus_test",
          stripeSubscriptionId: "sub_test",
          metadata: {
            stripe: {
              priceId: "price_growth",
            },
          },
        }),
      ],
    );
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
      action: "updated",
      tenantId,
      planId: growthPlan.id,
    });

    expect(store.subscriptions[0]?.metadata).toMatchObject({
      stripe: {
        priceId: "price_growth",
        lastEventType: "checkout.session.completed",
      },
    });
  });

  it("ignores stale Stripe events older than the last synced event", async () => {
    const store = new MemorySubscriptionStore(
      [growthPlan],
      [
        subscriptionRecord({
          tenantId,
          planId: growthPlan.id,
          stripeCustomerId: "cus_test",
          stripeSubscriptionId: "sub_test",
          status: "active",
          metadata: {
            stripe: {
              lastEventAt: "2026-06-08T00:00:00.000Z",
              lastEventId: "evt_newer",
              lastEventType: "customer.subscription.updated",
              priceId: "price_growth",
            },
          },
        }),
      ],
    );
    const event = stripeEvent("customer.subscription.updated", {
      id: "sub_test",
      object: "subscription",
      customer: "cus_test",
      status: "past_due",
      items: {
        data: [{ price: { id: "price_growth" } }],
      },
    });

    await expect(syncStripeBillingEvent(event, store)).resolves.toMatchObject({
      action: "ignored",
      reason: "stale-event",
      tenantId,
    });

    expect(store.subscriptions[0]).toMatchObject({
      status: "active",
      stripeSubscriptionId: "sub_test",
    });
    expect(store.subscriptions[0]?.metadata).toMatchObject({
      stripe: {
        lastEventId: "evt_newer",
      },
    });
  });

  it("ignores an exact Stripe event-id replay (at-least-once redelivery)", async () => {
    const store = new MemorySubscriptionStore(
      [growthPlan],
      [
        subscriptionRecord({
          tenantId,
          planId: growthPlan.id,
          stripeCustomerId: "cus_test",
          stripeSubscriptionId: "sub_test",
          status: "active",
          metadata: {
            stripe: {
              // Older than the incoming event, so only the event-id match makes
              // this stale — proving the new dedup, not the timestamp check.
              lastEventAt: "2026-06-01T00:00:00.000Z",
              lastEventId: "evt_customer_subscription_updated",
              lastEventType: "customer.subscription.updated",
              priceId: "price_growth",
            },
          },
        }),
      ],
    );
    const event = stripeEvent("customer.subscription.updated", {
      id: "sub_test",
      object: "subscription",
      customer: "cus_test",
      status: "past_due",
      items: { data: [{ price: { id: "price_growth" } }] },
    });

    await expect(syncStripeBillingEvent(event, store)).resolves.toMatchObject({
      action: "ignored",
      reason: "stale-event",
      tenantId,
    });
    expect(store.subscriptions[0]).toMatchObject({ status: "active" });
  });

  it("applies a distinct Stripe event even when an earlier event was recorded", async () => {
    const store = new MemorySubscriptionStore(
      [growthPlan],
      [
        subscriptionRecord({
          tenantId,
          planId: growthPlan.id,
          stripeCustomerId: "cus_test",
          stripeSubscriptionId: "sub_test",
          status: "active",
          metadata: {
            stripe: {
              lastEventAt: "2026-06-01T00:00:00.000Z",
              lastEventId: "evt_previous",
              lastEventType: "customer.subscription.updated",
              priceId: "price_growth",
            },
          },
        }),
      ],
    );
    const event = stripeEvent("customer.subscription.updated", {
      id: "sub_test",
      object: "subscription",
      customer: "cus_test",
      status: "past_due",
      items: { data: [{ price: { id: "price_growth" } }] },
    });

    await expect(syncStripeBillingEvent(event, store)).resolves.toMatchObject({
      action: "updated",
      tenantId,
      planId: growthPlan.id,
    });
    expect(store.subscriptions[0]).toMatchObject({ status: "past_due" });
    expect(store.subscriptions[0]?.metadata).toMatchObject({
      stripe: { lastEventId: "evt_customer_subscription_updated" },
    });
  });

  it("ignores old subscription mutations matched only by Stripe customer id", async () => {
    const store = new MemorySubscriptionStore(
      [growthPlan],
      [
        subscriptionRecord({
          tenantId,
          planId: growthPlan.id,
          stripeCustomerId: "cus_test",
          stripeSubscriptionId: "sub_new",
          status: "active",
        }),
      ],
    );
    const event = stripeEvent("customer.subscription.deleted", {
      id: "sub_old",
      object: "subscription",
      customer: "cus_test",
      status: "canceled",
      canceled_at: 1_780_790_400,
    });

    await expect(syncStripeBillingEvent(event, store)).resolves.toMatchObject({
      action: "ignored",
      reason: "subscription-mismatch",
      tenantId,
    });

    expect(store.subscriptions[0]).toMatchObject({
      status: "active",
      stripeSubscriptionId: "sub_new",
    });
  });

  it("allows checkout completion to replace an existing Stripe subscription id", async () => {
    const store = new MemorySubscriptionStore(
      [growthPlan],
      [
        subscriptionRecord({
          tenantId,
          planId: growthPlan.id,
          stripeCustomerId: "cus_test",
          stripeSubscriptionId: "sub_old",
          status: "active",
        }),
      ],
    );
    const event = stripeEvent("checkout.session.completed", {
      id: "cs_test",
      object: "checkout.session",
      mode: "subscription",
      customer: "cus_test",
      subscription: "sub_new",
      client_reference_id: tenantId,
      metadata: {
        tenantId,
        planId: growthPlan.id,
      },
    });

    await expect(syncStripeBillingEvent(event, store)).resolves.toMatchObject({
      action: "updated",
      tenantId,
      planId: growthPlan.id,
    });

    expect(store.subscriptions[0]).toMatchObject({
      status: "active",
      stripeSubscriptionId: "sub_new",
    });
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
