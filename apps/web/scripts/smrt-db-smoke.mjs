import { fileURLToPath } from "node:url";
import { loadConfig } from "@happyvertical/smrt-config";
import { resolveDatabase } from "@happyvertical/smrt-core";
import { defineLanguageString, resolveLanguageString } from "@happyvertical/smrt-languages";
import { definePrompt, resolvePrompt } from "@happyvertical/smrt-prompts";
import {
  SubscriptionPlanCollection,
  SubscriptionResolver,
  TenantSubscriptionCollection,
  TenantUsageMetricCollection,
} from "@happyvertical/smrt-subscriptions";
import { enableTenancy, withSystemContext, withTenant } from "@happyvertical/smrt-tenancy";
import { registerSmrtRuntimePackages } from "../smrt-packages.mjs";

import "@happyvertical/smrt-saas-objects";

import starterData from "../src/lib/server/starter-data.json" with { type: "json" };

await registerSmrtRuntimePackages();
await loadConfig({
  configPath: fileURLToPath(new URL("../smrt.config.mjs", import.meta.url)),
});
registerStarterExperienceDefinitions();

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://smrt_saas:localdev@127.0.0.1:5432/smrt_saas";

const requiredTables = [
  "_smrt_schema_migrations",
  "_smrt_jobs",
  "_smrt_subscription_plans",
  "_smrt_tenant_subscriptions",
  "_smrt_tenant_usage_metrics",
  "agents",
  "analytics_events",
  "asset_associations",
  "chat_messages",
  "contents",
  "contracts",
  "_smrt_feature_definitions",
  "_smrt_language_overrides",
  "accounts",
  "messages",
  "profiles",
  "projects",
  "_smrt_prompt_overrides",
  "secrets",
  "sites",
  "tags",
  "memberships",
  "roles",
  "tenants",
  "users",
];

const tenantScopedTables = ["_smrt_tenant_subscriptions", "_smrt_tenant_usage_metrics"];
const quotedRequiredTables = requiredTables.map((table) => `'${table}'`).join(", ");
const quotedTenantScopedTables = tenantScopedTables.map((table) => `'${table}'`).join(", ");

const db = await resolveDatabase(
  { type: "postgres", url: databaseUrl },
  { dbid: `smrt-saas-starter-db-smoke:${process.pid}` },
);
enableTenancy();

