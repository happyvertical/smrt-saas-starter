import type { ThresholdEnforcement, ThresholdEvaluation } from "@happyvertical/smrt-subscriptions";
import { describe, expect, it } from "vitest";
import {
  assertMetricAllowed,
  findThresholdEvaluation,
  TenantQuotaError,
} from "$lib/server/thresholds";

const tenantId = "11111111-1111-4111-8111-111111111111";

describe("tenant threshold guards", () => {
  it("finds metric evaluations by key", () => {
    const evaluation = makeEvaluation("chat.messages", "warn", true);

    expect(findThresholdEvaluation([evaluation], "chat.messages")).toBe(evaluation);
    expect(findThresholdEvaluation([evaluation], "mcp.calls")).toBeNull();
  });

  it("allows observe and warn threshold states when the resolver marks them allowed", () => {
    const observed = makeEvaluation("ai.tokens.total", "observe", true, "ok");
    const warned = makeEvaluation("mcp.calls", "warn", true, "warn");

    expect(assertMetricAllowed([observed, warned], "ai.tokens.total")).toBe(observed);
    expect(assertMetricAllowed([observed, warned], "mcp.calls")).toBe(warned);
  });

  it("throws a tenant quota error when a block threshold denies the action", () => {
    const blocked = makeEvaluation("chat.messages", "block", false, "blocked");

    expect(() => assertMetricAllowed([blocked], "chat.messages")).toThrow(TenantQuotaError);

    try {
      assertMetricAllowed([blocked], "chat.messages");
    } catch (error) {
      expect(error).toMatchObject({
        status: 429,
        metricKey: "chat.messages",
      });
      expect(error).toHaveProperty("message", "Tenant exceeded the Chat messages threshold");
    }
  });
});

function makeEvaluation(
  metricKey: string,
  enforcement: ThresholdEnforcement,
  allowed: boolean,
  state: ThresholdEvaluation["state"] = allowed ? "ok" : "blocked",
): ThresholdEvaluation {
  return {
    threshold: {
      metricKey,
      limit: 100,
      window: "month",
      enforcement,
      label: metricKey === "chat.messages" ? "Chat messages" : readableMetricLabel(metricKey),
    },
    usage: {
      tenantId,
      metricKey,
      quantity: allowed ? 50 : 100,
      windowStart: new Date("2026-06-01T00:00:00.000Z"),
      windowEnd: new Date("2026-07-01T00:00:00.000Z"),
    },
    ratio: allowed ? 0.5 : 1,
    state,
    allowed,
    remaining: allowed ? 50 : 0,
  };
}

function readableMetricLabel(metricKey: string): string {
  return metricKey
    .split(/[._-]+/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
