import { resolveDatabase } from "@happyvertical/smrt-core";

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

  console.log(
    JSON.stringify(
      {
        completedMigrations,
        requiredTables: requiredTables.length,
        tenantIdColumns: tenantScopedTables.length,
      },
      null,
      2,
    ),
  );
} finally {
  await db.close?.();
}
