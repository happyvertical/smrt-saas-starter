import { createHash } from "node:crypto";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ownershipKey = "starter-neutral-fixture-v1";
const tables = [
  "role_permissions",
  "memberships",
  "users",
  "profiles",
  "roles",
  "permissions",
  "tenants",
];
const grants = {
  admin: ["fixture.report.read", "fixture.report.prepare"],
  member: ["fixture.report.read", "fixture.report.prepare"],
  viewer: ["fixture.report.read"],
};

/** Test-only graph. Requires a normally migrated and seeded disposable database. */
export async function createNeutralTenantFixture(db, namespace) {
  if (!uuidPattern.test(namespace ?? "")) throw new Error("Fixture namespace must be a UUID");
  if (typeof db.transaction !== "function") throw new Error("Fixture requires transactions");
  const key = `${ownershipKey}:${namespace.toLowerCase()}`;
  const id = (name) => {
    const hex = createHash("sha256").update(`${key}:${name}`).digest("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  };
  const records = Object.fromEntries(tables.map((table) => [table, []]));
  const tenants = { a: id("tenant:a"), b: id("tenant:b") };
  const actors = {};
  await db.transaction(async (tx) => {
    // Same namespace serializes across connections, including after rollback.
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", key);
    for (const table of tables) {
      const found = await tx.query(
        `SELECT id FROM ${table} WHERE context IN (?, ?, ?) LIMIT 1`,
        key,
        `${key}:a`,
        `${key}:b`,
      );
      if (found.rows.length)
        throw new Error("Fixture namespace already exists; clean it up before recreating");
    }
    const person = await tx.query(
      "SELECT id FROM profile_types WHERE slug = 'person' AND tenant_id IS NULL LIMIT 1",
    );
    if (!person.rows[0])
      throw new Error("Run the normal starter database seed before creating a fixture");
    const put = async (table, name, data) => {
      const rowId = id(`${table}:${name}`);
      // INSERT only: never overwrite a pre-existing non-fixture identity.
      const row = { id: rowId, slug: `${namespace}-${name}`, context: key, ...data };
      await tx.insert(table, row);
      records[table].push({ id: row.id, context: row.context });
      return row.id;
    };
    for (const tenant of ["a", "b"]) {
      await put("tenants", tenant, {
        id: tenants[tenant],
        _meta_type: "@happyvertical/smrt-users:Tenant",
        name: `Acceptance ${tenant.toUpperCase()}`,
        status: "active",
        hierarchy_level: 0,
        hierarchy_path: tenants[tenant],
      });
    }
    const permissions = {};
    for (const permission of grants.admin) {
      permissions[permission] = await put("permissions", permission, {
        slug: permission,
        name: permission,
        category: "fixture",
      });
    }
    const roles = {};
    for (const tenant of ["a", "b"]) {
      roles[tenant] = {};
      for (const [role, permissionsForRole] of Object.entries(grants)) {
        const roleId = await put("roles", `${tenant}-${role}`, {
          slug: role,
          context: `${key}:${tenant}`,
          tenant_id: tenants[tenant],
          name: role,
          is_system: false,
        });
        roles[tenant][role] = roleId;
        for (const permission of permissionsForRole)
          await put("role_permissions", `${tenant}-${role}-${permission}`, {
            role_id: roleId,
            permission_id: permissions[permission],
          });
      }
    }
    const definitions = {
      shared: { a: "member", b: "member" },
      aOnly: { a: "member" },
      adminA: { a: "admin" },
      adminB: { b: "admin" },
      viewer: { a: "viewer" },
      inactive: { a: "member" },
      serviceIntended: { a: "member" },
    };
    for (const [name, memberships] of Object.entries(definitions)) {
      const email = `${namespace}-${name.toLowerCase()}@example.test`;
      const profileId = await put("profiles", name, {
        tenant_id: null,
        _meta_type: "@happyvertical/smrt-profiles:Person",
        type_id: person.rows[0].id,
        name,
        email,
        email_key: email,
      });
      const userId = await put("users", name, {
        profile_id: profileId,
        email,
        email_key: email,
        status: "active",
      });
      const membershipIds = {};
      for (const [tenant, role] of Object.entries(memberships)) {
        membershipIds[tenant] = await put("memberships", `${name}-${tenant}`, {
          user_id: userId,
          tenant_id: tenants[tenant],
          role_id: roles[tenant][role],
          status: name === "inactive" ? "inactive" : "active",
        });
      }
      actors[name] = {
        userId,
        profileId,
        email,
        membershipIds,
        identityKind: "ordinary-user-fixture",
      };
    }
  });
  return {
    namespace,
    tenants,
    actors,
    grants,
    // This is the published PrincipalBinding shape, not authentication evidence.
    serviceBinding: {
      runAsUserId: actors.serviceIntended.userId,
      tenantId: tenants.a,
      allowedTools: ["fixture.report.read", "fixture.report.prepare"],
    },
    async cleanup() {
      await db.transaction(async (tx) => {
        await tx.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", key);
        for (const table of tables) {
          for (const record of records[table]) {
            const row = await tx.query(
              `SELECT context FROM ${table} WHERE id = ? FOR UPDATE`,
              record.id,
            );
            if (row.rows.length && row.rows[0].context !== record.context)
              throw new Error("Fixture ownership changed; cleanup refused");
          }
        }
        for (const table of tables)
          for (const record of records[table])
            await tx.query(
              `DELETE FROM ${table} WHERE id = ? AND context = ?`,
              record.id,
              record.context,
            );
      });
    },
  };
}
