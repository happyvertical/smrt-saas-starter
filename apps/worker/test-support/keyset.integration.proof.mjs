/*
 * Opt-in PostgreSQL proof for worker keyset scans. It keeps all fixture rows in
 * one transaction and deliberately rolls it back, so it never alters the
 * seeded disposable database.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolveDatabase } from "@happyvertical/smrt-core";

assert.ok(process.env.NEUTRAL_FIXTURE_DATABASE_URL, "requires disposable PostgreSQL");
process.env.DATABASE_URL = process.env.NEUTRAL_FIXTURE_DATABASE_URL;

const db = await resolveDatabase(
  { type: "postgres", url: process.env.NEUTRAL_FIXTURE_DATABASE_URL },
  { dbid: `worker-keyset-proof-${process.pid}` },
);
const rollback = new Error("worker-keyset-proof-rollback");
const namespace = randomUUID();

try {
  const jobs = await import("../dist/jobs.js");

  try {
    await db.transaction(async (tx) => {
      const plan = await tx.query(
        "SELECT id FROM _smrt_subscription_plans WHERE plan_key = ? LIMIT 1",
        "growth",
      );
      assert.ok(plan.rows[0]?.id, "normally seeded growth plan is required");

      const fixture = Array.from({ length: 101 }, (_, index) => ({
        tenantId: randomUUID(),
        subscriptionId: randomUUID(),
        index,
      }));
      const now = new Date("2026-09-14T00:00:00.000Z").toISOString();
      for (const row of fixture) {
        await tx.insert("tenants", {
          id: row.tenantId,
          slug: `worker-keyset-${namespace}-${row.index}`,
          context: `worker-keyset-proof:${namespace}`,
          _meta_type: "@happyvertical/smrt-users:Tenant",
          name: `Worker keyset proof ${row.index}`,
          status: "active",
          hierarchy_level: 0,
          hierarchy_path: row.tenantId,
        });
        await tx.insert("_smrt_tenant_subscriptions", {
          id: row.subscriptionId,
          slug: `worker-keyset-subscription-${namespace}-${row.index}`,
          context: row.tenantId,
          updated_at: now,
          tenant_id: row.tenantId,
          subscriber_kind: "tenant",
          subscriber_external_id: "",
          plan_id: plan.rows[0].id,
          status: "active",
          started_at: now,
          current_period_start: null,
          current_period_end: null,
          trial_ends_at: null,
          cancel_at_period_end: false,
          canceled_at: null,
          external_provider: "stripe",
          stripe_customer_id: `cus-${row.index}`,
          stripe_subscription_id: `sub-${row.index}`,
          stripe_checkout_session_id: "",
          metadata: JSON.stringify({ proof: namespace }),
        });
      }

      const subscriptions = await jobs.createSmrtSubscriptionReconciliationStore(tx);
      const allSubscriptions = await drainKeyset((afterId) =>
        subscriptions.listStripeSubscriptions(100, afterId),
      );
      const expectedSubscriptions = await countRows(
        tx,
        `
          SELECT COUNT(*) AS count
          FROM _smrt_tenant_subscriptions
          WHERE subscriber_kind = 'tenant'
            AND subscriber_external_id = ''
            AND external_provider = 'stripe'
            AND stripe_subscription_id IS NOT NULL
            AND stripe_subscription_id <> ''
        `,
      );
      assert.equal(allSubscriptions.length, expectedSubscriptions);
      assert.equal(new Set(allSubscriptions.map((row) => row.id)).size, expectedSubscriptions);
      assert.ok(
        fixture.every((row) =>
          allSubscriptions.some((subscription) => subscription.id === row.subscriptionId),
        ),
        "all 101 owned subscriptions must be reached across UUID pages",
      );

      const tenants = await jobs.createSmrtUsageAuditStore(tx);
      const allTenantIds = await drainKeyset((afterTenantId) =>
        tenants.listTenantIdsWithSubscriptions(100, afterTenantId),
      );
      const expectedTenants = await countRows(
        tx,
        `
          SELECT COUNT(DISTINCT tenant_id) AS count
          FROM _smrt_tenant_subscriptions
          WHERE subscriber_kind = 'tenant'
            AND subscriber_external_id = ''
            AND status IN ('active', 'trialing', 'past_due')
        `,
      );
      assert.equal(allTenantIds.length, expectedTenants);
      assert.equal(new Set(allTenantIds).size, expectedTenants);
      assert.ok(
        fixture.every((row) => allTenantIds.includes(row.tenantId)),
        "all 101 owned tenants must be reached across UUID pages",
      );

      const subscriptionsByStripeId = new Map(
        allSubscriptions.map((subscription) => [subscription.stripeSubscriptionId, subscription]),
      );
      const updatedFixtureIds = new Set();
      const billing = {
        retrieveSubscriptionStatus: async (stripeSubscriptionId) => {
          const subscription = subscriptionsByStripeId.get(stripeSubscriptionId);
          assert.ok(subscription, `unexpected Stripe subscription ${stripeSubscriptionId}`);
          return {
            externalId: stripeSubscriptionId,
            status: subscription.status,
            customerExternalId: subscription.stripeCustomerId,
            currentPeriodStart: subscription.currentPeriodStart ?? undefined,
            currentPeriodEnd: subscription.currentPeriodEnd ?? undefined,
            trialEnd: subscription.trialEndsAt ?? undefined,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            canceledAt: subscription.canceledAt ?? undefined,
          };
        },
      };
      const reconciliationStore = await jobs.createSmrtSubscriptionReconciliationStore(tx);
      const reconciliation = await jobs.reconcileSubscriptions({
        billing,
        store: {
          listStripeSubscriptions: reconciliationStore.listStripeSubscriptions,
          updateStripeSubscription: async (subscription, update) => {
            if (fixture.some((row) => row.subscriptionId === subscription.id)) {
              updatedFixtureIds.add(subscription.id);
            }
            await reconciliationStore.updateStripeSubscription(subscription, update);
          },
        },
        limit: 100,
      });
      assert.equal(reconciliation.processed, expectedSubscriptions);
      assert.equal(reconciliation.failed, 0);
      assert.equal(updatedFixtureIds.size, 0, "unchanged fixture subscriptions must not update");
      assert.ok((reconciliation.skipped ?? 0) >= fixture.length);

      const audit = await jobs.auditUsageThresholds({
        store: await jobs.createSmrtUsageAuditStore(tx),
        resolver: {
          resolveTenantEntitlements: async (tenantId) => ({
            tenantId,
            thresholdEvaluations: [],
          }),
        },
        limit: 100,
      });
      assert.equal(audit.processed, expectedTenants);
      assert.equal(audit.failed, 0);

      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }

  console.log(
    "worker keyset native proof: UUID adapter drains reached all 101 owned unchanged subscriptions and tenants with rollback cleanup",
  );
} finally {
  await db.close?.();
}

async function drainKeyset(loadPage) {
  const values = [];
  let after;
  for (;;) {
    const page = await loadPage(after);
    if (page.length === 0) return values;
    values.push(...page);
    const key = typeof page.at(-1) === "string" ? page.at(-1) : page.at(-1)?.id;
    assert.ok(key && (!after || key > after), "keyset page must advance");
    after = key;
  }
}

async function countRows(db, sql) {
  const result = await db.query(sql);
  const count = Number(result.rows[0]?.count);
  assert.ok(Number.isSafeInteger(count), "expected an integer SQL count");
  return count;
}
