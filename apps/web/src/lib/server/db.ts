import { resolveDatabase } from "@happyvertical/smrt-core";
import { getSmrtConfig } from "$lib/server/smrt";

export async function getAppDatabase() {
  const dbConfig = getSmrtConfig("Database").db;
  if (!dbConfig) {
    throw new Error("SMRT database configuration is missing");
  }

  return await resolveDatabase(dbConfig, {
    dbid: "smrt-saas-starter-runtime",
  });
}
