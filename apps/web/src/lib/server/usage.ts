import { summarizeUsage, type UsageEvent } from "@happyvertical/smrt-saas-objects";

const demoUsage: UsageEvent[] = [
  {
    tenantId: "demo",
    metricKey: "ai.tokens",
    value: 18_000,
    timestamp: "2026-06-01T12:00:00.000Z",
    source: "smrt-ai-usage",
  },
  {
    tenantId: "demo",
    metricKey: "ai.tokens",
    value: 24_500,
    timestamp: "2026-06-02T12:00:00.000Z",
    source: "smrt-ai-usage",
  },
  {
    tenantId: "demo",
    metricKey: "mcp.calls",
    value: 128,
    timestamp: "2026-06-02T13:00:00.000Z",
    source: "smrt-app-mcp",
  },
];

export function getUsageSummaries(tenantId = "demo") {
  return summarizeUsage(
    demoUsage.filter((event) => event.tenantId === tenantId),
    "month",
  );
}
