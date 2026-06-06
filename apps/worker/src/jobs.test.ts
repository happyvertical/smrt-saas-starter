import { describe, expect, it } from "vitest";
import { rollupUsage } from "./jobs.js";

describe("worker jobs", () => {
  it("rolls up tenant usage events", async () => {
    await expect(
      rollupUsage([
        {
          tenantId: "demo",
          metricKey: "ai.tokens",
          value: 100,
          timestamp: "2026-06-06T00:00:00.000Z",
        },
      ]),
    ).resolves.toEqual({
      job: "usage.rollup",
      processed: 1,
    });
  });
});
