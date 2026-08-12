#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function validateCleanupTarget(baseUrl, environment = process.env) {
  const expectedHost = environment.CI_POSTGRES_EXPECTED_HOST;
  const expectedUser = environment.CI_POSTGRES_EXPECTED_USER;
  if (!expectedHost || !expectedUser) {
    throw new Error("CI_POSTGRES_EXPECTED_HOST and CI_POSTGRES_EXPECTED_USER are required");
  }
  const parsedBaseUrl = new URL(baseUrl);
  if (
    parsedBaseUrl.hostname !== expectedHost ||
    decodeURIComponent(parsedBaseUrl.username) !== expectedUser
  ) {
    throw new Error("Refusing cleanup: PostgreSQL host or user does not match the CI allowlist");
  }
}

export function main(environment = process.env) {
  const urlFile = environment.CI_POSTGRES_BASE_URL_FILE || "/var/run/ci-services/postgres/url";
  const baseUrl = environment.CI_POSTGRES_BASE_URL || readFileSync(urlFile, "utf8").trim();
  validateCleanupTarget(baseUrl, environment);
  const cutoff = Math.floor(Date.now() / 1000) - 6 * 60 * 60;
  const query = `SELECT datname FROM pg_database WHERE datname ~ '^smrt_ci_[0-9]+_' AND split_part(datname, '_', 3)::bigint < ${cutoff}`;
  const list = spawnSync("psql", [baseUrl, "--tuples-only", "--no-align", "--command", query], {
    encoding: "utf8",
  });
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
