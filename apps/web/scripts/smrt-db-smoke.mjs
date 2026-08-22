import { fileURLToPath } from "node:url";
import { loadConfig } from "@happyvertical/smrt-config";
import { resolveDatabase } from "@happyvertical/smrt-core";
import { defineLanguageString, resolveLanguageString } from "@happyvertical/smrt-languages";
import { AuditLogCollection, ProfileCollection } from "@happyvertical/smrt-profiles";
import { definePrompt, resolvePrompt } from "@happyvertical/smrt-prompts";
import {
  SubscriptionPlanCollection,
  SubscriptionResolver,
  TenantSubscriptionCollection,
  TenantUsageMetricCollection,
} from "@happyvertical/smrt-subscriptions";
import { enableTenancy, withSystemContext, withTenant } from "@happyvertical/smrt-tenancy";
import { UserCollection } from "@happyvertical/smrt-users";
import { registerSmrtRuntimePackages } from "../smrt-packages.mjs";
import {
  backfillMissingUserProfiles,
  ensureUserProfileWithDatabase,
} from "../src/lib/server/profile-identity-core.ts";

import "@happyvertical/smrt-saas-objects";

import starterData from "../src/lib/server/starter-data.json" with { type: "json" };

await registerSmrtRuntimePackages();
await loadConfig({
  configPath: fileURLToPath(new URL("../smrt.config.mjs", import.meta.url)),
});
registerStarterExperienceDefinitions();

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://smrt_saas:localdev@127.0.0.1:5432/smrt_saas";

const requiredTables = [
  "_smrt_backfills",
  "_smrt_schema_migrations",
  "_smrt_jobs",
  "_smrt_subscription_plans",
  "_smrt_tenant_subscriptions",
  "_smrt_tenant_usage_metrics",
  "agents",
  "analytics_events",
  "asset_associations",
  "chat_messages",
  "contents",
  "contracts",
  "_smrt_feature_definitions",
  "_smrt_language_overrides",
  "accounts",
  "messages",
  "oidc_identities",
  "oidc_profile_email_reservations",
  "audit_logs",
  "profile_types",
  "profiles",
  "projects",
  "_smrt_prompt_overrides",
  "secrets",
  "sites",
  "starter_app_settings",
  "starter_invitations",
  "access_requests",
  "tags",
  "memberships",
  "roles",
  "tenants",
  "users",
];

const tenantScopedTables = ["_smrt_tenant_subscriptions", "_smrt_tenant_usage_metrics"];
const quotedRequiredTables = requiredTables.map((table) => `'${table}'`).join(", ");
const quotedTenantScopedTables = tenantScopedTables.map((table) => `'${table}'`).join(", ");

const db = await resolveDatabase(
  { type: "postgres", url: databaseUrl },
  { dbid: `smrt-saas-starter-db-smoke:${process.pid}` },
);
enableTenancy();

