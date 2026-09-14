import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { enableTenancy } from "@happyvertical/smrt-tenancy";
import { createServer } from "vite";
import { createNeutralTenantFixture } from "./neutral-tenant-fixture.mjs";

// This proof intentionally loads production TypeScript through Vite and uses
// only the disposable PostgreSQL database supplied by the acceptance runner.
assert.ok(
  process.env.NEUTRAL_FIXTURE_DATABASE_URL,
  "Set NEUTRAL_FIXTURE_DATABASE_URL to an owned disposable PostgreSQL database",
);
process.env.DATABASE_URL = process.env.NEUTRAL_FIXTURE_DATABASE_URL;
process.env.SMRT_STARTER_DEV_AUTH = "false";
process.env.SMRT_STARTER_DEMO_AUTH = "false";
process.env.REPORT_REFRESH_SIGNING_KEY ??= randomUUID().repeat(2);
enableTenancy();

const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({
  configFile: false,
  root,
  resolve: { alias: { $lib: `${root}src/lib` } },
  server: { middlewareMode: true, watch: null },
  appType: "custom",
  logLevel: "error",
});

let db;
let fixture;
const activityIds = [];
try {
  const operations = await server.ssrLoadModule("/src/lib/server/report-operations.ts");
  const objects = await import("@happyvertical/smrt-saas-objects");
  const authz = await server.ssrLoadModule("/src/lib/server/authz.ts");
  db = await (await server.ssrLoadModule("/src/lib/server/db.ts")).getAppDatabase();
  fixture = await createNeutralTenantFixture(db, randomUUID());

  // The final service contract provides the public authenticated command
  // facade and native worker/recovery entry points. Keeping these checks at
  // the production boundary prevents this proof from substituting a test
  // implementation for authority, state, jobs, or snapshot capture.
  for (const name of [
    "listReportOperations",
    "createReportOperation",
    "getReportOperation",
    "cancelReportOperation",
    "decideReportOperation",
  ]) {
    assert.equal(typeof operations[name], "function", `Missing report operation facade: ${name}`);
  }

  const locals = (actor, tenant) => ({
    user: { id: fixture.actors[actor].userId },
    tenantId: fixture.tenants[tenant],
  });
  const principal = (actor, tenant = "a") => ({
    userId: fixture.actors[actor].userId,
    profileId: fixture.actors[actor].profileId,
    tenantId: fixture.tenants[tenant],
  });
  for (const [tenant, quantity] of [
    ["a", 7],
    ["b", 99],
  ]) {
    const id = randomUUID();
    activityIds.push(id);
    await db.insert("starter_tenant_activity_report", {
      id,
      slug: id,
      context: `report-operation-proof:${fixture.namespace}`,
      tenant_id: fixture.tenants[tenant],
      metric_key: "fixture.activity",
      window_start: new Date("2026-01-01T00:00:00Z"),
      quantity,
      refreshed_at: new Date("2026-01-02T00:00:00Z"),
    });
  }
  await assert.rejects(
    authz.requirePermission(locals("viewer", "a"), "reports.refresh"),
    (error) => error.status === 403,
  );

  const create = (kind, query = {}) =>
    operations.createReportOperation(locals("adminA", "a"), {
      kind,
      requestId: randomUUID().replaceAll("-", ""),
      query,
    });
  const ordinary = await create("prepare", { metricKey: "fixture.activity" });
  let runtime = objects.createReportOperationRuntime({ db });
  const envelopeFor = async (operation, runtimeFor = runtime) => {
    const accepted = await runtimeFor.enqueue(operation.id, principal("adminA"));
    assert.equal(accepted.ok, true);
    const job = await db.query("SELECT args FROM _smrt_jobs WHERE id = ?", accepted.details.jobId);
    const envelope = findEnvelope(parseJson(job.rows[0]?.args));
    assert.ok(envelope, "native queue must store a signed action envelope");
    return envelope;
  };
  assert.equal(ordinary.status, "queued");
  const envelope = await envelopeFor(ordinary);
  const handled = await runtime.executeDeferred(envelope);
  assert.equal(handled.ok, true);
  runtime.unregister();
  const committed = await operations.getReportOperation(locals("adminA", "a"), ordinary.id);
  assert.equal(committed.status, "committed");
  assert.equal(committed.snapshot.rows[0].quantity, 7);
  assert.equal(committed.snapshot.query.metricKey, "fixture.activity");
  await assert.rejects(
    operations.getReportOperation(locals("shared", "a"), ordinary.id),
    (e) => e.status === 404,
  );
  await assert.rejects(
    operations.getReportOperation(locals("shared", "b"), ordinary.id),
    (e) => e.status === 404,
  );
  const before = JSON.stringify(committed.snapshot);
  runtime = objects.createReportOperationRuntime({ db });
  await runtime.executeDeferred(envelope);
  runtime.unregister();
  assert.equal(
    JSON.stringify(
      (await operations.getReportOperation(locals("adminA", "a"), ordinary.id)).snapshot,
    ),
    before,
  );
  runtime = objects.createReportOperationRuntime({ db });
  const tampered = structuredClone(envelope);
  tampered.request.payload.fingerprint = randomUUID();
  await assert.rejects(runtime.executeDeferred(tampered));
  // Authority is re-resolved at deferred execution, after durable enqueue.
  runtime.unregister();
  const revoked = await create("prepare");
  runtime = objects.createReportOperationRuntime({ db });
  const revokedEnvelope = await envelopeFor(revoked);
  await db.query(
    "UPDATE memberships SET status = 'inactive' WHERE id = ?",
    fixture.actors.adminA.membershipIds.a,
  );
  await assert.rejects(runtime.executeDeferred(revokedEnvelope), /authority denied/);
  await db.query(
    "UPDATE memberships SET status = 'active' WHERE id = ?",
    fixture.actors.adminA.membershipIds.a,
  );
  runtime.unregister();
  // Pause only after PostgreSQL has acquired the production row lock. The
  // competing production command uses the ordinary connection pool.
  for (const winner of ["cancel", "effect"]) {
    const operation = await create("prepare");
    runtime = objects.createReportOperationRuntime({ db });
    const signedEnvelope = await envelopeFor(operation);
    runtime.unregister();
    const barrier = lockBarrier(db, operation.id);
    const originalTransaction = db.transaction;
    let first;
    let second;
    try {
      if (winner === "cancel") {
        db.transaction = barrier.db.transaction;
        first = operations.cancelReportOperation(locals("adminA", "a"), operation.id);
      } else {
        runtime = objects.createReportOperationRuntime({ db: barrier.db });
        first = runtime.executeDeferred(signedEnvelope);
      }
      // Attach rejection handling immediately while preserving the result.
      first.catch(() => {});
      const holderPid = await bounded(barrier.acquired, "first command must acquire row lock");
      db.transaction = originalTransaction;
      if (winner === "cancel") {
        runtime = objects.createReportOperationRuntime({ db });
        second = runtime.executeDeferred(signedEnvelope);
      } else {
        second = operations.cancelReportOperation(locals("adminA", "a"), operation.id);
      }
      second.catch(() => {});
      await bounded(
        waitForBlockedConnection(db, holderPid),
        "competing command must wait on actual PostgreSQL lock",
      );
      barrier.release();
      await bounded(Promise.all([first, second]), "both overlapping commands must finish");
    } finally {
      db.transaction = originalTransaction;
      barrier.release();
      await Promise.allSettled([first, second].filter(Boolean));
      runtime.unregister();
    }
    const final = await operations.getReportOperation(locals("adminA", "a"), operation.id);
    assert.equal(final.status, winner === "cancel" ? "cancelled" : "committed");
    if (winner === "cancel") assert.equal(final.snapshot, undefined);
    else assert.equal(final.snapshot.rows[0].quantity, 7);
    console.log(
      `report operations: overlapping ${winner}-first race verified with PostgreSQL lock wait`,
    );
  }
  console.log(
    "report operations: native queue envelope, duplicate delivery, snapshot and tenant/owner isolation passed",
  );
  runtime.unregister();
  const awaiting = await create("approval-demo");
  assert.equal(awaiting.status, "awaiting_approval");
  await assert.rejects(
    operations.decideReportOperation(
      locals("adminA", "a"),
      awaiting.id,
      "approve",
      awaiting.payloadFingerprint,
      null,
    ),
    (e) => e.status === 401,
  );
  await assert.rejects(
    operations.decideReportOperation(
      locals("adminA", "a"),
      awaiting.id,
      "approve",
      randomUUID(),
      "forged",
    ),
    (e) => e.status === 401 || e.status === 409,
  );
  const { SessionService } = await import("@happyvertical/smrt-users");
  const sessions = await SessionService.create({ db });
  const sessionId = await sessions.createSession(fixture.actors.adminA.userId, fixture.tenants.a);
  const sessionLocals = { ...locals("adminA", "a"), sessionId };
  await assert.rejects(
    operations.decideReportOperation(
      sessionLocals,
      awaiting.id,
      "approve",
      randomUUID(),
      sessionId,
    ),
    (e) => e.status === 409,
  );
  const foreignSessionId = await sessions.createSession(
    fixture.actors.shared.userId,
    fixture.tenants.b,
  );
  try {
    await assert.rejects(
      operations.decideReportOperation(
        { ...sessionLocals, sessionId: foreignSessionId },
        awaiting.id,
        "approve",
        awaiting.payloadFingerprint,
        foreignSessionId,
      ),
      (e) => e.status === 401,
    );
    assert.equal(
      (await operations.getReportOperation(sessionLocals, awaiting.id)).status,
      "awaiting_approval",
    );
  } finally {
    await sessions.destroySession(foreignSessionId);
    await db.query("DELETE FROM sessions WHERE id = ?", foreignSessionId);
  }
  const approved = await operations.decideReportOperation(
    sessionLocals,
    awaiting.id,
    "approve",
    awaiting.payloadFingerprint,
    sessionId,
  );
  assert.equal(approved.status, "queued");
  runtime = objects.createReportOperationRuntime({ db });
  const approvedEnvelope = await envelopeFor(approved);
  assert.equal((await runtime.executeDeferred(approvedEnvelope)).ok, true);
  runtime.unregister();
  assert.equal(
    (await operations.getReportOperation(sessionLocals, approved.id)).status,
    "committed",
  );
  await sessions.destroySession(sessionId);
  await db.query("DELETE FROM sessions WHERE id = ?", sessionId);
  console.log(
    "report operations: approval demo accepts actual SessionService approval; forged session, foreign real session and stale fingerprint denied",
  );
} finally {
  if (db && fixture) {
    for (const id of activityIds)
      await db.query("DELETE FROM starter_tenant_activity_report WHERE id = ?", id);
  }
  await fixture?.cleanup();
  await db?.close();
  await server.close();
}

function parseJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}
function findEnvelope(value) {
  if (!value || typeof value !== "object") return null;
  if ("binding" in value && "request" in value && "principal" in value) return value;
  for (const child of Object.values(value)) {
    const found = findEnvelope(child);
    if (found) return found;
  }
  return null;
}

function bounded(promise, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), 15000);
    }),
  ]).finally(() => clearTimeout(timer));
}

function lockBarrier(database, operationId) {
  const transaction = database.transaction.bind(database);
  let acquired;
  let release;
  const acquiredPromise = new Promise((resolve) => {
    acquired = resolve;
  });
  const released = new Promise((resolve) => {
    release = resolve;
  });
  let paused = false;
  const proxy = new Proxy(database, {
    get(target, key) {
      if (key === "transaction")
        return (callback, ...options) =>
          transaction(
            async (tx) => {
              const wrapped = new Proxy(tx, {
                get(connection, property) {
                  if (property === "query")
                    return async (sql, ...params) => {
                      const result = await connection.query(sql, ...params);
                      if (!paused && /FOR UPDATE/i.test(sql) && params.includes(operationId)) {
                        paused = true;
                        const pid = await connection.query("SELECT pg_backend_pid() AS pid");
                        acquired(pid.rows[0].pid);
                        await bounded(released, "row-lock barrier was not released");
                      }
                      return result;
                    };
                  const value = Reflect.get(connection, property);
                  return typeof value === "function" ? value.bind(connection) : value;
                },
              });
              return callback(wrapped);
            },
            ...options,
          );
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { db: proxy, acquired: acquiredPromise, release };
}

async function waitForBlockedConnection(database, holderPid) {
  const deadline = Date.now() + 14000;
  while (Date.now() < deadline) {
    const result = await database.query(
      "SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND ?::integer = ANY(pg_blocking_pids(pid))",
      holderPid,
    );
    if (result.rows.length) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("No competing PostgreSQL connection waited for the held operation lock");
}
