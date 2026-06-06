import type { PlanFeatureDefinition, PlanThresholdDefinition } from "../models/SubscriptionPlan.js";
import type { TenantSubscriptionStatus } from "../models/TenantSubscription.js";

export interface PlanLike {
  id: string;
  slug: string;
  name: string;
  features: PlanFeatureDefinition[];
  thresholds: PlanThresholdDefinition[];
}

export interface SubscriptionLike {
  planId: string;
  status: TenantSubscriptionStatus;
  currentPeriodEnd?: Date | string | null;
}

export interface UsageBucket {
  metricKey: string;
  value: number;
  window: string;
}

export interface ThresholdDecision {
  metricKey: string;
  limit: number;
  used: number;
  remaining: number;
  percentUsed: number;
  action: PlanThresholdDefinition["action"];
  exceeded: boolean;
}

export interface EntitlementSnapshot {
  planId: string;
  planSlug: string;
  status: SubscriptionLike["status"];
  active: boolean;
  features: Record<string, boolean>;
  thresholds: ThresholdDecision[];
}

export function resolveEntitlements(args: {
  plan: PlanLike;
  subscription: SubscriptionLike;
  usage: UsageBucket[];
  now?: Date;
}): EntitlementSnapshot {
  const now = args.now ?? new Date();
  const active = isSubscriptionActive(args.subscription, now);
  const usageByKey = new Map(args.usage.map((bucket) => [bucket.metricKey, bucket.value]));
  const features: Record<string, boolean> = {};

  for (const feature of args.plan.features) {
    features[feature.key] = active && feature.enabled;
  }

  return {
    planId: args.plan.id,
    planSlug: args.plan.slug,
    status: args.subscription.status,
    active,
    features,
    thresholds: args.plan.thresholds.map((threshold) =>
      evaluateThreshold(threshold, usageByKey.get(threshold.metricKey) ?? 0),
    ),
  };
}

export function isFeatureEnabled(snapshot: EntitlementSnapshot, featureKey: string): boolean {
  return snapshot.features[featureKey] === true;
}

export function isThresholdBlocked(snapshot: EntitlementSnapshot, metricKey: string): boolean {
  return snapshot.thresholds.some(
    (threshold) =>
      threshold.metricKey === metricKey && threshold.action === "block" && threshold.exceeded,
  );
}

export function evaluateThreshold(
  threshold: PlanThresholdDefinition,
  used: number,
): ThresholdDecision {
  const remaining = Math.max(threshold.limit - used, 0);
  const percentUsed = threshold.limit <= 0 ? 1 : used / threshold.limit;

  return {
    metricKey: threshold.metricKey,
    limit: threshold.limit,
    used,
    remaining,
    percentUsed,
    action: threshold.action,
    exceeded: used >= threshold.limit,
  };
}

function isSubscriptionActive(subscription: SubscriptionLike, now: Date): boolean {
  if (subscription.status !== "active" && subscription.status !== "trialing") {
    return false;
  }

  if (!subscription.currentPeriodEnd) {
    return true;
  }

  return new Date(subscription.currentPeriodEnd).getTime() >= now.getTime();
}
