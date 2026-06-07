import { resolveDatabase } from "@happyvertical/smrt-core";
import {
  SubscriptionPlanCollection,
  SubscriptionResolver,
  TenantSubscriptionCollection,
  TenantUsageMetricCollection,
} from "@happyvertical/smrt-subscriptions";
import { enableTenancy, withSystemContext, withTenant } from "@happyvertical/smrt-tenancy";

import "@happyvertical/smrt-saas-objects";
import "@happyvertical/smrt-subscriptions";
import "@happyvertical/smrt-users";

import starterData from "../src/lib/server/starter-data.json" with { type: "json" };

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://smrt_saas:localdev@127.0.0.1:5432/smrt_saas";

const requiredTables = [
  "_smrt_schema_migrations",
  "_smrt_subscription_plans",
  "_smrt_tenant_subscriptions",
  "_smrt_tenant_usage_metrics",
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
  if (mcpEvaluation?.usage.quantity !== 128) {
    throw new Error("Seeded MCP usage was not included in threshold evaluation");
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
      },
      null,
      2,
    ),
  );
} finally {
  await db.close?.();
}
