import { randomUUID } from "node:crypto";
import type { StripeWebhookEvent } from "@happyvertical/smrt-saas-objects";
import type { SubscriptionStatus } from "@happyvertical/smrt-subscriptions";
import { getAppDatabase } from "$lib/server/db";
import { getCurrentMonthWindow, isUuid, starterData } from "$lib/server/starter-data";

const STRIPE_SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

export interface StripeSubscriptionUpdate {
  eventId: string;
  eventType: string;
  eventCreatedAt: Date;
  tenantId?: string;
  planId?: string;
  stripePriceId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeCheckoutSessionId?: string;
  status?: SubscriptionStatus;
  startedAt?: Date;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  trialEndsAt?: Date | null;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: Date | null;
}

export interface SyncedSubscriptionRecord {
  id: string;
  slug: string;
  tenantId: string;
  planId: string;
  status: SubscriptionStatus;
  startedAt: Date;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  trialEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripeCheckoutSessionId: string;
  metadata: Record<string, unknown>;
}

export interface SubscriptionSyncPlan {
  id: string;
  planKey: string;
}

export interface SubscriptionSyncStore {
  findCurrentByTenant(tenantId: string): Promise<SyncedSubscriptionRecord | null>;
  findByStripeSubscriptionId(
    stripeSubscriptionId: string,
  ): Promise<SyncedSubscriptionRecord | null>;
  findByStripeCustomerId(stripeCustomerId: string): Promise<SyncedSubscriptionRecord | null>;
  findPlanByIdOrKey(planIdOrKey: string): Promise<SubscriptionSyncPlan | null>;
  findPlanByStripePriceId(stripePriceId: string): Promise<SubscriptionSyncPlan | null>;
  upsertTenantSubscription(record: SyncedSubscriptionRecord): Promise<void>;
}

export interface StripeBillingSyncResult {
  action: "created" | "updated" | "ignored";
  reason?: string;
  tenantId?: string;
  subscriptionId?: string;
  planId?: string;
}

export async function syncStripeBillingEvent(
  event: StripeWebhookEvent,
  store?: SubscriptionSyncStore,
): Promise<StripeBillingSyncResult> {
  const syncStore = store ?? (await createSmrtSubscriptionSyncStore());
  const update = normalizeStripeSubscriptionUpdate(event);
  if (!update) {
    return { action: "ignored", reason: "event-not-subscription-related" };
  }

  const existing = await findExistingSubscription(update, syncStore);
  const eventTenantId = validTenantId(update.tenantId);
  if (existing && eventTenantId && existing.tenantId !== eventTenantId) {
    return {
      action: "ignored",
      reason: "tenant-mismatch",
      tenantId: eventTenantId,
      subscriptionId: existing.id,
    };
  }

  if (existing && isStaleStripeEvent(existing, update)) {
    return {
      action: "ignored",
      reason: "stale-event",
      tenantId: existing.tenantId,
      subscriptionId: existing.id,
    };
  }

  if (existing && isDifferentSubscriptionMutation(existing, update)) {
    return {
      action: "ignored",
      reason: "subscription-mismatch",
      tenantId: existing.tenantId,
      subscriptionId: existing.id,
    };
  }

  const tenantId = eventTenantId ?? existing?.tenantId;
  if (!tenantId) {
    return { action: "ignored", reason: "tenant-not-resolved" };
  }

  const plan = await resolvePlan(update, existing, syncStore);
  if (!plan) {
    return { action: "ignored", reason: "plan-not-resolved", tenantId };
  }

  const now = update.eventCreatedAt;
  const currentWindow = getCurrentMonthWindow(now);
  const nextRecord: SyncedSubscriptionRecord = {
    id: existing?.id ?? randomUUID(),
    slug: existing?.slug ?? `stripe-${tenantId}`,
    tenantId,
    planId: plan.id,
    status: update.status ?? existing?.status ?? "incomplete",
    startedAt: update.startedAt ?? existing?.startedAt ?? now,
    currentPeriodStart:
      update.currentPeriodStart !== undefined
        ? update.currentPeriodStart
        : (existing?.currentPeriodStart ?? currentWindow.start),
    currentPeriodEnd:
      update.currentPeriodEnd !== undefined
        ? update.currentPeriodEnd
        : (existing?.currentPeriodEnd ?? currentWindow.end),
    trialEndsAt:
      update.trialEndsAt !== undefined ? update.trialEndsAt : (existing?.trialEndsAt ?? null),
    cancelAtPeriodEnd: update.cancelAtPeriodEnd ?? existing?.cancelAtPeriodEnd ?? false,
    canceledAt:
      update.canceledAt !== undefined
        ? update.canceledAt
        : update.status === "canceled"
          ? now
          : (existing?.canceledAt ?? null),
    stripeCustomerId: update.stripeCustomerId ?? existing?.stripeCustomerId ?? "",
    stripeSubscriptionId: update.stripeSubscriptionId ?? existing?.stripeSubscriptionId ?? "",
    stripeCheckoutSessionId:
      update.stripeCheckoutSessionId ?? existing?.stripeCheckoutSessionId ?? "",
    metadata: mergeSubscriptionMetadata(existing?.metadata, update, plan),
  };

  await syncStore.upsertTenantSubscription(nextRecord);

  return {
    action: existing ? "updated" : "created",
    tenantId,
    subscriptionId: nextRecord.id,
    planId: plan.id,
  };
}

