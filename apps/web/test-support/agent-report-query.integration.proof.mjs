import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { enableTenancy } from "@happyvertical/smrt-tenancy";
import { createServer } from "vite";
import { createNeutralTenantFixture } from "./neutral-tenant-fixture.mjs";

// Explicitly opt into this lane's migrated/seeded disposable PostgreSQL DB.
// No framework/auth/query mocks: Vite only loads the production TypeScript.
assert.ok(
  process.env.NEUTRAL_FIXTURE_DATABASE_URL,
  "Set NEUTRAL_FIXTURE_DATABASE_URL to an owned disposable PostgreSQL database",
);
process.env.DATABASE_URL = process.env.NEUTRAL_FIXTURE_DATABASE_URL;
process.env.SMRT_STARTER_DEV_AUTH = "false";
process.env.SMRT_STARTER_DEMO_AUTH = "false";
// Match the normal server boot in src/hooks.server.ts before any report read.
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
const rowIds = [];
try {
  const adapter = await server.ssrLoadModule("/src/lib/server/agent-report-read.ts");
  const report = await server.ssrLoadModule("/src/lib/server/activity-report.ts");
  const authz = await server.ssrLoadModule("/src/lib/server/authz.ts");
  db = await (await server.ssrLoadModule("/src/lib/server/db.ts")).getAppDatabase();
  fixture = await createNeutralTenantFixture(db, randomUUID());
  for (const [tenant, quantity] of [
    ["a", 7],
    ["b", 99],
  ]) {
    const id = randomUUID();
    await db.insert("starter_tenant_activity_report", {
      id,
      slug: id,
      context: `agent-report-query-proof:${fixture.namespace}`,
      tenant_id: fixture.tenants[tenant],
      metric_key: "fixture.activity",
      window_start: new Date("2026-01-01T00:00:00Z"),
      quantity,
      refreshed_at: new Date("2026-01-02T00:00:00Z"),
    });
    rowIds.push(id);
  }
  const locals = (actor, tenant) => ({
    user: { id: fixture.actors[actor].userId },
    tenantId: fixture.tenants[tenant],
  });
  const membershipFor = (actor, tenant) =>
    authz.requirePermission(locals(actor, tenant), "tenant.usage.read");
  const membership = await membershipFor("aOnly", "a");
  const input = await adapter.createTenantActivityReportQueryInput(fixture.tenants.a);
  const descriptor = await report.getTenantActivityReportDescriptor();
  assert.equal(input.reportId, descriptor.resourceId);
  assert.deepEqual(input.request, report.createTenantActivityReportRequest(fixture.tenants.a));
  assert.deepEqual(input.request.projection, ["id", "metric_key", "window_start", "quantity"]);
  const execute = (slug, args, authority = membership) =>
    adapter.executeTenantActivityReportAgentTool(authority, slug, args);
  const result = await execute("reports.query", input);
  const browser = await report.queryTenantActivityReportRows(
    fixture.tenants.a,
    {},
    {
      lifecycle: true,
      execution: "silent",
      db,
    },
  );
  assert.deepEqual(result.rows, browser.rows);
  assert.deepEqual(result.total, browser.total);
  assert.equal(result.queryFingerprint, browser.queryFingerprint);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].quantity, 7);
  assert.deepEqual(Object.keys(result.rows[0]).sort(), [...input.request.projection].sort());
  console.log(
    "production reports.query: successful; UI request, rows, total and fingerprint parity passed",
  );

  const discovered = await execute("data.discover", {});
  assert.equal(discovered.length, 1);
  assert.equal(discovered[0].id, descriptor.resourceId);
  assert.equal(discovered[0].collection, "tenant.usage");
  const inspected = await execute("data.inspect", { surfaceId: descriptor.resourceId });
  assert.deepEqual(inspected, discovered[0]);
  assert.deepEqual(
    inspected.fields.map((field) => field.id),
    descriptor.columns.map((column) => column.id),
  );
  assert.deepEqual(
    inspected.fields.map((field) => field.id).sort(),
    [...input.request.projection].sort(),
  );
  const genericResult = await execute("data.query", {
    surfaceId: descriptor.resourceId,
    request: input.request,
  });
  assert.deepEqual(genericResult.rows, result.rows);
  assert.deepEqual(genericResult.total, result.total);
  for (const field of ["tenant_id", "refreshed_at", "arbitrary_projection"]) {
    await assert.rejects(
      execute("reports.query", {
        ...input,
        request: { ...input.request, projection: [field] },
      }),
      (error) => error.code === "DATA_QUERY_PROJECTION_NOT_ALLOWED",
    );
  }
  await assert.rejects(
    execute("reports.query", {
      ...input,
      request: {
        ...input.request,
        filter: {
          kind: "condition",
          field: "tenant_id",
          operator: "eq",
          value: fixture.tenants.b,
        },
      },
    }),
    (error) => error.code === "DATA_QUERY_FIELD_NOT_ALLOWED",
  );
  console.log(
    "production report catalog: descriptor parity; tenant, refresh and unknown fields denied",
  );

  const tenantB = await membershipFor("shared", "b");
  const resultB = await execute("reports.query", input, tenantB);
  assert.equal(resultB.rows.length, 1);
  assert.equal(resultB.rows[0].quantity, 99);
  assert.notEqual(resultB.rows[0].id, result.rows[0].id);
  const denied = (error) => error.status === 401 || error.status === 403;
  await assert.rejects(membershipFor("aOnly", "b"), denied);
  await assert.rejects(
    execute("reports.query", input, {
      ...membership,
      tenantId: fixture.tenants.b,
    }),
    denied,
  );
  await assert.rejects(membershipFor("inactive", "a"), denied);
  await assert.rejects(
    execute("reports.query", input, {
      ...membership,
      userId: fixture.actors.inactive.userId,
    }),
    denied,
  );
  await assert.rejects(
    execute("reports.query", input, {
      ...membership,
      userId: randomUUID(),
    }),
    denied,
  );
  await assert.rejects(
    authz.requirePermission({ tenantId: fixture.tenants.a }, "tenant.usage.read"),
    denied,
  );
  await db.query(
    "UPDATE memberships SET status = 'inactive' WHERE id = ?",
    fixture.actors.aOnly.membershipIds.a,
  );
  await assert.rejects(membershipFor("aOnly", "a"), denied);
  // Retain the formerly valid snapshot: the actual adapter must reauthorize it.
  await assert.rejects(execute("reports.query", input), denied);
  await assert.rejects(execute("reports.query", input, { ...membership, permissions: [] }), denied);
  console.log(
    "production authz and report adapter: cross-tenant, missing identity, inactive and revoked stale membership denied",
  );
} finally {
  if (db && fixture) {
    for (const id of rowIds)
      await db.query(
        "DELETE FROM starter_tenant_activity_report WHERE id = ? AND context = ?",
        id,
        `agent-report-query-proof:${fixture.namespace}`,
      );
  }
  await fixture?.cleanup();
  await db?.close();
  await server.close();
}
