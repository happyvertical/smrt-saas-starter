import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function migrateOnStart({ environment = process.env, run = spawnSync } = {}) {
  if (environment.SMRT_STARTER_MIGRATE_ON_START !== "true") {
    return;
  }

  for (const [label, script] of [
    ["migration", "scripts/smrt-db-migrate.mjs"],
    ["seed", "scripts/smrt-db-seed.mjs"],
  ]) {
    const result = run(process.execPath, [script], {
      stdio: "inherit",
      env: environment,
    });
    if (result.status !== 0) {
      throw new Error(`Database ${label} failed with status ${result.status ?? 1}.`);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    migrateOnStart();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  await import("../build/index.js");
}
