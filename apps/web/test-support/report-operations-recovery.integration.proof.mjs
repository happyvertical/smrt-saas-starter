import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { enableTenancy } from "@happyvertical/smrt-tenancy";
import { createServer } from "vite";
import { createNeutralTenantFixture } from "./neutral-tenant-fixture.mjs";

assert.ok(
  process.env.NEUTRAL_FIXTURE_DATABASE_URL,
  "Requires an owned disposable PostgreSQL database",
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
const operationIds = [];
const runtimes = [];
let activityId;
try {
  const operations = await server.ssrLoadModule("/src/lib/server/report-operations.ts");
  const objects = await import("@happyvertical/smrt-saas-objects");
  db = await (await server.ssrLoadModule("/src/lib/server/db.ts")).getAppDatabase();
  fixture = await createNeutralTenantFixture(db, randomUUID());
  const actor = fixture.actors.adminA;
  const principal = {
    userId: actor.userId,
    tenantId: fixture.tenants.a,
    profileId: actor.profileId,
  };
  const locals = { user: { id: actor.userId }, tenantId: fixture.tenants.a };
  const query = { metricKey: "recovery.fixture" };
  activityId = randomUUID();
  await db.insert("starter_tenant_activity_report", {
    id: activityId,
    slug: activityId,
    context: `recovery-proof:${fixture.namespace}`,
    tenant_id: fixture.tenants.a,
    metric_key: query.metricKey,
    window_start: new Date("2026-01-01T00:00:00Z"),
    quantity: 31,
  });
  const runtime = (database = db) => {
    const value = objects.createReportOperationRuntime({ db: database });
    runtimes.push(value);
    return value;
  };
  const create = async (requestId = randomUUID()) => {
    const value = await operations.createReportOperation(locals, {
      kind: "prepare",
      requestId,
      query,
    });
    operationIds.push(value.id);
    return value;
  };
  const rowFor = async (id) =>
    (await db.query("SELECT * FROM starter_report_operations WHERE id = ?", id)).rows[0];
  const envelopeFor = async (operation) =>
    parseJson(
      (await db.query("SELECT args FROM _smrt_jobs WHERE id = ?", operation.jobId)).rows[0].args,
    ).envelope;

  // Fault after the actual effect UPDATE, before the real PostgreSQL transaction
  // commits. Only the transaction boundary is faulted; all SQL/authority/state
  // and report projection calls execute against the native database.
  const overlappingRuntimeA = runtime();
  const overlappingRuntimeB = runtime();
  overlappingRuntimeA.unregister();
  const rollback = await create();
  overlappingRuntimeB.unregister();
  console.log(
    "report recovery: overlapping request runtimes share the stable handler without registration conflicts",
  );
  let rolledBackAfterWrite = false;
  const rollbackDb = new Proxy(db, {
    get(target, property) {
      if (property === "transaction")
        return (callback) =>
          target.transaction((tx) =>
            callback(
              new Proxy(tx, {
                get(transaction, key) {
                  if (key === "query")
                    return async (sql, ...parameters) => {
                      const result = await transaction.query(sql, ...parameters);
                      if (
                        sql.includes("SET status = 'committed'") &&
                        parameters.at(-1) === rollback.id
                      ) {
                        rolledBackAfterWrite = true;
                        throw new Error("injected transaction abort after real snapshot write");
                      }
                      return result;
                    };
                  const value = Reflect.get(transaction, key);
                  return typeof value === "function" ? value.bind(transaction) : value;
                },
              }),
            ),
          );
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const rollbackRuntime = runtime(rollbackDb);
  const failed = await rollbackRuntime.executeDeferred(await envelopeFor(rollback));
  assert.equal(rolledBackAfterWrite, true);
  assert.equal(failed.details.failed, 1);
  const rolledBackRow = await rowFor(rollback.id);
  assert.equal(rolledBackRow.status, "queued");
  assert.equal(rolledBackRow.snapshot, null);
  assert.equal(rolledBackRow.execution_evidence, null);
  assert.equal(await rollbackRuntime.reconcile(rollback.id, principal), false);
  rollbackRuntime.unregister();
  console.log(
    "report recovery: PostgreSQL rolls back snapshot and terminal evidence together after effect-write fault",
  );

  // Fail the released store's acknowledgment only after the effect committed.
  // The durable reservation remains real SQL state; no replacement store or
  // fabricated result/evidence is supplied to the production recovery path.
  const orphan = await create();
  const orphanEnvelope = await envelopeFor(orphan);
  const orphanRuntime = runtime();
  let frameworkResult;
  orphanRuntime.state.completeIdempotency = async (_key, _owner, result) => {
    frameworkResult = structuredClone(result);
    throw new Error("injected process loss after effect commit before acknowledgment");
  };
  await assert.rejects(orphanRuntime.executeDeferred(orphanEnvelope), /injected process loss/);
  const committed = await rowFor(orphan.id);
  assert.equal(committed.status, "committed");
  const evidence = parseJson(committed.execution_evidence);
  assert.deepEqual(
    evidence.result,
    frameworkResult,
    "stored terminal evidence must equal the actual released adapter result",
  );
  assert.equal(parseJson(committed.snapshot).rows[0].quantity, 31);
  assert.equal((await orphanRuntime.state.getIdempotency(evidence.key)).status, "reserved");
  orphanRuntime.unregister();
  const restarted = runtime();
  assert.equal(
    await restarted.state.reconcileIdempotency(evidence.key, {
      requestFingerprint: evidence.requestFingerprint,
      reservedAt: evidence.reservedAt,
      result: frameworkResult,
      authorizedBy: actor.userId,
      evidence: "caller assertion is insufficient",
    }),
    false,
  );
  await assert.rejects(
    restarted.reconcile(orphan.id, {
      userId: fixture.actors.shared.userId,
      tenantId: fixture.tenants.a,
      profileId: fixture.actors.shared.profileId,
    }),
  );
  await db.query("UPDATE memberships SET status = 'inactive' WHERE id = ?", actor.membershipIds.a);
  try {
    await assert.rejects(restarted.reconcile(orphan.id, principal));
    await assert.rejects(restarted.executeDeferred(orphanEnvelope));
  } finally {
    await db.query("UPDATE memberships SET status = 'active' WHERE id = ?", actor.membershipIds.a);
  }
  assert.equal(await restarted.reconcile(orphan.id, principal), true);
  const recovered = await restarted.state.getIdempotency(evidence.key);
  assert.equal(recovered.status, "completed");
  assert.deepEqual(recovered.result, frameworkResult);
  assert.deepEqual(await restarted.executeDeferred(orphanEnvelope), frameworkResult);
  assert.deepEqual(parseJson((await rowFor(orphan.id)).snapshot), parseJson(committed.snapshot));
  assert.equal((await operations.cancelReportOperation(locals, orphan.id)).status, "committed");
  restarted.unregister();
  console.log(
    "report recovery: postcommit orphan requires exact terminal evidence and live owner authority; recreated runtime replays exact result",
  );

  // A missing runtime key leaves the real application proposal durable. Then
  // fault the submission acknowledgment after native job + receipt commit.
  const submissionId = randomUUID();
  const signingKey = process.env.REPORT_REFRESH_SIGNING_KEY;
  delete process.env.REPORT_REFRESH_SIGNING_KEY;
  try {
    await assert.rejects(create(submissionId), /REPORT_REFRESH_SIGNING_KEY/);
  } finally {
    process.env.REPORT_REFRESH_SIGNING_KEY = signingKey;
  }
  const submittedRow = (
    await db.query("SELECT * FROM starter_report_operations WHERE request_id = ?", submissionId)
  ).rows[0];
  operationIds.push(submittedRow.id);
  const submitRuntime = runtime();
  submitRuntime.state.completeIdempotency = async () => {
    throw new Error("injected lost submit acknowledgment");
  };
  await assert.rejects(
    submitRuntime.enqueue(submittedRow.id, principal),
    /injected lost submit acknowledgment/,
  );
  const receiptRow = await rowFor(submittedRow.id);
  assert.ok(receiptRow.job_id);
  submitRuntime.unregister();
  const retried = await operations.createReportOperation(locals, {
    kind: "prepare",
    requestId: submissionId,
    query,
  });
  assert.equal(retried.id, submittedRow.id);
  assert.equal(retried.jobId, receiptRow.job_id);
  await assert.rejects(
    operations.createReportOperation(locals, {
      kind: "prepare",
      requestId: submissionId,
      query: { metricKey: "changed" },
    }),
    (e) => e.status === 409,
  );
  const jobs = await db.query("SELECT args FROM _smrt_jobs WHERE tenant_id = ?", fixture.tenants.a);
  assert.equal(
    jobs.rows.filter((job) => parseJson(job.args)?.envelope?.request?.requestId === submittedRow.id)
      .length,
    1,
  );
  console.log(
    "report recovery: lost submit acknowledgment reuses one durable job receipt and rejects conflicting payload",
  );

  // Recreate the entire Node worker process. Use an isolated delivery queue so
  // this proof never claims another concurrently running fixture's jobs. The
  // production queue value is asserted before routing this one owned job.
  const queued = await create();
  const queueName = `recovery-proof-${fixture.namespace}`;
  const actualQueue = await db.query("SELECT queue FROM _smrt_jobs WHERE id = ?", queued.jobId);
  assert.equal(actualQueue.rows[0].queue, "reports");
  await db.query("UPDATE _smrt_jobs SET queue = ? WHERE id = ?", queueName, queued.jobId);
  const childSource = `
    import { resolveDatabase } from '@happyvertical/smrt-core';
    import { enableTenancy } from '@happyvertical/smrt-tenancy';
    import { TaskRunner } from '@happyvertical/smrt-jobs';
    import { registerWorkerReportOperationRuntime } from '@happyvertical/smrt-saas-objects';
    enableTenancy();
    const db = await resolveDatabase({type:'postgres',url:process.env.DATABASE_URL});
    const unregister = registerWorkerReportOperationRuntime(db);
    const runner = new TaskRunner({queues:[process.env.RECOVERY_PROOF_QUEUE],pollInterval:25,concurrency:1,retention:false});
    await runner.initialize(db);
    let timer;
    const done = new Promise((resolve,reject)=>{
      timer=setTimeout(()=>reject(new Error('Worker completion timeout')),15000);
      runner.on('job:completed',(job,result)=>{if(job.id===process.env.RECOVERY_PROOF_JOB_ID)resolve(result)});
      runner.on('job:failed',(_job,error)=>reject(error));
    });
    try { await runner.start(); const result=await done; if(!result.result?.ok)throw new Error('Native task failed: '+JSON.stringify(result)); }
    finally { clearTimeout(timer); await runner.stop(); unregister(); await db.close(); }
  `;
  await promisify(execFile)(process.execPath, ["--input-type=module", "-e", childSource], {
    cwd: root,
    env: { ...process.env, RECOVERY_PROOF_QUEUE: queueName, RECOVERY_PROOF_JOB_ID: queued.jobId },
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  });
  assert.equal((await rowFor(queued.id)).status, "committed");
  assert.equal(
    (await db.query("SELECT status FROM _smrt_jobs WHERE id = ?", queued.jobId)).rows[0].status,
    "completed",
  );
  const listed = await operations.listReportOperations(locals);
  assert.ok(
    listed.filter((operation) => operation.status === "committed").length >= 2,
    "concurrent reconciliation of multiple completed operations must not clash in the shared handler registry",
  );
  console.log(
    "report recovery: fresh Node worker registers the production handler and native TaskRunner commits the persisted signed job",
  );
} finally {
  for (const runtime of runtimes) runtime.unregister();
  if (db && fixture) {
    if (activityId)
      await db.query("DELETE FROM starter_tenant_activity_report WHERE id = ?", activityId);
    for (const id of operationIds)
      await db.query(
        "DELETE FROM starter_report_operations WHERE id = ? AND tenant_id = ?",
        id,
        fixture.tenants.a,
      );
  }
  await fixture?.cleanup();
  await db?.close();
  await server.close();
}
function parseJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}
