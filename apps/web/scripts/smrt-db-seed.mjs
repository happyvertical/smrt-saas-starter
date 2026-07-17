import { resolveDatabase } from "@happyvertical/smrt-core";
import { TenantUsageMetricCollection } from "@happyvertical/smrt-subscriptions";
import { AccessRequestService } from "@happyvertical/smrt-users";

import "@happyvertical/smrt-saas-objects";

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
  const personProfileType = starterData.identity.personProfileType;
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

  const existingPersonType = await db.query(
    `SELECT id
       FROM profile_types
      WHERE slug = ? AND tenant_id IS NULL
      LIMIT 1`,
    personProfileType.slug,
  );
  let personProfileTypeId = existingPersonType.rows[0]?.id;
  if (!personProfileTypeId) {
    await db.upsert("profile_types", ["slug", "context", "_meta_type"], {
      id: personProfileType.id,
      slug: personProfileType.slug,
      context: "",
      _meta_type: "@happyvertical/smrt-profiles:ProfileType",
      _meta_data: { seededBy: "smrt-saas-starter" },
      updated_at: now.toISOString(),
      tenant_id: null,
      name: personProfileType.name,
      description: personProfileType.description,
    });
    personProfileTypeId = personProfileType.id;
  }

  const existingOwnerProfiles = await db.query(
    `SELECT id, tenant_id, _meta_type
       FROM profiles
      WHERE email_key = ?
      ORDER BY created_at ASC, id ASC
      LIMIT 2`,
    demoTenant.ownerProfile.email.toLowerCase(),
  );
  if (existingOwnerProfiles.rows.length > 1) {
    throw new Error(
      `Cannot safely seed demo owner: multiple profiles use ${demoTenant.ownerProfile.email}`,
    );
  }
  if (existingOwnerProfiles.rows[0]?.tenant_id) {
    throw new Error(
      `Cannot safely seed demo owner: profile for ${demoTenant.ownerProfile.email} is tenant-scoped`,
    );
  }
  if (
    existingOwnerProfiles.rows[0] &&
    existingOwnerProfiles.rows[0]._meta_type !== "@happyvertical/smrt-profiles:Person"
  ) {
    throw new Error(
      `Cannot safely seed demo owner: global profile for ${demoTenant.ownerProfile.email} is not a Person`,
    );
  }
  let ownerProfileId = existingOwnerProfiles.rows[0]?.id;
  if (!ownerProfileId) {
    await db.upsert("profiles", ["slug", "context", "_meta_type"], {
      id: demoTenant.ownerProfile.id,
      slug: demoTenant.ownerProfile.slug,
      context: "",
      _meta_type: "@happyvertical/smrt-profiles:Person",
      _meta_data: { seededBy: "smrt-saas-starter", demo: true },
      updated_at: now.toISOString(),
      tenant_id: null,
      type_id: personProfileTypeId,
      email: demoTenant.ownerProfile.email,
      email_key: demoTenant.ownerProfile.email.toLowerCase(),
      name: demoTenant.ownerProfile.name,
      description: "Reference identity for the starter demo owner.",
    });
    ownerProfileId = demoTenant.ownerProfile.id;
  }

  const existingProfileOwner = await db.query(
    `SELECT id
       FROM users
      WHERE profile_id = ? AND id <> ?
      LIMIT 1`,
    ownerProfileId,
    demoTenant.ownerUser.id,
  );
  if (existingProfileOwner.rows[0]) {
    throw new Error(
      `Cannot safely seed demo owner: profile ${ownerProfileId} already belongs to another User`,
    );
  }

  await db.upsert("users", ["slug", "context"], {
    id: demoTenant.ownerUser.id,
    slug: demoTenant.ownerUser.slug,
    context: "",
    updated_at: now.toISOString(),
    profile_id: ownerProfileId,
    email: demoTenant.ownerUser.email,
    email_key: demoTenant.ownerUser.email.toLowerCase(),
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

  // smrt-subscriptions 0.28.0 (smrt#1454) widened the TenantSubscription unique
  // index to (tenant_id, subscriber_kind, subscriber_external_id) for the
  // polymorphic subscriber. The conflict target must match that index; seed the
  // tenant-shape defaults explicitly.
  await db.upsert(
    "_smrt_tenant_subscriptions",
    ["tenant_id", "subscriber_kind", "subscriber_external_id"],
    {
      id: starterData.demoSubscription.id,
      slug: starterData.demoSubscription.slug,
      context: demoTenant.id,
      updated_at: now.toISOString(),
      tenant_id: demoTenant.id,
      subscriber_kind: "tenant",
      subscriber_external_id: "",
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
    },
  );

  for (const setting of starterData.appSettings) {
    await db.upsert("starter_app_settings", ["key"], {
      id: setting.id,
      slug: setting.slug,
      context: "",
      updated_at: now.toISOString(),
      key: setting.key,
      value: setting.value,
      updated_by_user_id: demoTenant.ownerUser.id,
      metadata: JSON.stringify({
        seededBy: "smrt-saas-starter",
      }),
    });
  }

  // AI token usage now lives in the `_smrt_ai_usage` system table (see the
  // aiUsageSeeds loop below), which is what billing thresholds read via
  // `summarizeTenantAiUsage`. Earlier revisions seeded `ai.*` rows into
  // `_smrt_tenant_usage_metrics`; remove any that linger from a prior seed so
  // the billing threshold and the usage screen don't double-count AI tokens.
  // The app never persists `ai.*` into this table, so this only clears seed
  // artifacts for the demo tenant.
  await db.query(
    `DELETE FROM _smrt_tenant_usage_metrics
       WHERE tenant_id = ? AND metric_key LIKE 'ai.%'`,
    demoTenant.id,
  );

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

  // `_smrt_ai_usage` is a framework system table, not a registered object
  // schema, so `db:migrate` does not create it. It is bootstrapped lazily the
  // first time a SMRT class initializes against the database. This seed writes
  // AI usage rows with raw `db.upsert`, so instantiate a collection first to
  // trigger the system-table bootstrap and guarantee the table exists on a
  // fresh database.
  await TenantUsageMetricCollection.create({ db });

  for (const aiUsage of starterData.aiUsageSeeds) {
    await db.upsert("_smrt_ai_usage", ["id"], {
      id: aiUsage.id,
      provider: aiUsage.provider,
      model: aiUsage.model,
      operation: aiUsage.operation,
      prompt_tokens: aiUsage.promptTokens,
      completion_tokens: aiUsage.completionTokens,
      total_tokens: aiUsage.totalTokens,
      estimated_cost: aiUsage.estimatedCost,
      duration: aiUsage.durationMs,
      class_name: aiUsage.className ?? null,
      tenant_id: demoTenant.id,
      tags: JSON.stringify({
        seededBy: "smrt-saas-starter",
        demo: true,
      }),
      created_at: now.toISOString(),
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

  // One demo access request so the admin triage queue is non-empty. The service
  // de-dups open REQUESTED rows by email, so re-running the seed is idempotent.
  const accessRequests = await AccessRequestService.create({ db });
  const demoAccessRequest = await accessRequests.createAccessRequest({
    email: "waitlist@example.com",
    name: "Waitlist Demo",
    source: "seed",
    context: { message: "Seeded demo access request for the admin triage queue." },
  });

  console.log(
    JSON.stringify(
      {
        tenantId: demoTenant.id,
        tenantSlug: demoTenant.slug,
        roles: starterData.roles.length,
        plans: starterData.plans.length,
        appSettings: starterData.appSettings.length,
        subscriptionPlan: demoPlan.planKey,
        usageMetrics: starterData.usageSeeds.length,
        aiUsageMetrics: starterData.aiUsageSeeds.length,
        promptOverrides: starterData.promptOverrides.length,
        languageOverrides: starterData.languageOverrides.length,
        accessRequestEmail: demoAccessRequest.email,
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
