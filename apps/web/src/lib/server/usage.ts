import { createLogger, type LogLevel } from "@happyvertical/logger";
import {
  getWindowForThreshold,
  type RecordUsageOptions,
  type ThresholdWindow,
  type UsageMetricRecord,
  type UsageSummary,
} from "@happyvertical/smrt-subscriptions";

const logger = createLogger(process.env.NODE_ENV === "test" ? false : { level: resolveLogLevel() });

const seedUsage: UsageMetricRecord[] = [
  {
    tenantId: "demo",
    metricKey: "ai.tokens.total",
    quantity: 18_000,
    windowStart: new Date("2026-06-01T00:00:00.000Z"),
    windowEnd: new Date("2026-07-01T00:00:00.000Z"),
    source: "smrt-ai-usage",
  },
  {
    tenantId: "demo",
    metricKey: "ai.tokens.total",
    quantity: 24_500,
    windowStart: new Date("2026-06-01T00:00:00.000Z"),
    windowEnd: new Date("2026-07-01T00:00:00.000Z"),
    source: "smrt-ai-usage",
  },
  {
    tenantId: "demo",
    metricKey: "mcp.calls",
    quantity: 128,
    windowStart: new Date("2026-06-01T00:00:00.000Z"),
    windowEnd: new Date("2026-07-01T00:00:00.000Z"),
    source: "smrt-app-mcp",
  },
];

const usageRecords = seedUsage.map(cloneUsageRecord);

export function getUsageSummaries(tenantId = "demo"): UsageSummary[] {
  const summaries = new Map<string, UsageSummary>();

  for (const record of usageRecords.filter((event) => event.tenantId === tenantId)) {
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

export function recordUsageMetric(options: RecordUsageOptions): UsageMetricRecord {
  const record = cloneUsageRecord(options);
  usageRecords.push(record);

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

  return record;
}

export function getUsageWindow(thresholdWindow: ThresholdWindow = "month", now = new Date()) {
  return getWindowForThreshold(thresholdWindow, now);
}

export function resetUsageMetricsForTest(records: UsageMetricRecord[] = seedUsage): void {
  usageRecords.splice(0, usageRecords.length, ...records.map(cloneUsageRecord));
}

function cloneUsageRecord(record: UsageMetricRecord): UsageMetricRecord {
  return {
    ...record,
    windowStart: new Date(record.windowStart),
    windowEnd: new Date(record.windowEnd),
    dimensions: record.dimensions ? { ...record.dimensions } : undefined,
  };
}

function resolveLogLevel(): LogLevel {
  const level = process.env.LOG_LEVEL;
  return level === "debug" || level === "warn" || level === "error" ? level : "info";
}