export function normalizeStripeSubscriptionUpdate(
  event: StripeWebhookEvent,
): StripeSubscriptionUpdate | null {
  const object = readStripeEventObject(event);
  if (!object) {
    return null;
  }

  const eventCreatedAt = readEventCreatedAt(event);
  if (event.type === "checkout.session.completed") {
    const mode = readString(object.mode);
    if (mode && mode !== "subscription") {
      return null;
    }

    return {
      eventId: event.id,
      eventType: event.type,
      eventCreatedAt,
      tenantId: readTenantId(object),
      planId: readMetadataString(object, "planId"),
      stripeCustomerId: readExternalId(object.customer),
      stripeSubscriptionId: readExternalId(object.subscription),
      stripeCheckoutSessionId: readString(object.id),
      status: "active",
      startedAt: eventCreatedAt,
    };
  }

  if (!STRIPE_SUBSCRIPTION_EVENTS.has(event.type)) {
    return null;
  }

  const status =
    event.type === "customer.subscription.deleted"
      ? "canceled"
      : mapStripeSubscriptionStatus(readString(object.status));

  return {
    eventId: event.id,
    eventType: event.type,
    eventCreatedAt,
    tenantId: readTenantId(object),
    planId: readMetadataString(object, "planId"),
    stripePriceId: readSubscriptionPriceId(object),
    stripeCustomerId: readExternalId(object.customer),
    stripeSubscriptionId: readString(object.id),
    status,
    startedAt: readStripeTimestamp(object, "start_date") ?? eventCreatedAt,
    currentPeriodStart: readStripeTimestamp(object, "current_period_start"),
    currentPeriodEnd: readStripeTimestamp(object, "current_period_end"),
    trialEndsAt: readStripeTimestamp(object, "trial_end"),
    cancelAtPeriodEnd: readBoolean(object.cancel_at_period_end),
    canceledAt:
      event.type === "customer.subscription.deleted"
        ? (readStripeTimestamp(object, "canceled_at") ?? eventCreatedAt)
        : readStripeTimestamp(object, "canceled_at"),
  };
}

