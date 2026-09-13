/*
 * Opt-in real PostgreSQL proof for the signed native report refresh path.
 * It is intentionally not part of the ordinary unit suite: it owns disposable
 * tenant fixtures and starts the built worker entrypoint against DATABASE_URL.
 */

import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAssetRuntime } from "@happyvertical/smrt-assets";
import { resolveDatabase } from "@happyvertical/smrt-core";
import { TenantUsageMetricCollection } from "@happyvertical/smrt-subscriptions";
import { withTenant } from "@happyvertical/smrt-tenancy";
import {
  downloadActivityReportExport,
  executeActivityReportExport,
  executeActivityReportRefresh,
  parseActivityReportActionInput,
} from "../../web/src/lib/server/report-actions.ts";
import { createNeutralTenantFixture } from "../../web/test-support/neutral-tenant-fixture.mjs";

const timeoutMs = 30_000;
const required = ["DATABASE_URL", "REPORT_REFRESH_PG_INTEGRATION"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required for this opt-in integration proof`);
}

const namespace = randomUUID();
const assetPath = await mkdtemp(join(tmpdir(), "issue93-report-assets-"));
const signingKey = randomBytes(48).toString("base64url");
const signingKeyId = `issue93-${randomUUID()}`;
process.env.REPORT_REFRESH_SIGNING_KEY = signingKey;
process.env.REPORT_REFRESH_SIGNING_KEY_ID = signingKeyId;
process.env.SMRT_STARTER_ASSET_STORAGE_PATH = assetPath;
const db = await resolveDatabase(
  { type: "postgres", url: process.env.DATABASE_URL },
  { dbid: `issue93-refresh-${process.pid}` },
);
const oidc = await startOidcServer();
let fixture;
let assetRuntime;
const fixtureExportAssetIds = new Set();
let unrelatedExport;

try {
  fixture = await createNeutralTenantFixture(db, namespace);
  await recordUsage(fixture.tenants.a, "proof.alpha", 3.5);
  await recordUsage(fixture.tenants.b, "proof.beta", 7);

  // Enqueue through the starter's authenticated refresh command boundary,
  // then prove a fresh packaged worker process performs the native task.
  const first = await enqueueFor(fixture.actors.adminA, fixture.tenants.a);
  await runWorkerUntil(first.job.jobId, "completed");
  await assertRows(fixture.tenants.a, 1);
  await assertQuantity(fixture.tenants.a, "proof.alpha", 3.5);
  await assertRows(fixture.tenants.b, 0);
  await assertServiceExports(fixture);
  await createUnrelatedExport();

  // A second event plus a second refresh demonstrates re-materialization; the
  // aggregate is at-least-once safe because the report rebuild is idempotent.
  await recordUsage(fixture.tenants.a, "proof.alpha", 5);
  const second = await enqueueFor(fixture.actors.adminA, fixture.tenants.a);
  await runWorkerUntil(second.job.jobId, "completed");
  await assertQuantity(fixture.tenants.a, "proof.alpha", 8.5);

  // Queue under valid authority, revoke before the worker starts, and require
  // the durable target to fail without altering the existing materialization.
  const revoked = await enqueueFor(fixture.actors.adminA, fixture.tenants.a);
  await recordUsage(fixture.tenants.a, "proof.revoked", 13);
  await db.query(
    "UPDATE memberships SET status = 'inactive' WHERE id = ?",
    fixture.actors.adminA.membershipIds.a,
  );
  await runWorkerUntil(revoked.job.jobId, "failed");
  await assertRows(fixture.tenants.a, 1);
  await assertQuantity(fixture.tenants.a, "proof.alpha", 8.5);
  await assertRows(fixture.tenants.b, 0);

  // Restore only the disposable fixture membership, then tamper the already
  // signed native payload. The runner must reject before authority/refresh.
  await db.query(
    "UPDATE memberships SET status = 'active' WHERE id = ?",
    fixture.actors.adminA.membershipIds.a,
  );
  const tampered = await enqueueFor(fixture.actors.adminA, fixture.tenants.a);
  await recordUsage(fixture.tenants.a, "proof.tampered", 17);
  await db.query(
    "UPDATE _smrt_jobs SET args = jsonb_set(args::jsonb, '{integrity,signature}', '\"tampered\"'::jsonb, true) WHERE id = ?",
    tampered.job.jobId,
  );
  await runWorkerUntil(tampered.job.jobId, "failed");
  await assertRows(fixture.tenants.a, 1);
  await assertQuantity(fixture.tenants.a, "proof.alpha", 8.5);
  await assertRows(fixture.tenants.b, 0);

  console.log(
    "report-refresh-pg=passed native_jobs=4 tenant_isolation=passed revocation=passed tamper=passed export_service=passed",
  );
} finally {
  // The refresh command and the execution-authority host write audit records.
  // They reference fixture profiles, so remove only this fixture's records
  // before the neutral fixture's ownership-checked cleanup.
  if (fixture) {
    const tenantIds = [fixture.tenants.a, fixture.tenants.b];
    await db.query(
      "DELETE FROM audit_logs WHERE profile_id IN (SELECT id FROM profiles WHERE context LIKE ?)",
      `${"starter-neutral-fixture-v1"}:${namespace}:%`,
    );
    await db.query("DELETE FROM _smrt_tenant_usage_metrics WHERE context = ?", namespace);
    await db.query(
      "DELETE FROM _smrt_job_events WHERE job_id IN (SELECT id FROM _smrt_jobs WHERE tenant_id IN (?, ?))",
      ...tenantIds,
    );
    await db.query("DELETE FROM _smrt_jobs WHERE tenant_id IN (?, ?)", ...tenantIds);
    await db.query(
      "DELETE FROM _smrt_principal_report_refresh_tasks WHERE tenant_id IN (?, ?)",
      ...tenantIds,
    );
    await db.query(
      "DELETE FROM _smrt_report_refresh_tasks WHERE tenant_id IN (?, ?)",
      ...tenantIds,
    );
    await db.query("DELETE FROM _smrt_report_runs WHERE tenant_id IN (?, ?)", ...tenantIds);
    await db.query("DELETE FROM _smrt_report_watermarks WHERE tenant_id IN (?, ?)", ...tenantIds);
    await db.query(
      "DELETE FROM starter_tenant_activity_report WHERE tenant_id IN (?, ?)",
      ...tenantIds,
    );
    if (assetRuntime) {
      await removeFixtureExports();
      await assertUnrelatedExportPreserved();
    }
  }
  if (unrelatedExport && assetRuntime) await assetRuntime.store.remove(unrelatedExport);
  await fixture?.cleanup();
  await db.close?.();
  await oidc.close();
  await rm(assetPath, { recursive: true, force: true });
}

async function enqueueFor(actor, tenantId) {
  return await executeActivityReportRefresh(
    { tenantId, user: { id: actor.userId, email: actor.email } },
    "apply",
  );
}

async function recordUsage(tenantId, metricKey, quantity) {
  const metrics = await TenantUsageMetricCollection.create({ db });
  await withTenant({ tenantId }, async () => {
    await metrics.create({
      id: randomUUID(),
      slug: `${namespace}-${metricKey}-${randomUUID()}`,
      context: namespace,
      tenantId,
      metricKey,
      quantity,
      windowStart: new Date("2026-01-01T00:00:00.000Z"),
      windowEnd: new Date("2026-02-01T00:00:00.000Z"),
      source: "issue93-proof",
      sourceId: randomUUID(),
    });
  });
}

async function assertServiceExports(fixture) {
  const actorA = fixture.actors.adminA;
  const localsA = { tenantId: fixture.tenants.a, user: { id: actorA.userId, email: actorA.email } };
  const csv = await executeActivityReportExport(localsA, { phase: "apply", format: "csv" });
  const json = await executeActivityReportExport(localsA, { phase: "apply", format: "json" });
  if (!csv.artifactId || !json.artifactId)
    throw new Error("Fixture report exports did not return stored asset ids");
  fixtureExportAssetIds.add(csv.artifactId);
  fixtureExportAssetIds.add(json.artifactId);
  const csvBytes = Buffer.from(
    await (await downloadActivityReportExport(localsA, csv.artifactId)).arrayBuffer(),
  );
  const jsonBytes = Buffer.from(
    await (await downloadActivityReportExport(localsA, json.artifactId)).arrayBuffer(),
  );
  if (
    !csvBytes.toString().includes("id,metric_key,window_start,quantity") ||
    !csvBytes.toString().includes("proof.alpha") ||
    !csvBytes.toString().includes(",3.5\n")
  )
    throw new Error("CSV export projection did not match the materialized report");
  const exported = JSON.parse(jsonBytes.toString());
  if (
    exported.rows.length !== 1 ||
    exported.rows[0]?.metric_key !== "proof.alpha" ||
    exported.rows[0]?.quantity !== 3.5
  )
    throw new Error("JSON export projection did not match the materialized report");
  const actorB = fixture.actors.adminB;
  const crossTenant = await downloadActivityReportExport(
    { tenantId: fixture.tenants.b, user: { id: actorB.userId, email: actorB.email } },
    csv.artifactId,
  );
  if (crossTenant.status !== 403) throw new Error("Cross-tenant export download was not denied");
  await db.query("UPDATE memberships SET status = 'inactive' WHERE id = ?", actorA.membershipIds.a);
  await expectReject(
    () => downloadActivityReportExport(localsA, csv.artifactId),
    "Revoked export download was not denied",
  );
  await db.query("UPDATE memberships SET status = 'active' WHERE id = ?", actorA.membershipIds.a);
  await expectReject(
    () =>
      Promise.resolve(
        parseActivityReportActionInput({
          phase: "apply",
          format: "csv",
          query: { forbidden: true },
        }),
      ),
    "Forbidden export request field was accepted",
  );
}

async function removeFixtureExports() {
  for (const assetId of fixtureExportAssetIds) {
    const stored = await assetRuntime.store.readById(assetId);
    if (!stored) throw new Error("Fixture report export disappeared before cleanup");
    await assetRuntime.store.remove(stored.asset);
  }
}

async function assertUnrelatedExportPreserved() {
  if (!unrelatedExport?.id) throw new Error("Unrelated export fixture was not created");
  const stored = await assetRuntime.store.readById(unrelatedExport.id);
  if (!stored || stored.data.toString() !== "unrelated fixture export\n") {
    throw new Error("Fixture cleanup removed an unrelated report export");
  }
}

async function createUnrelatedExport() {
  assetRuntime = await createAssetRuntime({ db, storage: assetPath });
  // It shares the broad historical name prefix but belongs to another fixture.
  // Cleanup must preserve both its record and its stored bytes.
  unrelatedExport = await assetRuntime.storeSourceAsset(
    `tenant-activity-unrelated-${randomUUID()}.csv`,
    Buffer.from("unrelated fixture export\n"),
    { mimeType: "text/csv", typeSlug: "report-export" },
  );
}

async function expectReject(operation, message) {
  try {
    await operation();
  } catch {
    return;
  }
  throw new Error(message);
}

async function assertRows(tenantId, expected) {
  const result = await db.query(
    "SELECT count(*)::int AS count FROM starter_tenant_activity_report WHERE tenant_id = ?",
    tenantId,
  );
  if (Number(result.rows[0]?.count) !== expected)
    throw new Error(`Expected ${expected} report rows for fixture tenant`);
}

async function assertQuantity(tenantId, metricKey, expected) {
  const result = await db.query(
    "SELECT quantity FROM starter_tenant_activity_report WHERE tenant_id = ? AND metric_key = ?",
    tenantId,
    metricKey,
  );
  if (Number(result.rows[0]?.quantity) !== expected)
    throw new Error("Report materialization did not contain the expected aggregate");
}

async function runWorkerUntil(jobId, expectedStatus) {
  const child = spawn(process.execPath, ["dist/index.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      WORKER_MODE: "runner",
      WORKER_QUEUE: "issue93-maintenance",
      WORKER_RUN_AGENT_QUEUE: "false",
      WORKER_RUN_SCHEDULER: "false",
      WORKER_ENSURE_MAINTENANCE_SCHEDULES: "false",
      WORKER_CONCURRENCY: "1",
      HAPPYVERTICAL_IDP_ISSUER: oidc.issuer,
      OIDC_CLIENT_ID: "issue93",
      OIDC_CLIENT_SECRET: "integration-only",
      PUBLIC_SITE_URL: "http://127.0.0.1",
      SESSION_SECRET: "integration-only-session-secret",
      SMRT_STARTER_ASSET_STORAGE_PATH: assetPath,
      REPORT_REFRESH_SIGNING_KEY: signingKey,
      REPORT_REFRESH_SIGNING_KEY_ID: signingKeyId,
    },
    stdio: ["ignore", "ignore", "ignore"],
  });
  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = await db.query("SELECT status FROM _smrt_jobs WHERE id = ?", jobId);
      if (result.rows[0]?.status === expectedStatus) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for native job ${expectedStatus}`);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

async function startOidcServer() {
  const server = createServer((request, response) => {
    const issuer = `http://127.0.0.1:${server.address().port}`;
    if (request.url === "/.well-known/openid-configuration") {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
        }),
      );
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    issuer: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
