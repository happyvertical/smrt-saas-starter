import { ObjectRegistry, resolveDatabase } from "@happyvertical/smrt-core";
import { migrateSmrtSchemas } from "@happyvertical/smrt-core/migrations";
import { registerSmrtRuntimePackages } from "../smrt-packages.mjs";
import { isEmptyPostgresApplicationSchema } from "./fresh-postgres-bootstrap.mjs";
import { backfillIdentityEmailKeys } from "./identity-email-key-backfills.mjs";

import "@happyvertical/smrt-saas-objects";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://smrt_saas:localdev@127.0.0.1:5432/smrt_saas";

await registerSmrtRuntimePackages();

const schemas = ObjectRegistry.getAllSchemasAsDefinitions();
const db = await resolveDatabase({ type: "postgres", url: databaseUrl }, { schemas });
const freshBootstrap = await isEmptyPostgresApplicationSchema(db);

const result = await migrateSmrtSchemas({
  db,
  description: "SMRT SaaS starter schema sync",
  engineHint: "postgres",
  packageName: "smrt-saas-starter",
  version: process.env.APP_VERSION ?? "0.1.1",
  ...(freshBootstrap ? { postgresSafe: false, useConcurrentIndexes: false } : {}),
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
  const { profileEmailKeys, userEmailKeys } = await backfillIdentityEmailKeys(db);
  console.log(
    JSON.stringify(
      {
        applied: result.applied,
        profileEmailKeysUpdated: profileEmailKeys.updated,
        schemaCount: result.schemaCount,
        statements: result.statements.length,
        userEmailKeysUpdated: userEmailKeys.updated,
      },
      null,
      2,
    ),
  );
}
