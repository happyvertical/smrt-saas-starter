import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertDocumentStatus,
  assertHealthPayload,
  assertRequiredProductionTables,
  assertSeedSnapshot,
  redactProductionDiagnostics,
} from "./production-e2e-contract.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const runId = createRunId();
const label = "dev.smrt.production-e2e";
const artifactDir = join(root, process.env.E2E_ARTIFACT_DIR || `artifacts/production-e2e/${runId}`);
const image = process.env.E2E_WEB_IMAGE || `smrt-saas-starter-web:production-e2e-${runId}`;
const workerImage = `smrt-saas-starter-worker:production-e2e-${runId}`;
const reportRefreshSigningKey = randomBytes(48).toString("base64url");
const workerRuntimeSecret = randomBytes(32).toString("base64url");
const expectedVersion =
  process.env.E2E_APP_VERSION || commandOutput("git", ["rev-parse", "HEAD"]).trim();
const names = {
  network: `smrt-production-e2e-${runId}`,
  postgres: `smrt-production-e2e-postgres-${runId}`,
  web: `smrt-production-e2e-web-${runId}`,
  restart: `smrt-production-e2e-restart-${runId}`,
  worker: `smrt-production-e2e-worker-${runId}`,
  oidc: `smrt-production-e2e-oidc-${runId}`,
};
let primaryBaseUrl;
let failure;

await mkdir(artifactDir, { recursive: true });

try {
  run("docker", [
    "build",
    "-f",
    "apps/web/Dockerfile",
    "--build-arg",
    `APP_VERSION=${expectedVersion}`,
    "-t",
    image,
    ".",
  ]);
  run("docker", ["build", "-f", "apps/worker/Dockerfile", "-t", workerImage, "."]);
  run("docker", ["network", "create", "--label", `${label}=${runId}`, names.network]);
  run("docker", [
    "run",
    "-d",
    "--name",
    names.postgres,
    "--label",
    `${label}=${runId}`,
    "--network",
    names.network,
    "-e",
    "POSTGRES_DB=smrt_saas",
    "-e",
    "POSTGRES_USER=smrt_saas",
    "-e",
    "POSTGRES_PASSWORD=localdev",
    "--health-cmd",
    "pg_isready -U smrt_saas -d smrt_saas",
    "--health-interval",
    "1s",
    "--health-timeout",
    "3s",
    "--health-retries",
    "90",
    "postgres:18-alpine",
  ]);
  await waitForPostgres();

  primaryBaseUrl = await startWeb(names.web);
  assertRequiredProductionTables(readDatabaseTables());
  const seedBeforeRestart = readSeedSnapshot();

  // Report actions are exercised through the compiled web UI below. This
  // worker materializes that queued refresh so the same isolated browser can
  // verify foreground CSV/JSON artifacts. Native worker restart, revocation,
  // and signature behavior remains owned by its focused PG integration proof.
  startOidcReadinessServer();
  await waitForOidcReadiness();
  startReportWorker();

  const restartBaseUrl = await startWeb(names.restart);
  await probeCriticalRoutes(restartBaseUrl);
  assertRequiredProductionTables(readDatabaseTables());
  assertSeedSnapshot(seedBeforeRestart, readSeedSnapshot());

  run("pnpm", ["--filter", "@happyvertical/smrt-saas-web", "test:e2e"], {
    env: {
      ...process.env,
      E2E_PRODUCTION_IMAGE: "true",
      E2E_PRODUCTION_RUN_ID: runId,
      PLAYWRIGHT_BASE_URL: primaryBaseUrl,
      // The production suite includes the native WebMCP contract. Chromium
      // exposes that test API only when this feature is enabled.
      PLAYWRIGHT_WEBMCP_TESTING: "true",
    },
  });
  console.log(`Production-image E2E passed for ${expectedVersion} at ${primaryBaseUrl}.`);
} catch (error) {
  failure = error;
  process.exitCode = 1;
} finally {
  try {
    await captureDiagnostics();
  } catch (error) {
    failure ??= error;
    process.exitCode = 1;
    console.error("Could not capture complete production E2E diagnostics:", error);
  } finally {
    for (const name of [names.worker, names.oidc, names.restart, names.web, names.postgres]) {
      try {
        removeOwnedContainer(name);
      } catch (error) {
        failure ??= error;
        process.exitCode = 1;
        console.error(`Could not clean up production E2E container ${name}:`, error);
      }
    }
    try {
      removeOwnedNetwork(names.network);
    } catch (error) {
      failure ??= error;
      process.exitCode = 1;
      console.error(`Could not clean up production E2E network ${names.network}:`, error);
    }
  }
}

