#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "postgresql://smrt_saas:localdev@127.0.0.1:5432/postgres";
const DEFAULT_URL_FILE = "/var/run/ci-services/postgres/url";
const defaultEnvironment = process.env;

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

function safeComponent(value, limit) {
  return (
    `${value}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, limit) || "local"
  );
}

export function createDatabaseName({
  epoch = Math.floor(Date.now() / 1000),
  runId = process.env.GITHUB_RUN_ID || "local",
  attempt = process.env.GITHUB_RUN_ATTEMPT || "1",
  suite = defaultEnvironment.CI_POSTGRES_SUITE || "starter",
  pid = process.pid,
} = {}) {
  // PostgreSQL identifiers are limited to 63 bytes. These ASCII components
  // deliberately total 63 characters with the prefix and separators.
  return `smrt_ci_${safeComponent(epoch, 10)}_${safeComponent(runId, 16)}_${safeComponent(attempt, 5)}_${safeComponent(suite, 12)}_${safeComponent(pid, 8)}`;
}

export function databaseUrl(baseUrl, databaseName) {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

export function databaseEnvironment(testUrl, environment = process.env) {
  const url = new URL(testUrl);
  const libpqEnvironment = {
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGHOST: url.hostname,
    PGPASSWORD: decodeURIComponent(url.password),
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
  };

  for (const [parameter, value] of url.searchParams) {
    const environmentName = LIBPQ_PARAMETER_ENV[parameter];
    if (environmentName) libpqEnvironment[environmentName] = value;
  }

  return {
    ...environment,
    DATABASE_URL: testUrl,
    SMRT_TEST_POSTGRES_URL: testUrl,
    TEST_DB_ADAPTER: "postgres",
    TEST_DB_URL: testUrl,
    ...libpqEnvironment,
  };
}

function isLoopback(hostname) {
  return hostname === "127.0.0.1" || hostname === "::1" || hostname === "localhost";
}

export function isLocalComposeTarget(baseUrl, environment = process.env) {
  if (environment.GITHUB_ACTIONS === "true" || environment.CI_POSTGRES_SHARED_LANE === "true") {
    return false;
  }
  return isLoopback(new URL(baseUrl).hostname);
}

export function composePostgresUrl(baseUrl) {
  const url = new URL(baseUrl);
  // The host port is not necessarily the port exposed inside the Compose
  // network. The starter service always listens on PostgreSQL's default port.
  url.hostname = "127.0.0.1";
  url.port = "5432";
  return url.toString();
}

// A shared lane is opt-in and must identify its dedicated host and role. The
// default URL is loopback-only, so a fresh clone cannot point this command at a
// deployment database by accident.
export function assertCiPostgresTarget(baseUrl, environment = process.env) {
  const url = new URL(baseUrl);
  if (isLoopback(url.hostname)) return;

  if (environment.CI_POSTGRES_SHARED_LANE !== "true") {
    throw new Error("Refusing a non-loopback PostgreSQL target outside the shared CI lane");
  }

  const expectedHost = environment.CI_POSTGRES_EXPECTED_HOST;
  const expectedUser = environment.CI_POSTGRES_EXPECTED_USER;
  if (!expectedHost || !expectedUser) {
    throw new Error("Shared CI PostgreSQL requires CI_POSTGRES_EXPECTED_HOST and USER");
  }
  if (url.hostname !== expectedHost || decodeURIComponent(url.username) !== expectedUser) {
    throw new Error(
      "Refusing PostgreSQL target that does not match the CI host and role allowlist",
    );
  }
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

  return DEFAULT_BASE_URL;
}

export function runPostgresCommand(
  command,
  args,
  baseUrl,
  environment = process.env,
  options = {},
  spawn = spawnSync,
) {
  const result = spawn(command, args, options);
  if (result.error?.code !== "ENOENT" || !isLocalComposeTarget(baseUrl, environment)) {
    return result;
  }

  const composeUrl = composePostgresUrl(baseUrl);
  const composeArgs = args.map((argument) => {
    if (argument === baseUrl) return composeUrl;
    return argument.replace(`--maintenance-db=${baseUrl}`, `--maintenance-db=${composeUrl}`);
  });
  return spawn("docker", ["compose", "exec", "-T", "postgres", command, ...composeArgs], options);
}

function run(command, args, options = {}, spawn = spawnSync) {
  const result = spawn(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

export async function main(
  argv = process.argv.slice(2),
  environment = process.env,
  spawn = spawnSync,
) {
  const separator = argv.indexOf("--");
  const optionArgs = separator === -1 ? [] : argv.slice(0, separator);
  const commandArgs = separator === -1 ? argv : argv.slice(separator + 1);
  if (commandArgs.length === 0) {
    throw new Error("Usage: run-with-ci-postgres.mjs [--suite name] -- <command> [args...]");
  }

  const suiteIndex = optionArgs.indexOf("--suite");
  const suite = suiteIndex === -1 ? undefined : optionArgs[suiteIndex + 1];
  if (suiteIndex !== -1 && !suite) throw new Error("--suite requires a value");
  if (optionArgs.length !== (suiteIndex === -1 ? 0 : 2)) {
    throw new Error("Unknown PostgreSQL runner option");
  }

  const baseUrl = resolveBaseUrl(environment);
  assertCiPostgresTarget(baseUrl, environment);
  const databaseName = createDatabaseName({ suite });
  const testUrl = databaseUrl(baseUrl, databaseName);
  const [command, ...args] = commandArgs;

  if (environment.GITHUB_ACTIONS === "true") {
    console.log(`::add-mask::${baseUrl}`);
    console.log(`::add-mask::${testUrl}`);
  }

  let testStatus = 1;
  let testError;
  try {
    const createResult = runPostgresCommand(
      "createdb",
      [`--maintenance-db=${baseUrl}`, databaseName],
      baseUrl,
      environment,
      { stdio: "inherit" },
      spawn,
    );
    if (createResult.error) throw createResult.error;
    const createStatus = createResult.status ?? 1;
    if (createStatus !== 0) throw new Error(`createdb failed with status ${createStatus}`);
    testStatus = run(command, args, { env: databaseEnvironment(testUrl, environment) }, spawn);
  } catch (error) {
    testError = error;
  } finally {
    const dropResult = runPostgresCommand(
      "dropdb",
      ["--force", "--if-exists", `--maintenance-db=${baseUrl}`, databaseName],
      baseUrl,
      environment,
      { stdio: "inherit" },
      spawn,
    );
    const dropStatus = dropResult.error ? 1 : (dropResult.status ?? 1);
    if (dropStatus !== 0) {
      console.error(
        `Failed to drop ${databaseName}; the CI janitor will remove it after six hours`,
      );
      if (!testError && testStatus === 0) testStatus = 1;
    }
  }
  if (testError) throw testError;
  return testStatus;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((status) => process.exit(status))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
