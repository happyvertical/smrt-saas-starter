import {
  type BillingInterval,
  type EntitlementResolution,
  type PlanFeatureGrant,
  type PlanThreshold,
  type SubscriptionPlan,
  SubscriptionPlanCollection,
  SubscriptionResolver,
  TenantSubscriptionCollection,
  TenantUsageMeter,
} from "@happyvertical/smrt-subscriptions";
import { withSystemContext } from "@happyvertical/smrt-tenancy";
import { getSmrtConfig } from "$lib/server/smrt";
import { getCurrentMonthWindow, isUuid, readFeatureLabel } from "$lib/server/starter-data";
import { withActiveTenant } from "$lib/server/tenant-context";

export interface StarterFeatureGrant extends PlanFeatureGrant {
  label: string;
}

export interface StarterPlan {
  id: string;
  planKey: string;
  name: string;
  description: string;
  priceAmount: number;
  currency: string;
  billingInterval: BillingInterval;
  features: StarterFeatureGrant[];
  thresholds: PlanThreshold[];
}

export interface BillingOverview {
  tenantId: string;
  currentPlan: StarterPlan;
  snapshot: EntitlementResolution;
  periodEnd: string;
  billingPortalAvailable: boolean;
}

export async function getBillingOverview(tenantId?: string | null): Promise<BillingOverview> {
  return await withActiveTenant(tenantId, async (activeTenantId) => {
    const { plans, subscriptions } = await createSubscriptionCollections();
    const usage = await TenantUsageMeter.create(getSmrtConfig("TenantUsageMetric"));
    const resolver = new SubscriptionResolver({
      plans: {
        get: (criteria) => withSystemContext(() => plans.get(criteria)),
      },
      subscriptions,
      // Pass the batching usage meter directly: it exposes summarizeBatch (so the
      // resolver evaluates all thresholds per window in one query) and guards the
      // optional `_smrt_ai_usage` table internally (smrt#1722, shipped in
      // smrt-subscriptions 0.37.3), so the local single-metric safe reader is gone.
      usage,
    });

    // Load the subscription/plan pair once and reuse it: passing it back via
    // `context` stops resolveTenantEntitlements from re-querying the current
    // subscription and its plan after resolution (smrt#1573).
    const context = await resolver.loadEntitlementContext(activeTenantId);
    const snapshot = await resolver.resolveTenantEntitlements(activeTenantId, { context });

    const subscription = context.subscription ?? null;
    const stripeCustomerId = readOptionalString(subscription?.stripeCustomerId);
    const currentPlan = await resolveDisplayPlan(plans, context.plan ?? null);

    return {
      tenantId: activeTenantId,
      currentPlan,
      periodEnd:
        subscription?.currentPeriodEnd?.toISOString() ?? getCurrentMonthWindow().end.toISOString(),
      snapshot,
      billingPortalAvailable: Boolean(stripeCustomerId),
    };
  });
}

export async function getPlanCards() {
  const plans = await getActivePlans();
  return plans.map((plan) => ({
    id: plan.id,
    planKey: plan.planKey,
    name: plan.name,
    description: plan.description,
    priceAmount: plan.priceAmount,
    currency: plan.currency,
    billingInterval: plan.billingInterval,
    featureKeys: plan.features
      .filter((feature) => feature.enabled)
      .map((feature) => feature.featureKey),
  }));
}

export function getEnabledFeatureMap(snapshot: EntitlementResolution): Record<string, boolean> {
  return Object.fromEntries(snapshot.featureKeys.map((featureKey) => [featureKey, true]));
}

export async function getStripePriceId(planId: string): Promise<string | null> {
  const { plans } = await createSubscriptionCollections();
  const plan = await findPlan(plans, planId);
  if (!plan) {
    return null;
  }

  const envKey = `STRIPE_PRICE_${plan.planKey.toUpperCase()}`;
  return readOptionalString(plan.stripePriceId) ?? readOptionalString(process.env[envKey]);
}

export async function getStripeCustomerId(tenantId?: string | null): Promise<string | null> {
  return await withActiveTenant(tenantId, async (activeTenantId) => {
    const { subscriptions } = await createSubscriptionCollections();
    const subscription = await subscriptions.findCurrentForTenant(activeTenantId);
    return readOptionalString(subscription?.stripeCustomerId);
  });
}

async function createSubscriptionCollections() {
  const config = getSmrtConfig("SubscriptionPlan");
  return {
    plans: await SubscriptionPlanCollection.create(config),
    subscriptions: await TenantSubscriptionCollection.create(config),
  };
}

async function getActivePlans(): Promise<StarterPlan[]> {
  const { plans } = await createSubscriptionCollections();
  return (await withSystemContext(() => plans.findActive())).map(toStarterPlan);
}

async function resolveDisplayPlan(
  plans: SubscriptionPlanCollection,
  plan: SubscriptionPlan | null,
): Promise<StarterPlan> {
  const displayPlan = plan ?? (await withSystemContext(() => plans.findActive()))[0];
  if (!displayPlan) {
    throw new Error("No active subscription plans are seeded");
  }

  return toStarterPlan(displayPlan);
}

async function findPlan(
  plans: SubscriptionPlanCollection,
  planId: string,
): Promise<SubscriptionPlan | null> {
  return await withSystemContext(async () =>
    isUuid(planId)
      ? ((await plans.get({ id: planId })) ?? null)
      : await plans.findByPlanKey(planId),
  );
}

function toStarterPlan(plan: SubscriptionPlan): StarterPlan {
  return {
    id: plan.id ?? plan.planKey,
    planKey: plan.planKey,
    name: plan.name,
    description: plan.description,
    priceAmount: plan.priceAmount,
    currency: plan.currency,
    billingInterval: plan.billingInterval,
    features: plan.getFeatureGrants().map((feature) => ({
      ...feature,
      label: readFeatureLabel(feature),
    })),
    thresholds: plan.getThresholds(),
  };
}

function readOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
