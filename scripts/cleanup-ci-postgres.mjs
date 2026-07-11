#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const urlFile = process.env.CI_POSTGRES_BASE_URL_FILE || "/var/run/ci-services/postgres/url";
const baseUrl = process.env.CI_POSTGRES_BASE_URL || readFileSync(urlFile, "utf8").trim();
const cutoff = Math.floor(Date.now() / 1000) - 6 * 60 * 60;

const query = `SELECT datname FROM pg_database WHERE datname ~ '^smrt_ci_[0-9]+_' AND split_part(datname, '_', 3)::bigint < ${cutoff}`;
const list = spawnSync("psql", [baseUrl, "--tuples-only", "--no-align", "--command", query], {
  encoding: "utf8",
});
if (list.status !== 0) process.exit(list.status ?? 1);

for (const database of list.stdout
  .split("\n")
  .map((value) => value.trim())
  .filter(Boolean)) {
  const result = spawnSync("dropdb", ["--force", `--maintenance-db=${baseUrl}`, database], {
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
