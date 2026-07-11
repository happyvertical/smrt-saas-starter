#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DEFAULT_URL_FILE = "/var/run/ci-services/postgres/url";

const LIBPQ_PARAMETER_ENV = {
  application_name: "PGAPPNAME",
  channel_binding: "PGCHANNELBINDING",
  client_encoding: "PGCLIENTENCODING",
  connect_timeout: "PGCONNECT_TIMEOUT",
  options: "PGOPTIONS",
  sslcert: "PGSSLCERT",
  sslkey: "PGSSLKEY",
  sslmode: "PGSSLMODE",
  sslrootcert: "PGSSLROOTCERT",
  target_session_attrs: "PGTARGETSESSIONATTRS",
};

export function createDatabaseName({
  epoch = Math.floor(Date.now() / 1000),
  runId = process.env.GITHUB_RUN_ID || "local",
  attempt = process.env.GITHUB_RUN_ATTEMPT || "1",
  suite = process.env.CI_POSTGRES_SUITE || process.env.npm_package_name || "starter",
  pid = process.pid,
} = {}) {
  const safe = `${suite}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `smrt_ci_${epoch}_${runId}_${attempt}_${safe}_${pid}`.slice(0, 63);
}

export function databaseUrl(baseUrl, databaseName) {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

export function databaseEnvironment(testUrl, environment = process.env) {
  const url = new URL(testUrl);
  const libpqEnvironment = {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };

  for (const [parameter, value] of url.searchParams) {
    const environmentName = LIBPQ_PARAMETER_ENV[parameter];
    if (environmentName) libpqEnvironment[environmentName] = value;
  }

  return {
    ...environment,
    DATABASE_URL: testUrl,
    TEST_DB_URL: testUrl,
    TEST_DB_ADAPTER: "postgres",
    SMRT_TEST_POSTGRES_URL: testUrl,
    ...libpqEnvironment,
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

export function resolveBaseUrl(environment = process.env) {
  if (environment.CI_POSTGRES_BASE_URL) return environment.CI_POSTGRES_BASE_URL;

  const urlFile = environment.CI_POSTGRES_BASE_URL_FILE || DEFAULT_URL_FILE;
  try {
    const url = readFileSync(urlFile, "utf8").trim();
    if (url) return url;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  throw new Error(`PostgreSQL tests require CI_POSTGRES_BASE_URL or ${urlFile}`);
}

export async function main(argv = process.argv.slice(2)) {
  const separator = argv.indexOf("--");
  const optionArgs = separator === -1 ? [] : argv.slice(0, separator);
  const commandArgs = separator === -1 ? argv : argv.slice(separator + 1);
  if (commandArgs.length === 0) {
    throw new Error("Usage: run-with-ci-postgres.mjs [--suite name] -- <command> [args...]");
  }

  const suiteIndex = optionArgs.indexOf("--suite");
  const suite = suiteIndex === -1 ? undefined : optionArgs[suiteIndex + 1];
  if (suiteIndex !== -1 && !suite) throw new Error("--suite requires a value");

  const [command, ...args] = commandArgs;
  const baseUrl = resolveBaseUrl();
  const databaseName = createDatabaseName({ suite });
  const testUrl = databaseUrl(baseUrl, databaseName);

  if (process.env.GITHUB_ACTIONS === "true") {
    console.log(`::add-mask::${baseUrl}`);
    console.log(`::add-mask::${testUrl}`);
  }

  try {
    const createStatus = run("createdb", [`--maintenance-db=${baseUrl}`, databaseName]);
    if (createStatus !== 0) throw new Error(`createdb failed with status ${createStatus}`);
    return run(command, args, { env: databaseEnvironment(testUrl) });
  } finally {
    const dropStatus = run("dropdb", ["--force", `--maintenance-db=${baseUrl}`, databaseName]);
    if (dropStatus !== 0) {
      console.error(
        `Failed to drop ${databaseName}; the CI database janitor will remove it after six hours`,
      );
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((status) => process.exit(status))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