try {
  const tablesResult = await db.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (${quotedRequiredTables})
  `);
  const foundTables = new Set(tablesResult.rows.map((row) => row.table_name));
  const missingTables = requiredTables.filter((table) => !foundTables.has(table));

  if (missingTables.length > 0) {
    throw new Error(`Missing migrated tables: ${missingTables.join(", ")}`);
  }

  const tenantColumnsResult = await db.query(`
    SELECT table_name, udt_name, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (${quotedTenantScopedTables})
      AND column_name = 'tenant_id'
  `);

  const tenantColumns = new Map(
    tenantColumnsResult.rows.map((row) => [
      row.table_name,
      { columnDefault: row.column_default, udtName: row.udt_name },
    ]),
  );

  for (const table of tenantScopedTables) {
    const column = tenantColumns.get(table);
    if (!column) {
      throw new Error(`${table}.tenant_id is missing`);
    }
    if (column.udtName !== "uuid") {
      throw new Error(`${table}.tenant_id must be uuid, found ${column.udtName}`);
    }
    if (column.columnDefault?.includes("''")) {
      throw new Error(`${table}.tenant_id must not default to an empty string`);
    }
  }

  const migrationsResult = await db.query(`
    SELECT COUNT(*)::int AS completed_count
    FROM _smrt_schema_migrations
    WHERE status = 'completed'
  `);
  const completedMigrations = Number(migrationsResult.rows[0]?.completed_count ?? 0);

  if (completedMigrations < 1) {
    throw new Error("No completed SMRT schema migrations found");
  }

  const demoTenant = starterData.demoTenant;
  const tenantResult = await db.query(
    `
      SELECT id, slug, status
      FROM tenants
      WHERE id = ? AND slug = ? AND status = 'active'
    `,
    demoTenant.id,
    demoTenant.slug,
  );

  if (tenantResult.rows.length !== 1) {
    throw new Error(`Seeded demo tenant ${demoTenant.id} was not found`);
  }

  const ownerMembershipResult = await db.query(
    `
      SELECT memberships.id AS membership_id, roles.slug AS role_slug, users.email AS user_email
      FROM memberships
      INNER JOIN roles ON roles.id = memberships.role_id
      INNER JOIN users ON users.id = memberships.user_id
      WHERE memberships.tenant_id = ?
        AND users.email = ?
        AND memberships.status = 'active'
      LIMIT 1
    `,
    demoTenant.id,
    demoTenant.ownerUser.email,
  );
  const ownerMembership = ownerMembershipResult.rows[0];
  if (ownerMembership?.membership_id !== demoTenant.ownerMembership.id) {
    throw new Error("Seeded demo owner membership was not found");
  }
  if (ownerMembership.role_slug !== "owner") {
    throw new Error(`Seeded demo owner has unexpected role ${ownerMembership.role_slug}`);
  }

  const activePlansResult = await db.query(`
    SELECT COUNT(*)::int AS active_count
    FROM _smrt_subscription_plans
    WHERE status = 'active'
  `);
  const activePlans = Number(activePlansResult.rows[0]?.active_count ?? 0);

  if (activePlans < starterData.plans.length) {
    throw new Error(
      `Expected at least ${starterData.plans.length} active subscription plans, found ${activePlans}`,
    );
  }

  const plans = await SubscriptionPlanCollection.create({ db });
  const subscriptions = await TenantSubscriptionCollection.create({ db });
  const usageMetrics = await TenantUsageMetricCollection.create({ db });
  const resolver = new SubscriptionResolver({
    plans: {
      get: (criteria) => withSystemContext(() => plans.get(criteria)),
    },
    subscriptions,
    usage: {
      summarize: (options) => usageMetrics.summarizeUsage(options),
    },
  });
  const scopedPlans = await withSystemContext(() => plans.findActive());
  if (scopedPlans.length < starterData.plans.length) {
    throw new Error(
      `Expected system plan reader to find at least ${starterData.plans.length} active plans, found ${scopedPlans.length}`,
    );
  }

  const entitlements = await withTenant({ tenantId: demoTenant.id }, () =>
    resolver.resolveTenantEntitlements(demoTenant.id),
  );
  const subscriptionResult = await db.query(
    `
      SELECT stripe_customer_id
      FROM _smrt_tenant_subscriptions
      WHERE tenant_id = ?
      LIMIT 1
    `,
    demoTenant.id,
  );
  const seededStripeCustomerId = subscriptionResult.rows[0]?.stripe_customer_id ?? "";
  if (seededStripeCustomerId !== starterData.demoSubscription.stripeCustomerId) {
    throw new Error("Seeded demo subscription has an unexpected Stripe customer id");
  }

  if (entitlements.planKey !== starterData.demoSubscription.planKey) {
    throw new Error(
      `Expected demo subscription plan ${starterData.demoSubscription.planKey}, found ${entitlements.planKey ?? "none"}`,
    );
  }

  if (!entitlements.featureKeys.includes("mcp.write_tools")) {
    throw new Error("Demo tenant entitlements are missing mcp.write_tools");
  }

  const mcpEvaluation = entitlements.thresholdEvaluations.find(
    (evaluation) => evaluation.threshold.metricKey === "mcp.calls",
  );
  const seededMcpUsage = starterData.usageSeeds
    .filter((metric) => metric.metricKey === "mcp.calls")
    .reduce((total, metric) => total + metric.quantity, 0);
  if (!mcpEvaluation || mcpEvaluation.usage.quantity < seededMcpUsage) {
    throw new Error("Seeded MCP usage was not included in threshold evaluation");
  }

  const promptOverrideResult = await db.query(
    `
      SELECT COUNT(*)::int AS override_count
      FROM _smrt_prompt_overrides
      WHERE tenant_id = ?
    `,
    demoTenant.id,
  );
  const promptOverrides = Number(promptOverrideResult.rows[0]?.override_count ?? 0);
  if (promptOverrides < starterData.promptOverrides.length) {
    throw new Error("Seeded tenant prompt overrides were not found");
  }

  const promptPreview = await resolvePrompt("starter.assistant.system", {
    db,
    tenantId: demoTenant.id,
    variables: { tenantName: demoTenant.name },
  });
  if (!promptPreview.text.includes("Demo Tenant's workspace assistant")) {
    throw new Error("Tenant prompt override was not used for the assistant preview");
  }

  const languageOverrideResult = await db.query(
    `
      SELECT COUNT(*)::int AS override_count
      FROM _smrt_language_overrides
      WHERE tenant_id = ?
    `,
    demoTenant.id,
  );
  const languageOverrides = Number(languageOverrideResult.rows[0]?.override_count ?? 0);
  if (languageOverrides < starterData.languageOverrides.length) {
    throw new Error("Seeded tenant language overrides were not found");
  }

  const languagePreview = await resolveLanguageString("starter.assistant.greeting", {
    db,
    tenantId: demoTenant.id,
    locale: "fr-CA",
    vars: { tenantName: demoTenant.name },
  });
  if (languagePreview.source !== "tenant" || !languagePreview.text.includes(demoTenant.name)) {
    throw new Error("Tenant language override was not used for the assistant greeting");
  }

  console.log(
    JSON.stringify(
      {
        completedMigrations,
        requiredTables: requiredTables.length,
        tenantIdColumns: tenantScopedTables.length,
        seedTenant: demoTenant.id,
        activePlans,
        planKey: entitlements.planKey,
        enabledFeatures: entitlements.featureKeys.length,
        mcpUsage: mcpEvaluation.usage.quantity,
        seededMcpUsage,
        promptOverrides,
        languageOverrides,
      },
      null,
      2,
    ),
  );
} finally {
  await db.close?.();
}

function registerStarterExperienceDefinitions() {
  for (const prompt of starterData.prompts) {
    definePrompt({
      key: prompt.key,
      template: prompt.template,
      ai: prompt.ai,
      editable: prompt.editable,
    });
  }

  for (const languageString of starterData.languageStrings) {
    defineLanguageString({
      key: languageString.key,
      locale: languageString.locale,
      template: languageString.template,
    });
  }
}