if (failure) throw failure;

function createRunId() {
  const source = `${process.env.GITHUB_RUN_ID || process.pid}-${process.env.GITHUB_RUN_ATTEMPT || Date.now()}`;
  const normalized = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
  if (!normalized) throw new Error("Could not create a production E2E run id.");
  return normalized.slice(0, 42);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: options.env || process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status ?? 1}.`);
  }
}

function commandOutput(command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    encoding: "utf8",
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`,
    );
  }
  return result.stdout || "";
}

function commandCombinedOutput(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    encoding: "utf8",
  });
  return `${result.stdout || ""}${result.stderr || ""}`;
}

async function waitForPostgres() {
  await waitFor("PostgreSQL health", 90_000, () => {
    const state = commandOutput(
      "docker",
      ["inspect", "--format", "{{.State.Health.Status}}", names.postgres],
      { allowFailure: true },
    ).trim();
    if (state === "unhealthy") throw new Error("Ephemeral PostgreSQL became unhealthy.");
    return state === "healthy";
  });
}

async function startWeb(name) {
  run("docker", [
    "run",
    "-d",
    "--name",
    name,
    "--label",
    `${label}=${runId}`,
    "--network",
    names.network,
    "-p",
    "127.0.0.1::3000",
    "-e",
    `DATABASE_URL=postgresql://smrt_saas:localdev@${names.postgres}:5432/smrt_saas`,
    "-e",
    "SMRT_STARTER_MIGRATE_ON_START=true",
    "-e",
    "SMRT_STARTER_DEMO_AUTH=true",
    "-e",
    "SMRT_STARTER_DEMO_TENANT_ID=00000000-0000-4000-8000-000000000001",
    "-e",
    `REPORT_REFRESH_SIGNING_KEY=${reportRefreshSigningKey}`,
    "-e",
    `REPORT_REFRESH_SIGNING_KEY_ID=production-e2e-${runId}`,
    "-e",
    `SMRT_PRODUCTION_E2E_RUN_ID=${runId}`,
    "-e",
    "PUBLIC_APP_NAME=SMRT Production E2E",
    "-e",
    "HOST_HEADER=x-forwarded-host",
    "-e",
    "PROTOCOL_HEADER=x-forwarded-proto",
    image,
  ]);
  const mapping = commandOutput("docker", ["port", name, "3000/tcp"]).trim();
  const port = mapping.match(/:(\d+)$/u)?.[1];
  if (!port) throw new Error(`Could not resolve the mapped web port from ${mapping}.`);
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitFor("web /api/health", 180_000, async () => {
    if (!containerRunning(name)) {
      throw new Error(`${name} exited before becoming healthy.`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) return false;
      assertHealthPayload(await response.json(), expectedVersion);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes("version mismatch")) throw error;
      return false;
    }
  });
  return baseUrl;
}

function startOidcReadinessServer() {
  const script = `const http=require("node:http");const host="http://${names.oidc}:8080";http.createServer((request,response)=>{if(request.url==="/.well-known/openid-configuration"){response.setHeader("content-type","application/json");response.end(JSON.stringify({issuer:host,authorization_endpoint:host+"/authorize",token_endpoint:host+"/token",jwks_uri:host+"/jwks"}));return;}response.statusCode=404;response.end();}).listen(8080,"0.0.0.0");`;
  run("docker", [
    "run",
    "-d",
    "--name",
    names.oidc,
    "--label",
    `${label}=${runId}`,
    "--network",
    names.network,
    "node:24-alpine",
    "node",
    "-e",
    script,
  ]);
}

async function waitForOidcReadiness() {
  await waitFor("synthetic OIDC discovery", 30_000, () => {
    const status = commandOutput(
      "docker",
      [
        "exec",
        names.oidc,
        "node",
        "-e",
        'fetch("http://127.0.0.1:8080/.well-known/openid-configuration").then((response)=>{if(!response.ok)process.exit(1);console.log("ready")}).catch(()=>process.exit(1))',
      ],
      { allowFailure: true },
    );
    return containerRunning(names.oidc) && status.trim() === "ready";
  });
}