try {
  const tablesResult = await db.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (${quotedRequiredTables})
  `);
  const foundTables = new Set(tablesResult.rows.map((row) => row.table_name));
  const missingTables = requiredTables.filter((table) => !foundTables.has(table));

  if (missingTables.length > 0) {
    throw new Error(`Missing migrated tables: ${missingTables.join(", ")}`);
  }

  const tenantColumnsResult = await db.query(`
    SELECT table_name, udt_name, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (${quotedTenantScopedTables})
      AND column_name = 'tenant_id'
  `);

  const tenantColumns = new Map(
    tenantColumnsResult.rows.map((row) => [
      row.table_name,
      { columnDefault: row.column_default, udtName: row.udt_name },
    ]),
  );

  for (const table of tenantScopedTables) {
    const column = tenantColumns.get(table);
    if (!column) {
      throw new Error(`${table}.tenant_id is missing`);
    }
    if (column.udtName !== "uuid") {
      throw new Error(`${table}.tenant_id must be uuid, found ${column.udtName}`);
    }
    if (column.columnDefault?.includes("''")) {
      throw new Error(`${table}.tenant_id must not default to an empty string`);
    }
  }

  const migrationsResult = await db.query(`
    SELECT COUNT(*)::int AS completed_count
    FROM _smrt_schema_migrations
    WHERE status = 'completed'
  `);
  const completedMigrations = Number(migrationsResult.rows[0]?.completed_count ?? 0);

  if (completedMigrations < 1) {
    throw new Error("No completed SMRT schema migrations found");
  }

  const demoTenant = starterData.demoTenant;
  const tenantResult = await db.query(
    `
      SELECT id, slug, status
      FROM tenants
      WHERE id = ? AND slug = ? AND status = 'active'
    `,
    demoTenant.id,
    demoTenant.slug,
  );

  if (tenantResult.rows.length !== 1) {
    throw new Error(`Seeded demo tenant ${demoTenant.id} was not found`);
  }

  const ownerMembershipResult = await db.query(
    `
      SELECT
        memberships.id AS membership_id,
        roles.slug AS role_slug,
        users.email AS user_email,
        users.profile_id AS profile_id,
        profiles._meta_type AS profile_meta_type,
        profiles.tenant_id AS profile_tenant_id,
        (
          SELECT COUNT(*)::int
          FROM users AS profile_owners
          WHERE profile_owners.profile_id = users.profile_id
        ) AS profile_owner_count
      FROM memberships
      INNER JOIN roles ON roles.id = memberships.role_id
      INNER JOIN users ON users.id = memberships.user_id
      INNER JOIN profiles ON profiles.id = users.profile_id
      WHERE memberships.tenant_id = ?
        AND users.email = ?
        AND memberships.status = 'active'
      LIMIT 1
    `,
    demoTenant.id,
    demoTenant.ownerUser.email,
  );
  const ownerMembership = ownerMembershipResult.rows[0];
  if (ownerMembership?.membership_id !== demoTenant.ownerMembership.id) {
    throw new Error("Seeded demo owner membership was not found");
  }
  if (ownerMembership.role_slug !== "owner") {
    throw new Error(`Seeded demo owner has unexpected role ${ownerMembership.role_slug}`);
  }
  if (!ownerMembership.profile_id) {
    throw new Error("Seeded demo owner is not linked to a Profile");
  }
  if (ownerMembership.profile_meta_type !== "@happyvertical/smrt-profiles:Person") {
    throw new Error(
      `Seeded demo owner has unexpected profile type ${ownerMembership.profile_meta_type}`,
    );
  }
  if (ownerMembership.profile_tenant_id !== null) {
    throw new Error("Seeded demo owner Profile is not global");
  }
  if (Number(ownerMembership.profile_owner_count) !== 1) {
    throw new Error("Seeded demo owner Profile must belong to exactly one User");
  }

  const profiles = await ProfileCollection.create({ db });
  const demoOwnerProfile = await withSystemContext(() =>
    profiles.get({ id: ownerMembership.profile_id }),
  );
  if (!demoOwnerProfile) {
    throw new Error("Seeded demo owner Profile could not be loaded through smrt-profiles");
  }
  const auditLogs = await AuditLogCollection.create({ db });
  const auditLog = await withTenant({ tenantId: demoTenant.id }, () =>
    auditLogs.record({
      profile: demoOwnerProfile,
      action: "starter.db-smoke",
      resourceType: "Tenant",
      resourceId: demoTenant.id,
      source: "ci",
      metadata: { seededBy: "smrt-saas-starter-db-smoke" },
    }),
  );
  const auditLogResult = await db.query(
    `SELECT profile_id, tenant_id
       FROM audit_logs
      WHERE id = ?`,
    auditLog.id,
  );
  if (
    auditLogResult.rows[0]?.profile_id !== ownerMembership.profile_id ||
    auditLogResult.rows[0]?.tenant_id !== demoTenant.id
  ) {
    throw new Error("Canonical AuditLog did not persist the demo owner Profile identity");
  }
  await db.query(`DELETE FROM audit_logs WHERE id = ?`, auditLog.id);
  const profileIdentitySmoke = await verifyProfileIdentityBackfill(db, demoTenant);
  const oidcHappyPath = await verifyOidcHappyPath(db, demoTenant);
  const oidcProfileOnlyCollisionCode = await verifyOidcProfileOnlyCollision(db, demoTenant);

  const activePlansResult = await db.query(`
    SELECT COUNT(*)::int AS active_count
    FROM _smrt_subscription_plans
    WHERE status = 'active'
  `);
  const activePlans = Number(activePlansResult.rows[0]?.active_count ?? 0);

  if (activePlans < starterData.plans.length) {
    throw new Error(
      `Expected at least ${starterData.plans.length} active subscription plans, found ${activePlans}`,
    );
  }

  const plans = await SubscriptionPlanCollection.create({ db });
  const subscriptions = await TenantSubscriptionCollection.create({ db });
  const usageMetrics = await TenantUsageMetricCollection.create({ db });
  const resolver = new SubscriptionResolver({
    plans: {
      get: (criteria) => withSystemContext(() => plans.get(criteria)),
    },
    subscriptions,
    usage: {
      summarize: (options) => usageMetrics.summarizeUsage(options),
    },
  });
  const scopedPlans = await withSystemContext(() => plans.findActive());
  if (scopedPlans.length < starterData.plans.length) {
    throw new Error(
      `Expected system plan reader to find at least ${starterData.plans.length} active plans, found ${scopedPlans.length}`,
    );
  }

  const entitlements = await withTenant({ tenantId: demoTenant.id }, () =>
    resolver.resolveTenantEntitlements(demoTenant.id),
  );
  const subscriptionResult = await db.query(
    `
      SELECT stripe_customer_id
      FROM _smrt_tenant_subscriptions
      WHERE tenant_id = ?
        AND subscriber_kind = 'tenant'
        AND subscriber_external_id = ''
      LIMIT 1
    `,
    demoTenant.id,
  );
  const seededStripeCustomerId = subscriptionResult.rows[0]?.stripe_customer_id ?? "";
  if (seededStripeCustomerId !== starterData.demoSubscription.stripeCustomerId) {
    throw new Error("Seeded demo subscription has an unexpected Stripe customer id");
  }

  const signupSettingResult = await db.query(
    `
      SELECT value
      FROM starter_app_settings
      WHERE key = 'signup.access_mode'
      LIMIT 1
    `,
  );
  if (signupSettingResult.rows[0]?.value !== "public") {
    throw new Error("Seeded signup access setting was not found");
  }

  if (entitlements.planKey !== starterData.demoSubscription.planKey) {
    throw new Error(
      `Expected demo subscription plan ${starterData.demoSubscription.planKey}, found ${entitlements.planKey ?? "none"}`,
    );
  }

  if (!entitlements.featureKeys.includes("mcp.write_tools")) {
    throw new Error("Demo tenant entitlements are missing mcp.write_tools");
  }

  const mcpEvaluation = entitlements.thresholdEvaluations.find(
    (evaluation) => evaluation.threshold.metricKey === "mcp.calls",
  );
  const seededMcpUsage = starterData.usageSeeds
    .filter((metric) => metric.metricKey === "mcp.calls")
    .reduce((total, metric) => total + metric.quantity, 0);
  if (!mcpEvaluation || mcpEvaluation.usage.quantity < seededMcpUsage) {
    throw new Error("Seeded MCP usage was not included in threshold evaluation");
  }

  // AI token usage is seeded into the `_smrt_ai_usage` system table (the source
  // billing thresholds read via `summarizeTenantAiUsage`), not into
  // `_smrt_tenant_usage_metrics`. Prove the seed landed there and that no stale
  // `ai.*` metric rows remain, which would double-count against the AI tokens
  // threshold and the usage screen.
  const aiUsageSummary = await withTenant({ tenantId: demoTenant.id }, () =>
    usageMetrics.summarizeTenantAiUsage({
      tenantId: demoTenant.id,
      window: getCurrentMonthWindow(),
    }),
  );
  const seededAiTokenUsage = starterData.aiUsageSeeds.reduce(
    (total, metric) => total + metric.totalTokens,
    0,
  );
  if (aiUsageSummary.totalTokens !== seededAiTokenUsage) {
    throw new Error(
      `Seeded AI token usage was not recorded in _smrt_ai_usage (expected ${seededAiTokenUsage}, found ${aiUsageSummary.totalTokens})`,
    );
  }

  const strayAiMetricResult = await db.query(
    `
      SELECT COUNT(*)::int AS stray_count
      FROM _smrt_tenant_usage_metrics
      WHERE tenant_id = ? AND metric_key LIKE 'ai.%'
    `,
    demoTenant.id,
  );
  const strayAiMetrics = Number(strayAiMetricResult.rows[0]?.stray_count ?? 0);
  if (strayAiMetrics > 0) {
    throw new Error(
      `Found ${strayAiMetrics} stale ai.* rows in _smrt_tenant_usage_metrics; AI usage must live in _smrt_ai_usage to avoid double-counting`,
    );
  }

  const promptOverrideResult = await db.query(
    `
      SELECT COUNT(*)::int AS override_count
      FROM _smrt_prompt_overrides
      WHERE tenant_id = ?
    `,
    demoTenant.id,
  );
  const promptOverrides = Number(promptOverrideResult.rows[0]?.override_count ?? 0);
  if (promptOverrides < starterData.promptOverrides.length) {
    throw new Error("Seeded tenant prompt overrides were not found");
  }

  const promptPreview = await resolvePrompt("starter.assistant.system", {
    db,
    tenantId: demoTenant.id,
    variables: { tenantName: demoTenant.name },
  });
  if (!promptPreview.text.includes("Demo Tenant's workspace assistant")) {
    throw new Error("Tenant prompt override was not used for the assistant preview");
  }

  const languageOverrideResult = await db.query(
    `
      SELECT COUNT(*)::int AS override_count
      FROM _smrt_language_overrides
      WHERE tenant_id = ?
    `,
    demoTenant.id,
  );
  const languageOverrides = Number(languageOverrideResult.rows[0]?.override_count ?? 0);
  if (languageOverrides < starterData.languageOverrides.length) {
    throw new Error("Seeded tenant language overrides were not found");
  }

  const languagePreview = await resolveLanguageString("starter.assistant.greeting", {
    db,
    tenantId: demoTenant.id,
    locale: "fr-CA",
    vars: { tenantName: demoTenant.name },
  });
  if (languagePreview.source !== "tenant" || !languagePreview.text.includes(demoTenant.name)) {
    throw new Error("Tenant language override was not used for the assistant greeting");
  }

  console.log(
    JSON.stringify(
      {
        completedMigrations,
        requiredTables: requiredTables.length,
        tenantIdColumns: tenantScopedTables.length,
        seedTenant: demoTenant.id,
        activePlans,
        planKey: entitlements.planKey,
        enabledFeatures: entitlements.featureKeys.length,
        mcpUsage: mcpEvaluation.usage.quantity,
        seededMcpUsage,
        aiTokenUsage: aiUsageSummary.totalTokens,
        seededAiTokenUsage,
        promptOverrides,
        languageOverrides,
        profileBackfillUsers: profileIdentitySmoke.backfilledUsers,
        concurrentProfileId: profileIdentitySmoke.concurrentProfileId,
        oidcProfileId: oidcHappyPath.profileId,
        oidcProfileOnlyCollisionCode,
      },
      null,
      2,
    ),
  );
} finally {
  await db.close?.();
}

async function verifyProfileIdentityBackfill(db, demoTenant) {
  const concurrentUser = {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
    slug: "smoke-concurrent-profile-user",
    email: "smoke-concurrent-profile@example.test",
  };
  const legacyUser = {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2",
    slug: "smoke-legacy-profile-user",
    email: "smoke-legacy-profile@example.test",
  };
  const users = [concurrentUser, legacyUser];
  await cleanupProfileIdentitySmoke(db, users);

  try {
    const now = new Date().toISOString();
    for (const user of users) {
      await db.upsert("users", ["slug", "context"], {
        id: user.id,
        slug: user.slug,
        context: "",
        updated_at: now,
        profile_id: null,
        email: user.email,
        email_key: user.email,
        status: "active",
        last_login_at: null,
      });
    }

    const concurrentResults = await withTenant({ tenantId: demoTenant.id }, () =>
      Promise.all([
        ensureUserProfileWithDatabase(db, {
          userId: concurrentUser.id,
          email: concurrentUser.email,
          name: "Concurrent Smoke User",
          reuseExistingProfile: true,
        }),
        ensureUserProfileWithDatabase(db, {
          userId: concurrentUser.id,
          email: concurrentUser.email,
          name: "Concurrent Smoke User",
          reuseExistingProfile: true,
        }),
      ]),
    );
    if (concurrentResults[0].profileId !== concurrentResults[1].profileId) {
      throw new Error("Concurrent Profile reconciliation created different identities");
    }

    const concurrentIdentity = await readSmokeIdentity(db, concurrentUser);
    if (
      concurrentIdentity.profile_id !== concurrentResults[0].profileId ||
      concurrentIdentity.profile_count !== 1 ||
      concurrentIdentity.owner_count !== 1 ||
      concurrentIdentity.tenant_id !== null ||
      concurrentIdentity._meta_type !== "@happyvertical/smrt-profiles:Person"
    ) {
      throw new Error("Concurrent Profile reconciliation did not persist one global Person owner");
    }

    const backfilledUsers = await backfillMissingUserProfiles(db);
    if (backfilledUsers !== 1) {
      throw new Error(`Expected one legacy User backfill, reconciled ${backfilledUsers}`);
    }
    const repeatedBackfillUsers = await backfillMissingUserProfiles(db);
    if (repeatedBackfillUsers !== 0) {
      throw new Error(`Profile backfill was not idempotent (${repeatedBackfillUsers} repeated)`);
    }

    const legacyIdentity = await readSmokeIdentity(db, legacyUser);
    if (
      !legacyIdentity.profile_id ||
      legacyIdentity.profile_count !== 1 ||
      legacyIdentity.owner_count !== 1 ||
      legacyIdentity.tenant_id !== null ||
      legacyIdentity._meta_type !== "@happyvertical/smrt-profiles:Person"
    ) {
      throw new Error("Legacy Profile backfill did not persist one global Person owner");
    }

    const profiles = await ProfileCollection.create({ db });
    const actor = await withSystemContext(() => profiles.get({ id: legacyIdentity.profile_id }));
    if (!actor) {
      throw new Error("Reconciled legacy Person could not be loaded through ProfileCollection");
    }
    const auditLogs = await AuditLogCollection.create({ db });
    const auditLog = await withTenant({ tenantId: demoTenant.id }, () =>
      auditLogs.record({
        profile: actor,
        action: "starter.profile-backfill-smoke",
        resourceType: "User",
        resourceId: legacyUser.id,
        source: "ci",
        metadata: { seededBy: "smrt-saas-starter-db-smoke" },
      }),
    );
    const auditRow = await db.query(
      `SELECT profile_id, tenant_id FROM audit_logs WHERE id = ?`,
      auditLog.id,
    );
    if (
      auditRow.rows[0]?.profile_id !== legacyIdentity.profile_id ||
      auditRow.rows[0]?.tenant_id !== demoTenant.id
    ) {
      throw new Error("Reconciled legacy Person could not write a canonical tenant AuditLog");
    }

    return {
      backfilledUsers,
      concurrentProfileId: concurrentResults[0].profileId,
    };
  } finally {
    await cleanupProfileIdentitySmoke(db, users);
  }
}

async function readSmokeIdentity(db, user) {
  const result = await db.query(
    `
      SELECT
        users.profile_id,
        profiles.tenant_id,
        profiles._meta_type,
        (
          SELECT COUNT(*)::int FROM profiles AS matching_profiles
          WHERE matching_profiles.email_key = users.email_key
        ) AS profile_count,
        (
          SELECT COUNT(*)::int FROM users AS profile_owners
          WHERE profile_owners.profile_id = users.profile_id
        ) AS owner_count
      FROM users
      LEFT JOIN profiles ON profiles.id = users.profile_id
      WHERE users.id = ?
      LIMIT 1
    `,
    user.id,
  );
  const row = result.rows[0];
  return {
    ...row,
    profile_count: Number(row?.profile_count ?? 0),
    owner_count: Number(row?.owner_count ?? 0),
  };
}

async function cleanupProfileIdentitySmoke(db, users) {
  await db.query(
    `DELETE FROM audit_logs WHERE action = ? AND resource_id = ?`,
    "starter.profile-backfill-smoke",
    users[1].id,
  );
  await db.query(`DELETE FROM users WHERE id IN (?, ?)`, users[0].id, users[1].id);
  await db.query(
    `DELETE FROM profiles WHERE slug IN (?, ?) AND context = ''`,
    `starter-person-${users[0].id}`,
    `starter-person-${users[1].id}`,
  );
}

async function verifyOidcHappyPath(db, demoTenant) {
  const identity = {
    email: "smoke-oidc-happy@example.test",
    issuer: "https://idp.example.test/oauth2/openid/starter",
    subject: "smoke-oidc-happy-subject",
  };
  await cleanupOidcHappyPath(db, identity);

  try {
    const users = await UserCollection.create({ db });
    const claims = {
      email: identity.email,
      email_verified: true,
      iss: identity.issuer,
      name: "OIDC Happy Path",
      sub: identity.subject,
    };
    const first = await withTenant({ tenantId: demoTenant.id }, () =>
      users.getOrCreateFromOidc(claims, "happyvertical"),
    );
    const second = await withTenant({ tenantId: demoTenant.id }, () =>
      users.getOrCreateFromOidc(claims, "happyvertical"),
    );
    if (
      !first.user.id ||
      !first.profile.id ||
      !first.oidcIdentity.id ||
      second.user.id !== first.user.id ||
      second.profile.id !== first.profile.id ||
      second.oidcIdentity.id !== first.oidcIdentity.id
    ) {
      throw new Error("Repeated OIDC provisioning did not reuse one stable identity");
    }

    const persisted = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM users WHERE email_key = ?) AS user_count,
         (SELECT COUNT(*)::int FROM profiles WHERE email_key = ?) AS profile_count,
         (SELECT COUNT(*)::int FROM oidc_identities WHERE issuer = ? AND subject = ?) AS identity_count`,
      identity.email,
      identity.email,
      identity.issuer,
      identity.subject,
    );
    if (
      Number(persisted.rows[0]?.user_count ?? 0) !== 1 ||
      Number(persisted.rows[0]?.profile_count ?? 0) !== 1 ||
      Number(persisted.rows[0]?.identity_count ?? 0) !== 1
    ) {
      throw new Error("OIDC happy path did not persist exactly one User, Person, and identity");
    }

    const auditLogs = await AuditLogCollection.create({ db });
    const auditLog = await withTenant({ tenantId: demoTenant.id }, () =>
      auditLogs.record({
        profile: first.profile,
        action: "starter.oidc-happy-smoke",
        resourceType: "User",
        resourceId: first.user.id,
        source: "ci",
        metadata: { seededBy: "smrt-saas-starter-db-smoke" },
      }),
    );
    const auditRow = await db.query(
      `SELECT profile_id, tenant_id FROM audit_logs WHERE id = ?`,
      auditLog.id,
    );
    if (
      auditRow.rows[0]?.profile_id !== first.profile.id ||
      auditRow.rows[0]?.tenant_id !== demoTenant.id
    ) {
      throw new Error("OIDC-provisioned Person could not write a canonical tenant AuditLog");
    }

    return { profileId: first.profile.id };
  } finally {
    await cleanupOidcHappyPath(db, identity);
  }
}

