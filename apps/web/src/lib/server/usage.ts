import type { UsageMetricRecord, UsageSummary } from "@happyvertical/smrt-subscriptions";

const demoUsage: UsageMetricRecord[] = [
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

export function getUsageSummaries(tenantId = "demo"): UsageSummary[] {
  const summaries = new Map<string, UsageSummary>();

  for (const record of demoUsage.filter((event) => event.tenantId === tenantId)) {
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