async function createSmrtSubscriptionSyncStore(): Promise<SubscriptionSyncStore> {
  const db = await getAppDatabase();
  const findPlanByIdOrKey = async (planIdOrKey: string): Promise<SubscriptionSyncPlan | null> => {
    const result = isUuid(planIdOrKey)
      ? await db.query(
          `
            SELECT id, plan_key
            FROM _smrt_subscription_plans
            WHERE id = ?
            LIMIT 1
          `,
          planIdOrKey,
        )
      : await db.query(
          `
            SELECT id, plan_key
            FROM _smrt_subscription_plans
            WHERE plan_key = ?
            LIMIT 1
          `,
          planIdOrKey,
        );
    return rowToPlan(result.rows[0]);
  };

  return {
    async findCurrentByTenant(tenantId) {
      const result = await db.query(
        `
          SELECT *
          FROM _smrt_tenant_subscriptions
          WHERE tenant_id = ?
          ORDER BY created_at DESC
          LIMIT 1
        `,
        tenantId,
      );
      return rowToSubscription(result.rows[0]);
    },

    async findByStripeSubscriptionId(stripeSubscriptionId) {
      const result = await db.query(
        `
          SELECT *
          FROM _smrt_tenant_subscriptions
          WHERE stripe_subscription_id = ?
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        stripeSubscriptionId,
      );
      return rowToSubscription(result.rows[0]);
    },

    async findByStripeCustomerId(stripeCustomerId) {
      const result = await db.query(
        `
          SELECT *
          FROM _smrt_tenant_subscriptions
          WHERE stripe_customer_id = ?
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        stripeCustomerId,
      );
      return rowToSubscription(result.rows[0]);
    },

    findPlanByIdOrKey,

    async findPlanByStripePriceId(stripePriceId) {
      const result = await db.query(
        `
          SELECT id, plan_key
          FROM _smrt_subscription_plans
          WHERE stripe_price_id = ?
          LIMIT 1
        `,
        stripePriceId,
      );
      const plan = rowToPlan(result.rows[0]);
      if (plan) {
        return plan;
      }

      const seedPlan = findSeedPlanByStripePriceId(stripePriceId);
      return seedPlan ? await findPlanByIdOrKey(seedPlan.id) : null;
    },

    async upsertTenantSubscription(record) {
      await db.upsert("_smrt_tenant_subscriptions", ["tenant_id"], {
        id: record.id,
        slug: record.slug,
        context: record.tenantId,
        updated_at: new Date().toISOString(),
        tenant_id: record.tenantId,
        plan_id: record.planId,
        status: record.status,
        started_at: record.startedAt.toISOString(),
        current_period_start: record.currentPeriodStart?.toISOString() ?? null,
        current_period_end: record.currentPeriodEnd?.toISOString() ?? null,
        trial_ends_at: record.trialEndsAt?.toISOString() ?? null,
        cancel_at_period_end: record.cancelAtPeriodEnd,
        canceled_at: record.canceledAt?.toISOString() ?? null,
        external_provider: "stripe",
        stripe_customer_id: record.stripeCustomerId,
        stripe_subscription_id: record.stripeSubscriptionId,
        stripe_checkout_session_id: record.stripeCheckoutSessionId,
        metadata: JSON.stringify(record.metadata),
      });
    },
  };
}

async function findExistingSubscription(
  update: StripeSubscriptionUpdate,
  store: SubscriptionSyncStore,
): Promise<SyncedSubscriptionRecord | null> {
  if (update.stripeSubscriptionId) {
    const subscription = await store.findByStripeSubscriptionId(update.stripeSubscriptionId);
    if (subscription) {
      return subscription;
    }
  }

  const tenantId = validTenantId(update.tenantId);
  if (tenantId) {
    const subscription = await store.findCurrentByTenant(tenantId);
    if (subscription) {
      return subscription;
    }
  }

  if (update.stripeCustomerId) {
    return await store.findByStripeCustomerId(update.stripeCustomerId);
  }

  return null;
}

