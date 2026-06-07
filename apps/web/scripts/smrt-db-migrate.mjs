import { ObjectRegistry, resolveDatabase } from "@happyvertical/smrt-core";
import { migrateSmrtSchemas } from "@happyvertical/smrt-core/migrations";

import "@happyvertical/smrt-analytics";
import "@happyvertical/smrt-chat";
import "@happyvertical/smrt-commerce";
import "@happyvertical/smrt-features";
import "@happyvertical/smrt-languages";
import "@happyvertical/smrt-ledgers";
import "@happyvertical/smrt-profiles";
import "@happyvertical/smrt-prompts";
import "@happyvertical/smrt-saas-objects";
import "@happyvertical/smrt-subscriptions";
import "@happyvertical/smrt-users";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://smrt_saas:localdev@127.0.0.1:5432/smrt_saas";

const schemas = ObjectRegistry.getAllSchemasAsDefinitions();
const db = await resolveDatabase({ type: "postgres", url: databaseUrl }, { schemas });

const result = await migrateSmrtSchemas({
  db,
  description: "SMRT SaaS starter schema sync",
  engineHint: "postgres",
  packageName: "smrt-saas-starter",
  version: process.env.APP_VERSION ?? "0.1.0",
});

if (result.hasManualDrift) {
  console.error(
    "SMRT schema migration detected manual drift that cannot be applied automatically.",
  );
  for (const change of result.unactionableChanges) {
    console.error(`- ${change.type}: ${change.tableName}.${change.columnName ?? "*"}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        applied: result.applied,
        schemaCount: result.schemaCount,
        statements: result.statements.length,
      },
      null,
      2,
    ),
  );
}
