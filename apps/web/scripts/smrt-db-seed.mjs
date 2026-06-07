import { resolveDatabase } from "@happyvertical/smrt-core";

import "@happyvertical/smrt-saas-objects";
import "@happyvertical/smrt-subscriptions";
import "@happyvertical/smrt-users";

import starterData from "../src/lib/server/starter-data.json" with { type: "json" };

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://smrt_saas:localdev@127.0.0.1:5432/smrt_saas";

const db = await resolveDatabase(
  { type: "postgres", url: databaseUrl },
  { dbid: `smrt-saas-starter-db-seed:${process.pid}` },
);

try {
  const now = new Date();
  const window = getCurrentMonthWindow(now);
  const demoTenant = starterData.demoTenant;
  const ownerRole = starterData.roles.find((role) => role.slug === "owner");
  const demoPlan = starterData.plans.find(
    (plan) => plan.planKey === starterData.demoSubscription.planKey,
  );

  if (!ownerRole) {
    throw new Error("Starter seed data is missing the owner role");
  }
  if (!demoPlan) {
    throw new Error(`Starter seed data is missing plan ${starterData.demoSubscription.planKey}`);
  }

  await db.upsert("tenants", ["slug", "context", "_meta_type"], {
    id: demoTenant.id,
    slug: demoTenant.slug,
    context: "",
    _meta_type: "@happyvertical/smrt-users:Tenant",
    _meta_data: {
      seededBy: "smrt-saas-starter",
      demo: true,
    },
    updated_at: now.toISOString(),
    name: demoTenant.name,
    status: "active",
    description: demoTenant.description,
    hierarchy_level: 0,
    hierarchy_path: demoTenant.id,
    cascade_permissions: true,
    inherit_permissions: true,
  });

  for (const role of starterData.roles) {
    await db.upsert("roles", ["slug", "context"], {
      id: role.id,
      slug: role.slug,
      context: "",
      updated_at: now.toISOString(),
      tenant_id: null,
      name: role.name,
      description: role.description,
      is_system: true,
    });
  }

  await db.upsert("users", ["slug", "context"], {
    id: demoTenant.ownerUser.id,
    slug: demoTenant.ownerUser.slug,
    context: "",
    updated_at: now.toISOString(),
    profile_id: null,
    email: demoTenant.ownerUser.email,
    status: "active",
    last_login_at: null,
  });

  await db.upsert("memberships", ["slug", "context"], {
    id: demoTenant.ownerMembership.id,
    slug: demoTenant.ownerMembership.slug,
    context: demoTenant.id,
    updated_at: now.toISOString(),
    user_id: demoTenant.ownerUser.id,
    tenant_id: demoTenant.id,
    role_id: ownerRole.id,
    status: "active",
  });

  for (const plan of starterData.plans) {
    await db.upsert("_smrt_subscription_plans", ["plan_key"], {
      id: plan.id,
      slug: plan.planKey,
      context: "",
      updated_at: now.toISOString(),
      tenant_id: null,
      plan_key: plan.planKey,
      name: plan.name,
      description: plan.description,
      status: "active",
      sort_order: starterData.plans.indexOf(plan),
      price_amount: plan.priceAmount,
      currency: plan.currency,
      billing_interval: plan.billingInterval,
      external_provider: "stripe",
      stripe_product_id: "",
      stripe_price_id: process.env[plan.stripePriceEnvKey] ?? "",
      features: JSON.stringify(plan.features),
      thresholds: JSON.stringify(plan.thresholds),
      metadata: JSON.stringify({
        seededBy: "smrt-saas-starter",
        stripePriceEnvKey: plan.stripePriceEnvKey,
      }),
    });
  }

  await db.upsert("_smrt_tenant_subscriptions", ["tenant_id"], {
    id: starterData.demoSubscription.id,
    slug: starterData.demoSubscription.slug,
    context: demoTenant.id,
    updated_at: now.toISOString(),
    tenant_id: demoTenant.id,
    plan_id: demoPlan.id,
    status: "active",
    started_at: window.start.toISOString(),
    current_period_start: window.start.toISOString(),
    current_period_end: window.end.toISOString(),
    trial_ends_at: null,
    cancel_at_period_end: false,
    canceled_at: null,
    external_provider: "stripe",
    stripe_customer_id: starterData.demoSubscription.stripeCustomerId,
    stripe_subscription_id: "",
    stripe_checkout_session_id: "",
    metadata: JSON.stringify({
      seededBy: "smrt-saas-starter",
      planKey: demoPlan.planKey,
    }),
  });

  for (const metric of starterData.usageSeeds) {
    await db.upsert("_smrt_tenant_usage_metrics", ["slug", "context"], {
      id: metric.id,
      slug: metric.slug,
      context: demoTenant.id,
      updated_at: now.toISOString(),
      tenant_id: demoTenant.id,
      metric_key: metric.metricKey,
      quantity: metric.quantity,
      window_start: window.start.toISOString(),
      window_end: window.end.toISOString(),
      source: metric.source,
      source_id: metric.slug,
      dimensions: JSON.stringify({
        seededBy: "smrt-saas-starter",
        demo: true,
      }),
    });
  }

  for (const promptOverride of starterData.promptOverrides) {
    await db.upsert("_smrt_prompt_overrides", ["key", "context"], {
      id: promptOverride.id,
      slug: promptOverride.slug,
      context: demoTenant.id,
      updated_at: now.toISOString(),
      key: promptOverride.key,
      tenant_id: demoTenant.id,
      template: promptOverride.template,
      profile: promptOverride.profile ?? null,
      model: promptOverride.model ?? null,
      params: promptOverride.params ? JSON.stringify(promptOverride.params) : null,
    });
  }

  for (const languageOverride of starterData.languageOverrides) {
    await db.upsert("_smrt_language_overrides", ["key", "locale", "context"], {
      id: languageOverride.id,
      slug: languageOverride.slug,
      context: demoTenant.id,
      updated_at: now.toISOString(),
      key: languageOverride.key,
      locale: languageOverride.locale,
      tenant_id: demoTenant.id,
      template: languageOverride.template,
      auto_generated: false,
      source_hash: null,
      ai_model: null,
      reviewed_at: null,
      reviewed_by: null,
    });
  }

  console.log(
    JSON.stringify(
      {
        tenantId: demoTenant.id,
        tenantSlug: demoTenant.slug,
        roles: starterData.roles.length,
        plans: starterData.plans.length,
        subscriptionPlan: demoPlan.planKey,
        usageMetrics: starterData.usageSeeds.length,
        promptOverrides: starterData.promptOverrides.length,
        languageOverrides: starterData.languageOverrides.length,
        windowStart: window.start.toISOString(),
        windowEnd: window.end.toISOString(),
      },
      null,
      2,
    ),
  );
} finally {
  await db.close?.();
}

function getCurrentMonthWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}
