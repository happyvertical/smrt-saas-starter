import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolveDatabase } from "@happyvertical/smrt-core";
import { PermissionResolver } from "@happyvertical/smrt-users";
import { createNeutralTenantFixture } from "./neutral-tenant-fixture.mjs";

const url = process.env.NEUTRAL_FIXTURE_DATABASE_URL;
assert.ok(
  url,
  "Set NEUTRAL_FIXTURE_DATABASE_URL to an owned migrated/seeded disposable PostgreSQL database",
);
const db = await resolveDatabase(
  { type: "postgres", url },
  { dbid: `neutral-fixture-proof:${process.pid}` },
);
let fixture;
try {
  const namespace = randomUUID();
  fixture = await createNeutralTenantFixture(db, namespace);
  assert.equal(Object.keys(fixture.actors).length, 7);
  const resolver = new PermissionResolver({ db });
  await resolver.initialize();
  for (const [actor, tenant, expected] of [
    ["shared", "a", true],
    ["shared", "b", true],
    ["aOnly", "a", true],
    ["aOnly", "b", false],
    ["adminA", "a", true],
    ["adminB", "b", true],
    ["inactive", "a", false],
    ["serviceIntended", "a", true],
  ]) {
    assert.equal(
      await resolver.hasPermission(
        fixture.actors[actor].userId,
        fixture.tenants[tenant],
        "fixture.report.prepare",
      ),
      expected,
      `${actor}/${tenant}`,
    );
  }
  assert.equal(
    await resolver.hasPermission(
      fixture.actors.viewer.userId,
      fixture.tenants.a,
      "fixture.report.read",
    ),
    true,
  );
  assert.equal(
    await resolver.hasPermission(
      fixture.actors.viewer.userId,
      fixture.tenants.a,
      "fixture.report.prepare",
    ),
    false,
  );
  await assert.rejects(createNeutralTenantFixture(db, namespace), /already exists/);
  await assert.rejects(createNeutralTenantFixture(db, "not-a-uuid"), /must be a UUID/);
  const rollbackNamespace = randomUUID();
  let inserts = 0;
  await assert.rejects(
    createNeutralTenantFixture(
      {
        transaction: (callback) =>
          db.transaction((tx) =>
            callback({
              ...tx,
              insert: async (...args) => {
                if (++inserts === 4) throw new Error("Injected fixture insertion failure");
                return tx.insert(...args);
              },
            }),
          ),
      },
      rollbackNamespace,
    ),
    /Injected fixture insertion failure/,
  );
  assert.equal(
    (
      await db.query(
        "SELECT id FROM tenants WHERE context = ?",
        `starter-neutral-fixture-v1:${rollbackNamespace}`,
      )
    ).rows.length,
    0,
  );
  const afterRollback = await createNeutralTenantFixture(db, rollbackNamespace);
  await afterRollback.cleanup();

  const ownedUser = fixture.actors.shared.userId;
  const originalContext = (await db.query("SELECT context FROM users WHERE id = ?", ownedUser))
    .rows[0].context;
  await db.query("UPDATE users SET context = 'foreign-owner' WHERE id = ?", ownedUser);
  try {
    await assert.rejects(fixture.cleanup(), /ownership changed/);
    assert.equal(
      (await db.query("SELECT id FROM tenants WHERE id = ?", fixture.tenants.a)).rows.length,
      1,
    );
  } finally {
    await db.query("UPDATE users SET context = ? WHERE id = ?", originalContext, ownedUser);
  }

  const concurrentNamespace = randomUUID();
  const concurrent = await Promise.allSettled([
    createNeutralTenantFixture(db, concurrentNamespace),
    createNeutralTenantFixture(db, concurrentNamespace),
  ]);
  assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
  for (const result of concurrent) if (result.status === "fulfilled") await result.value.cleanup();

  const second = await createNeutralTenantFixture(db, randomUUID());
  await fixture.cleanup();
  await fixture.cleanup();
  assert.equal(
    (await db.query("SELECT id FROM users WHERE id = ?", second.actors.shared.userId)).rows.length,
    1,
  );
  await second.cleanup();
  const recreated = await createNeutralTenantFixture(db, namespace);
  assert.equal(recreated.actors.shared.userId, fixture.actors.shared.userId);
  await recreated.cleanup();
  console.log(
    "Neutral PostgreSQL fixture proof passed: actor/tenant permissions, ownership, rollback, concurrent duplicate rejection and deterministic recreation.",
  );
} finally {
  await fixture?.cleanup();
  await db.close();
}
