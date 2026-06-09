import type {
  ThresholdEnforcement,
  ThresholdEvaluation,
  ThresholdWindow,
} from "@happyvertical/smrt-subscriptions";
import { describe, expect, it } from "vitest";
import {
  assertMetricAllowed,
  findThresholdEvaluation,
  findThresholdEvaluations,
  getContainedThresholdUsageWindow,
  TenantQuotaError,
} from "$lib/server/thresholds";

const tenantId = "11111111-1111-4111-8111-111111111111";

describe("tenant threshold guards", () => {
  it("finds metric evaluations by key", () => {
    const evaluation = makeEvaluation("chat.messages", "warn", true);

    expect(findThresholdEvaluation([evaluation], "chat.messages")).toBe(evaluation);
    expect(findThresholdEvaluations([evaluation], "chat.messages")).toEqual([evaluation]);
    expect(findThresholdEvaluation([evaluation], "mcp.calls")).toBeNull();
    expect(findThresholdEvaluations([evaluation], "mcp.calls")).toEqual([]);
  });

  it("allows observe and warn threshold states when the resolver marks them allowed", () => {
    const observed = makeEvaluation("ai.tokens.total", "observe", true, "ok");
    const warned = makeEvaluation("mcp.calls", "warn", true, "warn");

    expect(assertMetricAllowed([observed, warned], "ai.tokens.total")).toEqual([observed]);
    expect(assertMetricAllowed([observed, warned], "mcp.calls")).toEqual([warned]);
  });

  it("checks every matching metric threshold before allowing an action", () => {
    const daily = makeEvaluation("mcp.calls", "warn", true, "warn");
    const monthly = makeEvaluation("mcp.calls", "block", false, "blocked");

    expect(() => assertMetricAllowed([daily, monthly], "mcp.calls")).toThrow(TenantQuotaError);
  });

  it("uses the contained matching threshold window for usage recording", () => {
    const month = makeEvaluation("mcp.calls", "warn", true, "warn", {
      windowStart: new Date("2026-06-01T00:00:00.000Z"),
      windowEnd: new Date("2026-07-01T00:00:00.000Z"),
    });
    const duplicateMonth = makeEvaluation("mcp.calls", "observe", true, "ok", {
      windowStart: new Date("2026-06-01T00:00:00.000Z"),
      windowEnd: new Date("2026-07-01T00:00:00.000Z"),
    });
    const day = makeEvaluation("mcp.calls", "block", true, "ok", {
      windowStart: new Date("2026-06-08T00:00:00.000Z"),
      windowEnd: new Date("2026-06-09T00:00:00.000Z"),
    });

    const allowed = assertMetricAllowed([month, duplicateMonth, day], "mcp.calls");

    expect(allowed).toEqual([month, duplicateMonth, day]);
    expect(getContainedThresholdUsageWindow(allowed)).toEqual({
      start: new Date("2026-06-08T00:00:00.000Z"),
      end: new Date("2026-06-09T00:00:00.000Z"),
    });
  });

  it("intersects mixed threshold windows before recording usage", () => {
    const month = makeEvaluation("mcp.calls", "block", true, "ok", {
      thresholdWindow: "month",
      windowStart: new Date("2026-06-01T00:00:00.000Z"),
      windowEnd: new Date("2026-07-01T00:00:00.000Z"),
    });
    const week = makeEvaluation("mcp.calls", "block", true, "ok", {
      thresholdWindow: "week",
      windowStart: new Date("2026-06-29T00:00:00.000Z"),
      windowEnd: new Date("2026-07-06T00:00:00.000Z"),
    });

    const allowed = assertMetricAllowed([month, week], "mcp.calls");

    expect(getContainedThresholdUsageWindow(allowed)).toEqual({
      start: new Date("2026-06-29T00:00:00.000Z"),
      end: new Date("2026-07-01T00:00:00.000Z"),
    });
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
  window: {
    thresholdWindow?: ThresholdWindow;
    windowStart: Date;
    windowEnd: Date;
  } = {
    windowStart: new Date("2026-06-01T00:00:00.000Z"),
    windowEnd: new Date("2026-07-01T00:00:00.000Z"),
  },
): ThresholdEvaluation {
  return {
    threshold: {
      metricKey,
      limit: 100,
      window: window.thresholdWindow ?? "month",
      enforcement,
      label: metricKey === "chat.messages" ? "Chat messages" : readableMetricLabel(metricKey),
    },
    usage: {
      tenantId,
      metricKey,
      quantity: allowed ? 50 : 100,
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
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
