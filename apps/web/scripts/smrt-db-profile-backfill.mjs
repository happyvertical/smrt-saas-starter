import { resolveDatabase } from "@happyvertical/smrt-core";
import { backfillMissingUserProfiles } from "../src/lib/server/profile-identity-core.ts";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://smrt_saas:localdev@127.0.0.1:5432/smrt_saas";

const db = await resolveDatabase(
  { type: "postgres", url: databaseUrl },
  { dbid: `smrt-saas-starter-profile-backfill:${process.pid}` },
);

try {
  const reconciledUsers = await backfillMissingUserProfiles(db);
  console.log(JSON.stringify({ reconciledUsers }, null, 2));
} finally {
  await db.close?.();
}