async function resolvePlan(
  update: StripeSubscriptionUpdate,
  existing: SyncedSubscriptionRecord | null,
  store: SubscriptionSyncStore,
): Promise<SubscriptionSyncPlan | null> {
  if (update.planId) {
    const plan = await store.findPlanByIdOrKey(update.planId);
    if (plan) {
      return plan;
    }
  }

  if (update.stripePriceId) {
    const plan = await store.findPlanByStripePriceId(update.stripePriceId);
    if (plan) {
      return plan;
    }
  }

  if (existing?.planId) {
    return await store.findPlanByIdOrKey(existing.planId);
  }

  return null;
}

function mergeSubscriptionMetadata(
  existing: Record<string, unknown> | undefined,
  update: StripeSubscriptionUpdate,
  plan: SubscriptionSyncPlan,
): Record<string, unknown> {
  const existingStripe = readRecord(existing?.stripe);

  return {
    ...(existing ?? {}),
    planKey: plan.planKey,
    stripe: {
      ...existingStripe,
      lastEventId: update.eventId,
      lastEventType: update.eventType,
      lastEventAt: update.eventCreatedAt.toISOString(),
      recentEventIds: appendRecentEventId(
        readStringArray(existingStripe?.recentEventIds),
        update.eventId,
      ),
      priceId: update.stripePriceId ?? readString(existingStripe?.priceId),
    },
  };
}

function isStaleStripeEvent(
  existing: SyncedSubscriptionRecord,
  update: StripeSubscriptionUpdate,
): boolean {
  const lastStripe = readRecord(existing.metadata.stripe);

  // Stripe delivers at-least-once: the same event id can arrive again. Reject a
  // replay of ANY recently processed event id, not just the most recent — so an
  // A, B, A redelivery within the same `created` second can't slip past the
  // seconds-resolution timestamp tie below. (lastEventId is kept as a fallback
  // for rows written before recentEventIds existed.)
  const recentEventIds = readStringArray(lastStripe?.recentEventIds);
  const lastEventId = readString(lastStripe?.lastEventId);
  if (
    update.eventId &&
    (recentEventIds.includes(update.eventId) || lastEventId === update.eventId)
  ) {
    return true;
  }

  // `created` is whole seconds, so distinct events in the same second tie; keep
  // the strict `>` so a genuinely distinct same-second event still applies.
  const lastEventAt = dateFromStripeValue(lastStripe?.lastEventAt);
  return Boolean(lastEventAt && lastEventAt.getTime() > update.eventCreatedAt.getTime());
}

function isDifferentSubscriptionMutation(
  existing: SyncedSubscriptionRecord,
  update: StripeSubscriptionUpdate,
): boolean {
  if (!existing.stripeSubscriptionId || !update.stripeSubscriptionId) {
    return false;
  }

  if (existing.stripeSubscriptionId === update.stripeSubscriptionId) {
    return false;
  }

  return (
    update.eventType === "customer.subscription.updated" ||
    update.eventType === "customer.subscription.deleted"
  );
}

function findSeedPlanByStripePriceId(stripePriceId: string) {
  return (
    starterData.plans.find(
      (plan) => readString(process.env[plan.stripePriceEnvKey]) === stripePriceId,
    ) ?? null
  );
}

function readStripeEventObject(event: StripeWebhookEvent): Record<string, unknown> | null {
  const payload = readRecord(event.data.payload);
  const data = readRecord(payload?.data);
  return readRecord(data?.object) ?? readRecord(event.data.object);
}

function readEventCreatedAt(event: StripeWebhookEvent): Date {
  const timestamp = readString(event.data.timestamp);
  if (timestamp) {
    const parsed = new Date(timestamp);
    if (Number.isFinite(parsed.getTime())) {
      return parsed;
    }
  }

  const payload = readRecord(event.data.payload);
  return dateFromStripeValue(payload?.created) ?? new Date();
}

function readTenantId(object: Record<string, unknown>): string | undefined {
  return (
    validTenantId(readMetadataString(object, "tenantId")) ??
    validTenantId(readString(object.client_reference_id))
  );
}

