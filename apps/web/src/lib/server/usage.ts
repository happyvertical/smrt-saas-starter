import { createLogger, type LogLevel } from "@happyvertical/logger";
import {
  getWindowForThreshold,
  type RecordUsageOptions,
  TenantUsageMetricCollection,
  type ThresholdWindow,
  type UsageMetricRecord,
  type UsageSummary,
} from "@happyvertical/smrt-subscriptions";
import { getAppDatabase } from "$lib/server/db";
import { getSmrtConfig } from "$lib/server/smrt";
import { DEMO_TENANT_ID, getCurrentMonthWindow } from "$lib/server/starter-data";
import { withActiveTenant } from "$lib/server/tenant-context";

const logger = createLogger(process.env.NODE_ENV === "test" ? false : { level: resolveLogLevel() });

export async function getUsageSummaries(tenantId?: string | null): Promise<UsageSummary[]> {
  return await withActiveTenant(tenantId, async (activeTenantId) => {
    const db = await getAppDatabase();
    const result = await db.query(
      `
        SELECT
          tenant_id,
          metric_key,
          SUM(quantity)::float AS quantity,
          window_start,
          window_end
        FROM _smrt_tenant_usage_metrics
        WHERE tenant_id = ?
        GROUP BY tenant_id, metric_key, window_start, window_end
        ORDER BY window_start DESC, metric_key ASC
      `,
      activeTenantId,
    );
    const persisted = result.rows.map((row) => ({
      tenantId: String(row.tenant_id),
      metricKey: String(row.metric_key),
      quantity: numberFromRow(row.quantity),
      windowStart: dateFromRow(row.window_start),
      windowEnd: dateFromRow(row.window_end),
    }));
    const aiUsage = await getAiUsageSummaries(activeTenantId);

    return mergeUsageSummaries([...persisted, ...aiUsage]);
  });
}

export function summarizeUsageRecords(
  records: UsageMetricRecord[],
  tenantId = DEMO_TENANT_ID,
): UsageSummary[] {
  const summaries = new Map<string, UsageSummary>();

  for (const record of records.filter((event) => event.tenantId === tenantId)) {
    const key = [
      record.tenantId,
      record.metricKey,
      record.windowStart.toISOString(),
      record.windowEnd.toISOString(),
    ].join(":");
    const existing = summaries.get(key);

    if (existing) {
      existing.quantity += record.quantity;
      continue;
    }

    summaries.set(key, {
      tenantId: record.tenantId,
      metricKey: record.metricKey,
      quantity: record.quantity,
      windowStart: record.windowStart,
      windowEnd: record.windowEnd,
    });
  }

  return [...summaries.values()];
}

export async function recordUsageMetric(options: RecordUsageOptions): Promise<UsageMetricRecord> {
  return await withActiveTenant(options.tenantId, async (activeTenantId) => {
    const usageMetrics = await TenantUsageMetricCollection.create(
      getSmrtConfig("TenantUsageMetric"),
    );
    const record = await usageMetrics.recordUsage({
      ...options,
      tenantId: activeTenantId,
    });

    logger.info("Tenant usage metric recorded", {
      tenantId: record.tenantId,
      metricKey: record.metricKey,
      quantity: record.quantity,
      source: record.source,
      sourceId: record.sourceId,
      windowStart: record.windowStart.toISOString(),
      windowEnd: record.windowEnd.toISOString(),
      dimensions: record.dimensions,
    });

    return {
      tenantId: record.tenantId ?? activeTenantId,
      metricKey: record.metricKey,
      quantity: record.quantity,
      windowStart: record.windowStart,
      windowEnd: record.windowEnd,
      source: record.source,
      sourceId: record.sourceId,
      dimensions: record.getDimensions(),
    };
  });
}

export function getUsageWindow(thresholdWindow: ThresholdWindow = "month", now = new Date()) {
  return getWindowForThreshold(thresholdWindow, now);
}

export async function summarizeUsageMetric(options: {
  tenantId: string;
  metricKey: string;
  window: { start: Date; end: Date };
}): Promise<UsageSummary> {
  return await withActiveTenant(options.tenantId, async (activeTenantId) => {
    const usageMetrics = await TenantUsageMetricCollection.create(
      getSmrtConfig("TenantUsageMetric"),
    );
    const tenantUsage = await usageMetrics.summarizeUsage({
      ...options,
      tenantId: activeTenantId,
    });
    if (!options.metricKey.startsWith("ai.")) {
      return tenantUsage;
    }

    const aiSummary = await safeSummarizeTenantAiUsage(activeTenantId, options.window);
    if (!aiSummary) {
      return tenantUsage;
    }

    return {
      ...tenantUsage,
      quantity: tenantUsage.quantity + readAiMetricQuantity(options.metricKey, aiSummary),
    };
  });
}

async function getAiUsageSummaries(tenantId: string): Promise<UsageSummary[]> {
  const window = getCurrentMonthWindow();
  const aiSummary = await safeSummarizeTenantAiUsage(tenantId, window);
  if (!aiSummary) {
    return [];
  }

  return [
    usageSummaryFromQuantity(tenantId, "ai.tokens.prompt", aiSummary.promptTokens, window),
    usageSummaryFromQuantity(tenantId, "ai.tokens.completion", aiSummary.completionTokens, window),
    usageSummaryFromQuantity(tenantId, "ai.tokens.total", aiSummary.totalTokens, window),
    usageSummaryFromQuantity(tenantId, "ai.cost.estimated", aiSummary.estimatedCost, window),
    usageSummaryFromQuantity(tenantId, "ai.requests", aiSummary.requestCount, window),
  ].filter((summary) => summary.quantity > 0);
}

async function safeSummarizeTenantAiUsage(tenantId: string, window: { start: Date; end: Date }) {
  try {
    const usageMetrics = await TenantUsageMetricCollection.create(
      getSmrtConfig("TenantUsageMetric"),
    );
    return await usageMetrics.summarizeTenantAiUsage({ tenantId, window });
  } catch (error) {
    if (isMissingAiUsageTableError(error)) {
      return null;
    }
    throw error;
  }
}

function usageSummaryFromQuantity(
  tenantId: string,
  metricKey: string,
  quantity: number,
  window: { start: Date; end: Date },
): UsageSummary {
  return {
    tenantId,
    metricKey,
    quantity,
    windowStart: window.start,
    windowEnd: window.end,
  };
}

function mergeUsageSummaries(summaries: UsageSummary[]): UsageSummary[] {
  const records = summaries.map((summary) => ({
    tenantId: summary.tenantId,
    metricKey: summary.metricKey,
    quantity: summary.quantity,
    windowStart: summary.windowStart,
    windowEnd: summary.windowEnd,
  }));
  return summarizeUsageRecords(records);
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

function dateFromRow(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function numberFromRow(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string") {
    return Number.parseFloat(value) || 0;
  }
  return 0;
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

function resolveLogLevel(): LogLevel {
  const level = process.env.LOG_LEVEL;
  return level === "debug" || level === "warn" || level === "error" ? level : "info";
}
