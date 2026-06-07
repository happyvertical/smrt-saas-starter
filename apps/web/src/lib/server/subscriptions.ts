import {
  type BillingInterval,
  type EntitlementResolution,
  evaluateThresholds,
  type PlanFeatureGrant,
  type PlanThreshold,
} from "@happyvertical/smrt-subscriptions";
import { getUsageSummaries } from "$lib/server/usage";

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

export const starterPlans: StarterPlan[] = [
  {
    id: "plan-starter",
    planKey: "starter",
    name: "Starter",
    description: "Tenant basics, hosted agents, and read-only tools.",
    priceAmount: 49,
    currency: "USD",
    billingInterval: "month",
    features: [
      { featureKey: "chat.agent", enabled: true, label: "Agent chat" },
      { featureKey: "mcp.read_tools", enabled: true, label: "Read-only MCP tools" },
      { featureKey: "exports.bulk", enabled: false, label: "Bulk exports" },
    ],
    thresholds: [
      {
        metricKey: "ai.tokens.total",
        limit: 100_000,
        window: "month",
        enforcement: "warn",
        label: "AI tokens",
      },
      {
        metricKey: "mcp.calls",
        limit: 500,
        window: "month",
        enforcement: "block",
        label: "MCP calls",
      },
    ],
  },
  {
    id: "plan-growth",
    planKey: "growth",
    name: "Growth",
    description: "Team-scale workflows with write tools and bulk exports.",
    priceAmount: 149,
    currency: "USD",
    billingInterval: "month",
    features: [
      { featureKey: "chat.agent", enabled: true, label: "Agent chat" },
      { featureKey: "mcp.read_tools", enabled: true, label: "Read-only MCP tools" },
      { featureKey: "mcp.write_tools", enabled: true, label: "Confirmed write tools" },
      { featureKey: "exports.bulk", enabled: true, label: "Bulk exports" },
    ],
    thresholds: [
      {
        metricKey: "ai.tokens.total",
        limit: 1_000_000,
        window: "month",
        enforcement: "warn",
        label: "AI tokens",
      },
      {
        metricKey: "mcp.calls",
        limit: 5_000,
        window: "month",
        enforcement: "block",
        label: "MCP calls",
      },
    ],
  },
  {
    id: "plan-scale",
    planKey: "scale",
    name: "Scale",
    description: "High-volume AI usage, translations, and custom prompt control.",
    priceAmount: 499,
    currency: "USD",
    billingInterval: "month",
    features: [
      { featureKey: "chat.agent", enabled: true, label: "Agent chat" },
      { featureKey: "mcp.read_tools", enabled: true, label: "Read-only MCP tools" },
      { featureKey: "mcp.write_tools", enabled: true, label: "Confirmed write tools" },
      { featureKey: "exports.bulk", enabled: true, label: "Bulk exports" },
      { featureKey: "languages.ai_translate", enabled: true, label: "AI translations" },
      {
        featureKey: "prompts.tenant_overrides",
        enabled: true,
        label: "Tenant prompt overrides",
      },
    ],
    thresholds: [
      {
        metricKey: "ai.tokens.total",
        limit: 5_000_000,
        window: "month",
        enforcement: "observe",
        label: "AI tokens",
      },
      {
        metricKey: "mcp.calls",
        limit: 50_000,
        window: "month",
        enforcement: "warn",
        label: "MCP calls",
      },
    ],
  },
];

export interface BillingOverview {
  tenantId: string;
  currentPlan: StarterPlan;
  snapshot: EntitlementResolution;
  periodEnd: string;
}

export function getBillingOverview(tenantId = "demo"): BillingOverview {
  const fallbackPlan = starterPlans[0];
  if (!fallbackPlan) {
    throw new Error("Starter plan seed data is empty");
  }

  const currentPlan = starterPlans[1] ?? fallbackPlan;
  const usage = getUsageSummaries(tenantId);
  const thresholdEvaluations = evaluateThresholds(currentPlan.thresholds, usage);

  return {
    tenantId,
    currentPlan,
    periodEnd: "2026-07-06T00:00:00.000Z",
    snapshot: {
      tenantId,
      planId: currentPlan.id,
      planKey: currentPlan.planKey,
      subscriptionId: "sub_demo",
      status: "active",
      featureKeys: currentPlan.features
        .filter((feature) => feature.enabled !== false)
        .map((feature) => feature.featureKey),
      thresholds: currentPlan.thresholds,
      thresholdEvaluations,
      allowed: thresholdEvaluations.every((evaluation) => evaluation.allowed),
    },
  };
}

export function getPlanCards(currentPlanId: string) {
  return starterPlans.map((plan) => ({
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

export function getStripePriceId(planId: string): string | null {
  const plan = starterPlans.find((candidate) => candidate.id === planId);
  if (!plan) {
    return null;
  }

  const envKey = `STRIPE_PRICE_${plan.planKey.toUpperCase()}`;
  return process.env[envKey] ?? null;
}
