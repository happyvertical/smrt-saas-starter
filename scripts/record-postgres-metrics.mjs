#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const environment = process.env;
const startedAt = Number(environment.CI_POSTGRES_STARTED_AT);
const completedAt = Number(environment.CI_POSTGRES_COMPLETED_AT);
if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt)) {
  throw new Error("CI_POSTGRES_STARTED_AT and CI_POSTGRES_COMPLETED_AT must be epoch seconds");
}

const metrics = {
  schemaVersion: 1,
  run: {
    attempt: Number(process.env.GITHUB_RUN_ATTEMPT || 1),
    id: process.env.GITHUB_RUN_ID || "local",
  },
  result: environment.CI_POSTGRES_RESULT || "unknown",
  runner: environment.CI_POSTGRES_RUNNER || "unknown",
  suite: environment.CI_POSTGRES_SUITE || "db-smoke",
  wallSeconds: Math.max(0, completedAt - startedAt),
};

const artifactDir = join("artifacts", "postgres-ci-metrics");
await mkdir(artifactDir, { recursive: true });
await writeFile(
  join(artifactDir, `run-${metrics.run.id}-attempt-${metrics.run.attempt}.json`),
  `${JSON.stringify(metrics, null, 2)}\n`,
);
console.log(`Recorded PostgreSQL ${metrics.runner} metric: ${metrics.wallSeconds}s`);
