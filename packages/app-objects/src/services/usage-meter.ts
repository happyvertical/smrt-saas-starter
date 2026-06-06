export interface UsageEvent {
  tenantId: string;
  metricKey: string;
  value: number;
  timestamp: Date | string;
  source?: string;
  sourceId?: string;
  tags?: Record<string, string>;
}

export interface UsageSummary {
  tenantId: string;
  metricKey: string;
  window: "day" | "month";
  windowStart: string;
  value: number;
}

export function summarizeUsage(events: UsageEvent[], window: "day" | "month"): UsageSummary[] {
  const buckets = new Map<string, UsageSummary>();

  for (const event of events) {
    const windowStart = getWindowStart(event.timestamp, window);
    const key = `${event.tenantId}:${event.metricKey}:${window}:${windowStart}`;
    const existing =
      buckets.get(key) ??
      ({
        tenantId: event.tenantId,
        metricKey: event.metricKey,
        window,
        windowStart,
        value: 0,
      } satisfies UsageSummary);

    existing.value += event.value;
    buckets.set(key, existing);
  }

  return [...buckets.values()].sort((a, b) =>
    `${a.tenantId}:${a.metricKey}:${a.windowStart}`.localeCompare(
      `${b.tenantId}:${b.metricKey}:${b.windowStart}`,
    ),
  );
}

export function normalizeMetricKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getWindowStart(timestamp: Date | string, window: "day" | "month"): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid usage timestamp: ${String(timestamp)}`);
  }

  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");

  return window === "month" ? `${year}-${month}-01` : `${year}-${month}-${day}`;
}
