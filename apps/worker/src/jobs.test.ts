import { describe, expect, it } from "vitest";
import { rollupUsage } from "./jobs.js";

describe("worker jobs", () => {
  it("rolls up tenant usage events", async () => {
    await expect(
      rollupUsage([
        {
          tenantId: "demo",
          metricKey: "ai.tokens.total",
          quantity: 100,
          windowStart: new Date("2026-06-01T00:00:00.000Z"),
          windowEnd: new Date("2026-07-01T00:00:00.000Z"),
        },
      ]),
    ).resolves.toEqual({
      job: "usage.rollup",
      processed: 1,
    });
  });
});
