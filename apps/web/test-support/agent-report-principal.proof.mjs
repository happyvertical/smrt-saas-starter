import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDataSurfaceTools, executeAsPrincipal } from "@happyvertical/smrt-agents";
import { resolveDatabase } from "@happyvertical/smrt-core";
import { registerPermissionDefinitions } from "@happyvertical/smrt-users";
import { createNeutralTenantFixture } from "./neutral-tenant-fixture.mjs";

const url = process.env.NEUTRAL_FIXTURE_DATABASE_URL;
assert.ok(
  url,
  "Set NEUTRAL_FIXTURE_DATABASE_URL to an owned migrated/seeded disposable PostgreSQL database",
);

const unregister = registerPermissionDefinitions([
  { slug: "tenant.usage.read", collection: "tenant.usage" },
]);
const tools = createDataSurfaceTools({
  surfaces: [
    {
      id: "tenant-activity",
      collection: "tenant.usage",
      schema: {
        version: 1,
        identityField: "id",
        fields: [{ id: "id", type: "string", projectable: true }],
        defaultPageLimit: 25,
        maxPageLimit: 25,
      },
      execute: async () => ({ rows: [] }),
    },
  ],
});
const discover = tools.find((tool) => tool.slug === "data.discover");
assert.ok(discover, "data.discover must be present");
const db = await resolveDatabase(
  { type: "postgres", url },
  { dbid: `issue99-principal-proof:${process.pid}` },
);
let fixture;
try {
  fixture = await createNeutralTenantFixture(db, randomUUID());
  const discoverFor = async (actor, tenantId) =>
    await executeAsPrincipal(
      {
        db,
        principal: { runAsUserId: actor.userId, tenantId, allowedTools: ["data.discover"] },
      },
      async (run) => await discover.execute({ run, args: {}, db }),
    );
  const allowed = await discoverFor(fixture.actors.aOnly, fixture.tenants.a);
  assert.equal(allowed.length, 1);
  assert.equal(allowed[0].collection, "tenant.usage");
  const crossTenant = await discoverFor(fixture.actors.aOnly, fixture.tenants.b);
  assert.deepEqual(crossTenant, []);
  await db.query(
    "UPDATE memberships SET status = 'inactive' WHERE id = ?",
    fixture.actors.aOnly.membershipIds.a,
  );
  const revoked = await discoverFor(fixture.actors.aOnly, fixture.tenants.a);
  assert.deepEqual(revoked, []);
  console.log(
    "agent-report-principal=passed live_permission=passed cross_tenant=denied revocation=denied",
  );
} finally {
  unregister();
  await fixture?.cleanup();
  await db.close();
}
