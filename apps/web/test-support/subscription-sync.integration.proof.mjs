import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { enableTenancy } from "@happyvertical/smrt-tenancy";
import { createServer } from "vite";
import { createNeutralTenantFixture } from "./neutral-tenant-fixture.mjs";

assert.ok(process.env.NEUTRAL_FIXTURE_DATABASE_URL, "requires disposable PostgreSQL");
process.env.DATABASE_URL = process.env.NEUTRAL_FIXTURE_DATABASE_URL;
process.env.SMRT_STARTER_DEV_AUTH = "false";
process.env.SMRT_STARTER_DEMO_AUTH = "false";
enableTenancy();
const root = fileURLToPath(new URL("../", import.meta.url));
const vite = await createServer({
  configFile: false,
  root,
  resolve: { alias: { $lib: `${root}src/lib` } },
  server: { middlewareMode: true, watch: null },
  appType: "custom",
  logLevel: "error",
});
let db;
let fixture;
let originalTransaction;
let newerPromise;
let olderPromise;
let releaseNewer = () => {};
const runId = randomUUID();
function barrier() {
  let resolve = () => {};
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function bounded(promise) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Timed out waiting for native subscription lock proof")),
          20_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
try {
  const { syncStripeBillingEvent } = await vite.ssrLoadModule(
    "/src/lib/server/subscription-sync.ts",
  );
  db = await (await vite.ssrLoadModule("/src/lib/server/db.ts")).getAppDatabase();
  fixture = await createNeutralTenantFixture(db, runId);
  const plan = (
    await db.query("SELECT id FROM _smrt_subscription_plans WHERE plan_key = ? LIMIT 1", "growth")
  ).rows[0];
  assert.ok(plan?.id, "seeded growth plan required");
  const tenantId = fixture.tenants.a;
  const event = (id, timestamp, status) => ({
    id: `evt_${runId}_${id}`,
    type: "customer.subscription.updated",
    data: {
      provider: "stripe",
      timestamp,
      object: {
        id: `sub_${runId}`,
        customer: `cus_${runId}`,
        status,
        metadata: { tenantId, planId: plan.id },
      },
    },
  });
  const initial = await syncStripeBillingEvent(
    event("initial", "2026-09-14T00:00:00.000Z", "trialing"),
  );
  assert.equal(initial.action, "created");
  const reached = barrier();
  const release = barrier();
  const olderLockRequested = barrier();
  releaseNewer = release.resolve;
  originalTransaction = db.transaction;
  let lockRequests = 0;
  db.transaction = (callback) =>
    originalTransaction.call(db, async (tx) =>
      callback(
        new Proxy(tx, {
          get(target, key) {
            if (key === "query")
              return async (sql, ...args) => {
                if (sql.includes("pg_advisory_xact_lock")) {
                  lockRequests += 1;
                  if (lockRequests === 2) olderLockRequested.resolve();
                }
                return target.query(sql, ...args);
              };
            if (key === "upsert")
              return async (table, conflict, data) => {
                if (
                  table === "_smrt_tenant_subscriptions" &&
                  JSON.parse(data.metadata).stripe.lastEventId === `evt_${runId}_newer`
                ) {
                  reached.resolve();
                  await release.promise;
                }
                return target.upsert(table, conflict, data);
              };
            const value = target[key];
            return typeof value === "function" ? value.bind(target) : value;
          },
        }),
      ),
    );
  newerPromise = syncStripeBillingEvent(event("newer", "2026-09-14T00:02:00.000Z", "active"));
  await bounded(reached.promise);
  olderPromise = syncStripeBillingEvent(event("older", "2026-09-14T00:01:00.000Z", "past_due"));
  await bounded(olderLockRequested.promise);
  releaseNewer();
  const [newer, older] = await bounded(Promise.all([newerPromise, olderPromise]));
  assert.equal(newer.action, "updated");
  assert.equal(older.action, "ignored");
  assert.equal(older.reason, "stale-event");
  const result = await db.query(
    "SELECT id,status,metadata FROM _smrt_tenant_subscriptions WHERE tenant_id = ? AND subscriber_kind = ? AND subscriber_external_id = ?",
    tenantId,
    "tenant",
    "",
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].id, initial.subscriptionId);
  assert.equal(result.rows[0].status, "active");
  const metadata =
    typeof result.rows[0].metadata === "string"
      ? JSON.parse(result.rows[0].metadata)
      : result.rows[0].metadata;
  assert.equal(metadata.stripe.lastEventId, `evt_${runId}_newer`);
  console.log(
    "subscription sync native proof: concurrent older event waits for tenant transaction, rechecks ordering, and cannot overwrite newer entitlement",
  );
} finally {
  releaseNewer();
  await Promise.allSettled([newerPromise, olderPromise].filter(Boolean));
  if (db && originalTransaction) db.transaction = originalTransaction;
  if (fixture && db) {
    await db.query("DELETE FROM _smrt_tenant_subscriptions WHERE tenant_id = ?", fixture.tenants.a);
    await fixture.cleanup();
  }
  await db?.close();
  await vite.close();
}
