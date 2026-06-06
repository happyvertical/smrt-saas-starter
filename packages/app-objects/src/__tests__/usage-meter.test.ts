import { describe, expect, it } from "vitest";
import { normalizeMetricKey, summarizeUsage } from "../services/usage-meter.js";

describe("usage meter", () => {
  it("summarizes usage by tenant, metric, and month", () => {
    const summary = summarizeUsage(
      [
        {
          tenantId: "tenant-a",
          metricKey: "ai.tokens",
          value: 10,
          timestamp: "2026-06-01T10:00:00.000Z",
        },
        {
          tenantId: "tenant-a",
          metricKey: "ai.tokens",
          value: 15,
          timestamp: "2026-06-02T10:00:00.000Z",
        },
      ],
      "month",
    );

    expect(summary).toEqual([
      {
        tenantId: "tenant-a",
        metricKey: "ai.tokens",
        window: "month",
        windowStart: "2026-06-01",
        value: 25,
      },
    ]);
  });

  it("normalizes metric keys", () => {
    expect(normalizeMetricKey(" AI Tokens / Month ")).toBe("ai_tokens_month");
  });
});