function validTenantId(value: string | undefined): string | undefined {
  return isUuid(value) ? value : undefined;
}

function readMetadataString(object: Record<string, unknown>, key: string): string | undefined {
  return readString(readRecord(object.metadata)?.[key]);
}

function readSubscriptionPriceId(object: Record<string, unknown>): string | undefined {
  const items = readRecord(object.items);
  const itemData = items && Array.isArray(items.data) ? items.data : [];

  for (const item of itemData) {
    const priceId = readString(readRecord(readRecord(item)?.price)?.id);
    if (priceId) {
      return priceId;
    }
  }

  return undefined;
}

function mapStripeSubscriptionStatus(value: string | undefined): SubscriptionStatus {
  switch (value) {
    case "active":
    case "canceled":
    case "incomplete":
    case "past_due":
    case "trialing":
    case "unpaid":
      return value;
    case "incomplete_expired":
      return "canceled";
    case "paused":
      return "past_due";
    default:
      return "incomplete";
  }
}

function readStripeTimestamp(
  object: Record<string, unknown>,
  key: string,
): Date | null | undefined {
  if (!(key in object)) {
    return undefined;
  }

  return dateFromStripeValue(object[key]);
}

function dateFromStripeValue(value: unknown): Date | null {
  if (value === null || value === undefined || value === false || value === 0) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value === "number") {
    const millis = value > 100_000_000_000 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  return null;
}

function readExternalId(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }

  return readString(readRecord(value)?.id);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

// Bounded set of recently processed Stripe event ids, kept in subscription
// metadata for at-least-once redelivery dedupe. Capped so the row can't grow
// unbounded; older ids fall off and are instead caught by the timestamp check.
const MAX_RECENT_EVENT_IDS = 20;

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function appendRecentEventId(existing: string[], eventId: string): string[] {
  if (!eventId) {
    return existing.slice(-MAX_RECENT_EVENT_IDS);
  }
  const next = existing.filter((id) => id !== eventId);
  next.push(eventId);
  return next.slice(-MAX_RECENT_EVENT_IDS);
}

function rowToPlan(row: unknown): SubscriptionSyncPlan | null {
  const record = readRecord(row);
  if (!record) {
    return null;
  }

  const id = readString(record.id);
  const planKey = readString(record.plan_key);
  return id && planKey ? { id, planKey } : null;
}

function rowToSubscription(row: unknown): SyncedSubscriptionRecord | null {
  const record = readRecord(row);
  if (!record) {
    return null;
  }

  const id = readString(record.id);
  const tenantId = readString(record.tenant_id);
  const planId = readString(record.plan_id);
  if (!id || !tenantId || !planId) {
    return null;
  }

  return {
    id,
    slug: readString(record.slug) ?? `stripe-${tenantId}`,
    tenantId,
    planId,
    status: mapStripeSubscriptionStatus(readString(record.status)),
    startedAt: dateFromStripeValue(record.started_at) ?? new Date(),
    currentPeriodStart: dateFromStripeValue(record.current_period_start),
    currentPeriodEnd: dateFromStripeValue(record.current_period_end),
    trialEndsAt: dateFromStripeValue(record.trial_ends_at),
    cancelAtPeriodEnd: record.cancel_at_period_end === true,
    canceledAt: dateFromStripeValue(record.canceled_at),
    stripeCustomerId: readString(record.stripe_customer_id) ?? "",
    stripeSubscriptionId: readString(record.stripe_subscription_id) ?? "",
    stripeCheckoutSessionId: readString(record.stripe_checkout_session_id) ?? "",
    metadata: parseMetadata(record.metadata),
  };
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (readRecord(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value !== "string" || !value.trim()) {
    return {};
  }

  try {
    return readRecord(JSON.parse(value)) ?? {};
  } catch {
    return {};
  }
}
