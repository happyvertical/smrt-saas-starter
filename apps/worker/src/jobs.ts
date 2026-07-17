import {
  type EntitlementResolution,
  SubscriptionPlanCollection,
  SubscriptionResolver,
  type SubscriptionStatus,
  TenantSubscriptionCollection,
  TenantUsageMetricCollection,
  type UsageMetricRecord,
  type UsageSummary,
  type UsageWindow,
} from "@happyvertical/smrt-subscriptions";
import { withSystemContext, withTenant } from "@happyvertical/smrt-tenancy";
import {
  ensureWorkerTenancy,
  getWorkerDatabase,
  getWorkerSmrtConfig,
  getWorkerStripeBillingProvider,
} from "./runtime.js";

const DEFAULT_JOB_LIMIT = 100;

export type WorkerCycleJob = "all" | "subscriptions.reconcile" | "usage.audit";

export type StripeSubscriptionStatus =
  | "active"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "past_due"
  | "paused"
  | "trialing"
  | "unpaid";

export interface WorkerJobResult {
  job: string;
  processed: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  ok?: number;
  warned?: number;
  blocked?: number;
  observed?: number;
  reason?: string;
}

export interface WorkerLogger {
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
}

export interface WorkerDatabase {
  query(sql: string, ...params: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface StripeSubscriptionStatusSummary {
  externalId: string;
  status: StripeSubscriptionStatus;
  customerExternalId: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date;
  trialEnd?: Date;
  raw?: unknown;
}

export interface StripeSubscriptionBillingProvider {
  retrieveSubscriptionStatus(
    stripeSubscriptionId: string,
  ): Promise<StripeSubscriptionStatusSummary>;
}

export interface ReconcileSubscriptionRecord {
  id: string;
  tenantId: string;
  status: SubscriptionStatus;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  trialEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  metadata: Record<string, unknown>;
}

export interface ReconciledSubscriptionUpdate {
  status: SubscriptionStatus;
  stripeCustomerId: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  trialEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  metadata: Record<string, unknown>;
}

export interface SubscriptionReconciliationStore {
  listStripeSubscriptions(limit: number): Promise<ReconcileSubscriptionRecord[]>;
  updateStripeSubscription(
    subscription: ReconcileSubscriptionRecord,
    update: ReconciledSubscriptionUpdate,
  ): Promise<void>;
}

export interface ReconcileSubscriptionsOptions {
  billing?: StripeSubscriptionBillingProvider | null;
  store?: SubscriptionReconciliationStore;
  limit?: number;
  logger?: WorkerLogger;
}

export interface TenantUsageAuditStore {
  listTenantIdsWithSubscriptions(limit: number): Promise<string[]>;
}

export interface TenantUsageAuditResolver {
  resolveTenantEntitlements(
    tenantId: string,
    options?: { now?: Date },
  ): Promise<EntitlementResolution>;
}

export interface AuditUsageThresholdsOptions {
  store?: TenantUsageAuditStore;
  resolver?: TenantUsageAuditResolver;
  limit?: number;
  now?: Date;
  logger?: WorkerLogger;
}

export interface WorkerCycleOptions {
  job?: WorkerCycleJob;
  billing?: StripeSubscriptionBillingProvider | null;
  subscriptionStore?: SubscriptionReconciliationStore;
  usageStore?: TenantUsageAuditStore;
  resolver?: TenantUsageAuditResolver;
  limit?: number;
  now?: Date;
  logger?: WorkerLogger;
}

export async function runWorkerCycle(options: WorkerCycleOptions = {}): Promise<WorkerJobResult[]> {
  const job = options.job ?? parseWorkerJob(process.env.WORKER_JOB);

  if (job === "subscriptions.reconcile") {
    return [
      await reconcileSubscriptions({
        billing: options.billing,
        store: options.subscriptionStore,
        limit: options.limit,
        logger: options.logger,
      }),
    ];
  }

  if (job === "usage.audit") {
    return [
      await auditUsageThresholds({
        store: options.usageStore,
        resolver: options.resolver,
        limit: options.limit,
        now: options.now,
        logger: options.logger,
      }),
    ];
  }

  return [
    await reconcileSubscriptions({
      billing: options.billing,
      store: options.subscriptionStore,
      limit: options.limit,
      logger: options.logger,
    }),
    await auditUsageThresholds({
      store: options.usageStore,
      resolver: options.resolver,
      limit: options.limit,
      now: options.now,
      logger: options.logger,
    }),
  ];
}

export async function reconcileSubscriptions(
  options: ReconcileSubscriptionsOptions = {},
): Promise<WorkerJobResult> {
  const limit = options.limit ?? DEFAULT_JOB_LIMIT;
  const store = options.store ?? (await createSmrtSubscriptionReconciliationStore());
  const billing =
    options.billing === undefined
      ? ((await getWorkerStripeBillingProvider()) as StripeSubscriptionBillingProvider | null)
      : options.billing;
  const subscriptions = await store.listStripeSubscriptions(limit);

  if (!billing) {
    return {
      job: "subscriptions.reconcile",
      processed: 0,
      skipped: subscriptions.length,
      reason: "billing-provider-not-configured",
    };
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const subscription of subscriptions) {
    try {
      const status = await billing.retrieveSubscriptionStatus(subscription.stripeSubscriptionId);
      const update = toReconciledSubscriptionUpdate(subscription, status);

      if (!hasSubscriptionChanges(subscription, update)) {
        skipped += 1;
        continue;
      }

      await store.updateStripeSubscription(subscription, update);
      updated += 1;
    } catch (error) {
      failed += 1;
      options.logger?.error("Subscription reconciliation failed", {
        subscriptionId: subscription.id,
        tenantId: subscription.tenantId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    job: "subscriptions.reconcile",
    processed: subscriptions.length,
    updated,
    skipped,
    failed,
  };
}

export async function auditUsageThresholds(
  options: AuditUsageThresholdsOptions = {},
): Promise<WorkerJobResult> {
  ensureWorkerTenancy();
  const limit = options.limit ?? DEFAULT_JOB_LIMIT;
  const store = options.store ?? (await createSmrtUsageAuditStore());
  const resolver = options.resolver ?? (await createSmrtSubscriptionResolver());
  const tenantIds = await store.listTenantIdsWithSubscriptions(limit);

  let ok = 0;
  let warned = 0;
  let blocked = 0;
  let observed = 0;
  let failed = 0;

  for (const tenantId of tenantIds) {
    try {
      const resolution = await withTenant({ tenantId }, () =>
        resolver.resolveTenantEntitlements(tenantId, { now: options.now }),
      );

      for (const evaluation of resolution.thresholdEvaluations) {
        // `observe` thresholds are informational only — the resolver never
        // enforces them, but it can still report state "warn" for them. They
        // must not feed the ok/warned/blocked counters or the warn logs below,
        // otherwise an informational threshold over its warning ratio triggers
        // a misleading "thresholds near/exceeded" warning.
        if (evaluation.threshold.enforcement === "observe") {
          observed += 1;
          continue;
        }

        if (evaluation.state === "blocked") {
          blocked += 1;
        } else if (evaluation.state === "warn") {
          warned += 1;
        } else {
          ok += 1;
        }
      }
    } catch (error) {
      failed += 1;
      options.logger?.error("Usage threshold audit failed", {
        tenantId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const result = {
    job: "usage.audit",
    processed: tenantIds.length,
    ok,
    warned,
    blocked,
    observed,
    failed,
  };

  if (blocked > 0) {
    options.logger?.warn("Usage thresholds exceeded", result);
  } else if (warned > 0) {
    options.logger?.warn("Usage thresholds near limits", result);
  } else {
    options.logger?.info("Usage thresholds audited", result);
  }

  return result;
}

export async function rollupUsage(events: UsageMetricRecord[]): Promise<WorkerJobResult> {
  const summaryKeys = new Set(
    events.map((event) =>
      [
        event.tenantId,
        event.metricKey,
        event.windowStart.toISOString(),
        event.windowEnd.toISOString(),
      ].join(":"),
    ),
  );

  return {
    job: "usage.rollup",
    processed: summaryKeys.size,
  };
}

export async function createSmrtSubscriptionReconciliationStore(
  db?: WorkerDatabase,
): Promise<SubscriptionReconciliationStore> {
  ensureWorkerTenancy();
  const database = db ?? (await getWorkerDatabase());

  return {
    async listStripeSubscriptions(limit) {
      const result = await database.query(
        `
          SELECT
            id,
            tenant_id,
            status,
            stripe_customer_id,
            stripe_subscription_id,
            current_period_start,
            current_period_end,
            trial_ends_at,
            cancel_at_period_end,
            canceled_at,
            metadata
          FROM _smrt_tenant_subscriptions
          WHERE subscriber_kind = 'tenant'
            AND subscriber_external_id = ''
            AND external_provider = 'stripe'
            AND stripe_subscription_id IS NOT NULL
            AND stripe_subscription_id <> ''
          ORDER BY updated_at ASC
          LIMIT ?
        `,
        limit,
      );

      return result.rows.map(rowToReconcileSubscriptionRecord).filter(isPresent);
    },

    async updateStripeSubscription(subscription, update) {
      await database.query(
        `
          UPDATE _smrt_tenant_subscriptions
          SET
            updated_at = ?,
            status = ?,
            stripe_customer_id = ?,
            current_period_start = ?,
            current_period_end = ?,
            trial_ends_at = ?,
            cancel_at_period_end = ?,
            canceled_at = ?,
            metadata = ?
          WHERE id = ?
        `,
        new Date().toISOString(),
        update.status,
        update.stripeCustomerId,
        update.currentPeriodStart?.toISOString() ?? null,
        update.currentPeriodEnd?.toISOString() ?? null,
        update.trialEndsAt?.toISOString() ?? null,
        update.cancelAtPeriodEnd,
        update.canceledAt?.toISOString() ?? null,
        JSON.stringify(update.metadata),
        subscription.id,
      );
    },
  };
}

export async function createSmrtUsageAuditStore(
  db?: WorkerDatabase,
): Promise<TenantUsageAuditStore> {
  ensureWorkerTenancy();
  const database = db ?? (await getWorkerDatabase());

  return {
    async listTenantIdsWithSubscriptions(limit) {
      const result = await database.query(
        `
          SELECT DISTINCT tenant_id
          FROM _smrt_tenant_subscriptions
          WHERE subscriber_kind = 'tenant'
            AND subscriber_external_id = ''
            AND status IN ('active', 'trialing', 'past_due')
          ORDER BY tenant_id ASC
          LIMIT ?
        `,
        limit,
      );

      return result.rows.map((row) => readString(readRecord(row)?.tenant_id)).filter(isPresent);
    },
  };
}

export async function createSmrtSubscriptionResolver(): Promise<TenantUsageAuditResolver> {
  ensureWorkerTenancy();
  const config = getWorkerSmrtConfig();
  const plans = await SubscriptionPlanCollection.create(config);
  const subscriptions = await TenantSubscriptionCollection.create(config);
  const usageMetrics = await TenantUsageMetricCollection.create(config);

  return new SubscriptionResolver({
    plans: {
      get: (criteria) => withSystemContext(() => plans.get(criteria)),
    },
    subscriptions,
    usage: {
      summarize: (options) => summarizeWorkerUsage(usageMetrics, options),
    },
  });
}

export function parseWorkerJob(value: string | undefined): WorkerCycleJob {
  if (value === "subscriptions.reconcile" || value === "usage.audit" || value === "all") {
    return value;
  }

  return "all";
}

function toReconciledSubscriptionUpdate(
  subscription: ReconcileSubscriptionRecord,
  status: StripeSubscriptionStatusSummary,
): ReconciledSubscriptionUpdate {
  const metadata = {
    ...subscription.metadata,
    stripe: {
      ...readRecord(subscription.metadata.stripe),
      lastReconciledAt: new Date().toISOString(),
      lastReconciledStatus: status.status,
    },
  };

  return {
    status: mapStripeSubscriptionStatus(status.status),
    stripeCustomerId: status.customerExternalId || subscription.stripeCustomerId,
    currentPeriodStart: status.currentPeriodStart ?? subscription.currentPeriodStart,
    currentPeriodEnd: status.currentPeriodEnd ?? subscription.currentPeriodEnd,
    trialEndsAt: status.trialEnd ?? subscription.trialEndsAt,
    cancelAtPeriodEnd: status.cancelAtPeriodEnd,
    canceledAt:
      status.canceledAt ??
      (status.status === "canceled" || status.status === "incomplete_expired"
        ? (subscription.canceledAt ?? new Date())
        : null),
    metadata,
  };
}

function hasSubscriptionChanges(
  subscription: ReconcileSubscriptionRecord,
  update: ReconciledSubscriptionUpdate,
): boolean {
  return (
    subscription.status !== update.status ||
    subscription.stripeCustomerId !== update.stripeCustomerId ||
    dateKey(subscription.currentPeriodStart) !== dateKey(update.currentPeriodStart) ||
    dateKey(subscription.currentPeriodEnd) !== dateKey(update.currentPeriodEnd) ||
    dateKey(subscription.trialEndsAt) !== dateKey(update.trialEndsAt) ||
    subscription.cancelAtPeriodEnd !== update.cancelAtPeriodEnd ||
    dateKey(subscription.canceledAt) !== dateKey(update.canceledAt)
  );
}

async function summarizeWorkerUsage(
  usageMetrics: TenantUsageMetricCollection,
  options: {
    tenantId: string;
    metricKey: string;
    window: UsageWindow;
  },
): Promise<UsageSummary> {
  const usage = await usageMetrics.summarizeUsage(options);
  if (!options.metricKey.startsWith("ai.")) {
    return usage;
  }

  const aiUsage = await safeSummarizeTenantAiUsage(usageMetrics, options.tenantId, options.window);
  if (!aiUsage) {
    return usage;
  }

  return {
    ...usage,
    quantity: usage.quantity + readAiMetricQuantity(options.metricKey, aiUsage),
  };
}

async function safeSummarizeTenantAiUsage(
  usageMetrics: TenantUsageMetricCollection,
  tenantId: string,
  window: UsageWindow,
) {
  try {
    return await usageMetrics.summarizeTenantAiUsage({ tenantId, window });
  } catch (error) {
    if (isMissingAiUsageTableError(error)) {
      return null;
    }
    throw error;
  }
}

function readAiMetricQuantity(
  metricKey: string,
  summary: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCost: number;
    requestCount: number;
  },
) {
  const quantities: Record<string, number> = {
    "ai.tokens.prompt": summary.promptTokens,
    "ai.tokens.completion": summary.completionTokens,
    "ai.tokens.total": summary.totalTokens,
    "ai.cost.estimated": summary.estimatedCost,
    "ai.requests": summary.requestCount,
  };
  return quantities[metricKey] ?? 0;
}

function mapStripeSubscriptionStatus(status: StripeSubscriptionStatusSummary["status"]) {
  switch (status) {
    case "active":
    case "canceled":
    case "incomplete":
    case "past_due":
    case "trialing":
    case "unpaid":
      return status;
    case "incomplete_expired":
      return "canceled";
    case "paused":
      return "past_due";
  }
}

function rowToReconcileSubscriptionRecord(row: unknown): ReconcileSubscriptionRecord | null {
  const record = readRecord(row);
  const id = readString(record?.id);
  const tenantId = readString(record?.tenant_id);
  const stripeSubscriptionId = readString(record?.stripe_subscription_id);

  if (!id || !tenantId || !stripeSubscriptionId) {
    return null;
  }

  return {
    id,
    tenantId,
    status: mapSubscriptionStatus(readString(record?.status)),
    stripeCustomerId: readString(record?.stripe_customer_id) ?? "",
    stripeSubscriptionId,
    currentPeriodStart: readDate(record?.current_period_start),
    currentPeriodEnd: readDate(record?.current_period_end),
    trialEndsAt: readDate(record?.trial_ends_at),
    cancelAtPeriodEnd: record?.cancel_at_period_end === true,
    canceledAt: readDate(record?.canceled_at),
    metadata: readJsonObject(record?.metadata),
  };
}

function mapSubscriptionStatus(value: string | undefined): SubscriptionStatus {
  switch (value) {
    case "active":
    case "canceled":
    case "incomplete":
    case "past_due":
    case "trialing":
    case "unpaid":
      return value;
    default:
      return "incomplete";
  }
}

function dateKey(value: Date | null): string {
  return value?.toISOString() ?? "";
}

function readDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  return null;
}

function readJsonObject(value: unknown): Record<string, unknown> {
  const record = readRecord(value);
  if (record) {
    return record;
  }

  if (typeof value !== "string" || !value.trim()) {
    return {};
  }

  try {
    return readRecord(JSON.parse(value)) ?? {};
  } catch {
    return {};
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function isMissingAiUsageTableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as Error & { code?: string }).code;
  return (
    code === "42P01" ||
    error.message.includes('relation "_smrt_ai_usage" does not exist') ||
    error.message.includes("no such table: _smrt_ai_usage")
  );
}
