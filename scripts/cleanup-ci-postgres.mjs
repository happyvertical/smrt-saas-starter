#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { assertCiPostgresTarget, resolveBaseUrl } from "./run-with-ci-postgres.mjs";

export function cleanupQuery(cutoffEpoch) {
  return [
    "SELECT datname FROM pg_database",
    "WHERE datname ~ '^smrt_ci_[0-9]+_[a-z0-9_]+$'",
    `AND split_part(datname, '_', 3)::bigint < ${cutoffEpoch}`,
  ].join(" ");
}

export function main(environment = process.env) {
  const baseUrl = resolveBaseUrl(environment);
  assertCiPostgresTarget(baseUrl, environment);
  const cutoffEpoch = Math.floor(Date.now() / 1000) - 6 * 60 * 60;
  const list = spawnSync(
    "psql",
    [baseUrl, "--tuples-only", "--no-align", "--command", cleanupQuery(cutoffEpoch)],
    { encoding: "utf8" },
  );
  if (list.status !== 0) return list.status ?? 1;

  for (const database of list.stdout
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean)) {
    const result = spawnSync("dropdb", ["--force", `--maintenance-db=${baseUrl}`, database], {
      stdio: "inherit",
    });
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