function startReportWorker() {
  run("docker", [
    "run",
    "-d",
    "--name",
    names.worker,
    "--label",
    `${label}=${runId}`,
    "--network",
    names.network,
    "-e",
    `DATABASE_URL=postgresql://smrt_saas:localdev@${names.postgres}:5432/smrt_saas`,
    "-e",
    "WORKER_MODE=runner",
    "-e",
    "WORKER_CONCURRENCY=1",
    "-e",
    "WORKER_RUN_AGENT_QUEUE=false",
    "-e",
    "WORKER_RUN_SCHEDULER=false",
    "-e",
    "WORKER_ENSURE_MAINTENANCE_SCHEDULES=false",
    "-e",
    `HAPPYVERTICAL_IDP_ISSUER=http://${names.oidc}:8080`,
    "-e",
    "OIDC_CLIENT_ID=production-e2e",
    "-e",
    `OIDC_CLIENT_SECRET=${workerRuntimeSecret}`,
    "-e",
    `SESSION_SECRET=${workerRuntimeSecret}`,
    "-e",
    `PUBLIC_SITE_URL=http://${names.web}:3000`,
    "-e",
    "SMRT_STARTER_ASSET_STORAGE_PATH=/tmp/smrt-assets",
    "-e",
    `REPORT_REFRESH_SIGNING_KEY=${reportRefreshSigningKey}`,
    "-e",
    `REPORT_REFRESH_SIGNING_KEY_ID=production-e2e-${runId}`,
    workerImage,
  ]);
}

function readDatabaseTables() {
  return commandOutput("docker", [
    "exec",
    names.postgres,
    "psql",
    "-U",
    "smrt_saas",
    "-d",
    "smrt_saas",
    "-Atc",
    "select tablename from pg_tables where schemaname='public' order by tablename",
  ])
    .split("\n")
    .map((table) => table.trim())
    .filter(Boolean);
}

function readSeedSnapshot() {
  const sql = `select json_build_object(
    'tenantIds', (select coalesce(json_agg(id order by id), '[]'::json) from tenants),
    'userIds', (select coalesce(json_agg(id order by id), '[]'::json) from users),
    'membershipIds', (select coalesce(json_agg(id order by id), '[]'::json) from memberships),
    'settingIds', (select coalesce(json_agg(id order by id), '[]'::json) from starter_app_settings),
    'signupAccessMode', (select value from starter_app_settings where key='signup.access_mode')
  )::text`;
  const output = commandOutput("docker", [
    "exec",
    names.postgres,
    "psql",
    "-U",
    "smrt_saas",
    "-d",
    "smrt_saas",
    "-Atc",
    sql,
  ]).trim();
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`Could not parse production seed snapshot: ${output}`);
  }
}

async function probeCriticalRoutes(baseUrl) {
  for (const route of ["/", "/api/health", "/signup", "/app", "/app/settings/field-policies"]) {
    const response = await fetch(`${baseUrl}${route}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    assertDocumentStatus(route, response.status);
  }
}

async function waitFor(labelText, timeoutMs, check) {
  const deadline = Date.now() + timeoutMs;
  let delay = 250;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
      if (error instanceof Error && /unhealthy|exited|version mismatch/u.test(error.message))
        throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(Math.round(delay * 1.5), 2_000);
  }
  throw new Error(
    `Timed out waiting for ${labelText}.${lastError instanceof Error ? ` Last error: ${lastError.message}` : ""}`,
  );
}

function containerRunning(name) {
  return (
    commandOutput("docker", ["inspect", "--format", "{{.State.Running}}", name], {
      allowFailure: true,
    }).trim() === "true"
  );
}

async function captureDiagnostics() {
  for (const name of [names.postgres, names.web, names.restart, names.worker, names.oidc]) {
    const logs = redactProductionDiagnostics(commandCombinedOutput("docker", ["logs", name]));
    const inspect = redactProductionDiagnostics(commandCombinedOutput("docker", ["inspect", name]));
    await writeFile(join(artifactDir, `${name}.log`), logs);
    await writeFile(join(artifactDir, `${name}.inspect.json`), inspect || "[]\n");
  }
  await writeFile(
    join(artifactDir, "summary.json"),
    `${JSON.stringify({ expectedVersion, image, primaryBaseUrl, runId }, null, 2)}\n`,
  );
}

function removeOwnedContainer(name) {
  const owner = commandOutput(
    "docker",
    ["inspect", "--format", `{{index .Config.Labels "${label}"}}`, name],
    { allowFailure: true },
  ).trim();
  if (!owner) return;
  if (owner !== runId) throw new Error(`Refusing to remove foreign container ${name}.`);
  run("docker", ["rm", "-f", name]);
}

function removeOwnedNetwork(name) {
  const owner = commandOutput(
    "docker",
    ["network", "inspect", "--format", `{{index .Labels "${label}"}}`, name],
    { allowFailure: true },
  ).trim();
  if (!owner) return;
  if (owner !== runId) throw new Error(`Refusing to remove foreign network ${name}.`);
  run("docker", ["network", "rm", name]);
}
