import {
  type BillingInterval,
  type EntitlementResolution,
  type PlanFeatureGrant,
  type PlanThreshold,
  type SubscriptionPlan,
  SubscriptionPlanCollection,
  SubscriptionResolver,
  TenantSubscriptionCollection,
} from "@happyvertical/smrt-subscriptions";
import { getSmrtConfig } from "$lib/server/smrt";
import {
  DEMO_TENANT_ID,
  getActiveTenantId,
  getCurrentMonthWindow,
  isUuid,
  readFeatureLabel,
} from "$lib/server/starter-data";
import { summarizeUsageMetric } from "$lib/server/usage";

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
}

export async function getBillingOverview(
  tenantId: string | null | undefined = DEMO_TENANT_ID,
): Promise<BillingOverview> {
  const activeTenantId = getActiveTenantId(tenantId);
  const { plans, subscriptions } = await createSubscriptionCollections();
  const resolver = new SubscriptionResolver({
    plans,
    subscriptions,
    usage: {
      summarize: summarizeUsageMetric,
    },
  });
  const snapshot = await resolver.resolveTenantEntitlements(activeTenantId);
  const subscription = await subscriptions.findCurrentForTenant(activeTenantId);
  const plan = snapshot.planId ? await plans.get({ id: snapshot.planId }) : null;
  const currentPlan = await resolveDisplayPlan(plans, plan);

  return {
    tenantId: activeTenantId,
    currentPlan,
    periodEnd:
      subscription?.currentPeriodEnd?.toISOString() ?? getCurrentMonthWindow().end.toISOString(),
    snapshot,
  };
}

export async function getPlanCards(currentPlanId: string) {
  const plans = await getActivePlans();
  return plans.map((plan) => ({
    id: plan.id,
    slug: plan.planKey,
    name: plan.name,
    description: plan.description,
    monthlyPrice: plan.priceAmount,
    currency: plan.currency,
    current: plan.id === currentPlanId,
    features: plan.features.filter((feature) => feature.enabled).map((feature) => feature.label),
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
  return plan.stripePriceId || process.env[envKey] || null;
}

export async function getStripeCustomerId(
  tenantId: string | null | undefined = DEMO_TENANT_ID,
): Promise<string | null> {
  const { subscriptions } = await createSubscriptionCollections();
  const subscription = await subscriptions.findCurrentForTenant(getActiveTenantId(tenantId));
  return subscription?.stripeCustomerId || null;
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
  return (await plans.findActive()).map(toStarterPlan);
}

async function resolveDisplayPlan(
  plans: SubscriptionPlanCollection,
  plan: SubscriptionPlan | null,
): Promise<StarterPlan> {
  const displayPlan = plan ?? (await plans.findActive())[0];
  if (!displayPlan) {
    throw new Error("No active subscription plans are seeded");
  }

  return toStarterPlan(displayPlan);
}

async function findPlan(
  plans: SubscriptionPlanCollection,
  planId: string,
): Promise<SubscriptionPlan | null> {
  return isUuid(planId)
    ? ((await plans.get({ id: planId })) ?? null)
    : await plans.findByPlanKey(planId);
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