async function cleanupOidcHappyPath(db, identity) {
  await db.query(`DELETE FROM audit_logs WHERE action = ?`, "starter.oidc-happy-smoke");
  const profileResult = await db.query(
    `SELECT profile_id FROM users WHERE email_key = ? LIMIT 1`,
    identity.email,
  );
  const profileId = profileResult.rows[0]?.profile_id;
  await db.query(
    `DELETE FROM oidc_identities WHERE issuer = ? AND subject = ?`,
    identity.issuer,
    identity.subject,
  );
  await db.query(`DELETE FROM users WHERE email_key = ?`, identity.email);
  await db.query(`DELETE FROM oidc_profile_email_reservations WHERE email_key = ?`, identity.email);
  if (profileId) {
    await db.query(`DELETE FROM profiles WHERE id = ?`, profileId);
  }
}

async function verifyOidcProfileOnlyCollision(db, demoTenant) {
  const collision = {
    email: "smoke-oidc-profile-only@example.test",
    issuer: "https://idp.example.test/oauth2/openid/starter",
    profileId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3",
    slug: "smoke-oidc-profile-only",
    subject: "smoke-profile-only-collision",
  };
  await cleanupOidcProfileOnlyCollision(db, collision);

  try {
    const personType = await db.query(
      `SELECT id FROM profile_types WHERE slug = 'person' AND tenant_id IS NULL LIMIT 1`,
    );
    const personTypeId = personType.rows[0]?.id;
    if (!personTypeId) {
      throw new Error("OIDC collision smoke requires the global Person ProfileType");
    }
    await db.upsert("profiles", ["tenant_id", "slug", "context", "_meta_type"], {
      id: collision.profileId,
      slug: collision.slug,
      context: demoTenant.id,
      _meta_type: "@happyvertical/smrt-profiles:Person",
      _meta_data: { seededBy: "smrt-saas-starter-db-smoke" },
      updated_at: new Date().toISOString(),
      tenant_id: demoTenant.id,
      type_id: personTypeId,
      email: collision.email,
      email_key: collision.email,
      name: "Tenant-scoped collision",
    });

    const users = await UserCollection.create({ db });
    let rejectionCode = null;
    try {
      await withTenant({ tenantId: demoTenant.id }, () =>
        users.getOrCreateFromOidc(
          {
            email: collision.email,
            email_verified: true,
            iss: collision.issuer,
            sub: collision.subject,
          },
          "happyvertical",
        ),
      );
    } catch (error) {
      rejectionCode =
        typeof error === "object" && error !== null && "code" in error ? String(error.code) : null;
    }
    if (rejectionCode !== "tenant_scoped") {
      throw new Error(
        `Expected Profile-only OIDC collision to fail as tenant_scoped, received ${rejectionCode ?? "no error"}`,
      );
    }

    const leakedIdentity = await db.query(
      `SELECT COUNT(*)::int AS count
         FROM oidc_identities
        WHERE issuer = ? AND subject = ?`,
      collision.issuer,
      collision.subject,
    );
    const leakedUser = await db.query(
      `SELECT COUNT(*)::int AS count FROM users WHERE email_key = ?`,
      collision.email,
    );
    if (
      Number(leakedIdentity.rows[0]?.count ?? 0) !== 0 ||
      Number(leakedUser.rows[0]?.count ?? 0) !== 0
    ) {
      throw new Error("Rejected Profile-only OIDC collision persisted a User or identity");
    }
    return rejectionCode;
  } finally {
    await cleanupOidcProfileOnlyCollision(db, collision);
  }
}

async function cleanupOidcProfileOnlyCollision(db, collision) {
  await db.query(
    `DELETE FROM oidc_identities WHERE issuer = ? AND subject = ?`,
    collision.issuer,
    collision.subject,
  );
  await db.query(`DELETE FROM users WHERE email_key = ?`, collision.email);
  await db.query(
    `DELETE FROM oidc_profile_email_reservations WHERE email_key = ?`,
    collision.email,
  );
  await db.query(`DELETE FROM profiles WHERE id = ?`, collision.profileId);
}

function getCurrentMonthWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

function registerStarterExperienceDefinitions() {
  for (const prompt of starterData.prompts) {
    definePrompt({
      key: prompt.key,
      template: prompt.template,
      ai: prompt.ai,
      editable: prompt.editable,
    });
  }

  for (const languageString of starterData.languageStrings) {
    defineLanguageString({
      key: languageString.key,
      locale: languageString.locale,
      template: languageString.template,
    });
  }
}
