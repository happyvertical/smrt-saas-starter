import type { EntitlementSnapshot, PlanLike } from "@happyvertical/smrt-saas-objects";
import { resolveEntitlements } from "@happyvertical/smrt-saas-objects";

export const starterPlans: PlanLike[] = [
  {
    id: "plan-starter",
    slug: "starter",
    name: "Starter",
    features: [
      { key: "chat.agent", enabled: true, label: "Agent chat" },
      { key: "mcp.read_tools", enabled: true, label: "Read-only MCP tools" },
      { key: "exports.bulk", enabled: false, label: "Bulk exports" },
    ],
    thresholds: [
      {
        metricKey: "ai.tokens",
        limit: 100_000,
        window: "month",
        action: "warn",
        label: "AI tokens",
      },
      { metricKey: "mcp.calls", limit: 500, window: "month", action: "block", label: "MCP calls" },
    ],
  },
  {
    id: "plan-growth",
    slug: "growth",
    name: "Growth",
    features: [
      { key: "chat.agent", enabled: true, label: "Agent chat" },
      { key: "mcp.read_tools", enabled: true, label: "Read-only MCP tools" },
      { key: "mcp.write_tools", enabled: true, label: "Confirmed write tools" },
      { key: "exports.bulk", enabled: true, label: "Bulk exports" },
    ],
    thresholds: [
      {
        metricKey: "ai.tokens",
        limit: 1_000_000,
        window: "month",
        action: "warn",
        label: "AI tokens",
      },
      {
        metricKey: "mcp.calls",
        limit: 5_000,
        window: "month",
        action: "block",
        label: "MCP calls",
      },
    ],
  },
  {
    id: "plan-scale",
    slug: "scale",
    name: "Scale",
    features: [
      { key: "chat.agent", enabled: true, label: "Agent chat" },
      { key: "mcp.read_tools", enabled: true, label: "Read-only MCP tools" },
      { key: "mcp.write_tools", enabled: true, label: "Confirmed write tools" },
      { key: "exports.bulk", enabled: true, label: "Bulk exports" },
      { key: "languages.ai_translate", enabled: true, label: "AI translations" },
      { key: "prompts.tenant_overrides", enabled: true, label: "Tenant prompt overrides" },
    ],
    thresholds: [
      {
        metricKey: "ai.tokens",
        limit: 5_000_000,
        window: "month",
        action: "observe",
        label: "AI tokens",
      },
      {
        metricKey: "mcp.calls",
        limit: 50_000,
        window: "month",
        action: "warn",
        label: "MCP calls",
      },
    ],
  },
];

export interface BillingOverview {
  tenantId: string;
  currentPlan: PlanLike;
  snapshot: EntitlementSnapshot;
  periodEnd: string;
}

const usageByTenant: Record<string, Record<string, number>> = {
  demo: {
    "ai.tokens": 42_500,
    "mcp.calls": 128,
  },
};

export function getBillingOverview(tenantId = "demo"): BillingOverview {
  const fallbackPlan = starterPlans[0];
  if (!fallbackPlan) {
    throw new Error("Starter plan seed data is empty");
  }

  const currentPlan = starterPlans[1] ?? fallbackPlan;
  const usage = Object.entries(usageByTenant[tenantId] ?? usageByTenant.demo ?? {}).map(
    ([metricKey, value]) => ({
      metricKey,
      value,
      window: "month",
    }),
  );

  return {
    tenantId,
    currentPlan,
    periodEnd: "2026-07-06T00:00:00.000Z",
    snapshot: resolveEntitlements({
      plan: currentPlan,
      subscription: {
        planId: currentPlan.id,
        status: "active",
        currentPeriodEnd: "2026-07-06T00:00:00.000Z",
      },
      usage,
      now: new Date("2026-06-06T00:00:00.000Z"),
    }),
  };
}

export function getPlanCards(currentPlanId: string) {
  const priceBySlug: Record<string, number> = {
    starter: 49,
    growth: 149,
    scale: 499,
  };

  return starterPlans.map((plan) => ({
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    description:
      plan.slug === "starter"
        ? "Tenant basics, hosted agents, and read-only tools."
        : plan.slug === "growth"
          ? "Team-scale workflows with write tools and bulk exports."
          : "High-volume AI usage, translations, and custom prompt control.",
    monthlyPrice: priceBySlug[plan.slug] ?? 0,
    currency: "USD",
    current: plan.id === currentPlanId,
    features: plan.features
      .filter((feature) => feature.enabled)
      .map((feature) => feature.label ?? feature.key),
  }));
}

export function getStripePriceId(planId: string): string | null {
  const plan = starterPlans.find((candidate) => candidate.id === planId);
  if (!plan) {
    return null;
  }

  const envKey = `STRIPE_PRICE_${plan.slug.toUpperCase()}`;
  return process.env[envKey] ?? null;
}
