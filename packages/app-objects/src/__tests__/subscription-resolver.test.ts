import { describe, expect, it } from "vitest";
import {
  isFeatureEnabled,
  isThresholdBlocked,
  resolveEntitlements,
} from "../services/subscription-resolver.js";

describe("resolveEntitlements", () => {
  it("grants enabled features for active subscriptions", () => {
    const snapshot = resolveEntitlements({
      plan: {
        id: "plan-growth",
        slug: "growth",
        name: "Growth",
        features: [
          { key: "chat.agent", enabled: true },
          { key: "exports.bulk", enabled: false },
        ],
        thresholds: [],
      },
      subscription: {
        planId: "plan-growth",
        status: "active",
        currentPeriodEnd: "2099-01-01T00:00:00.000Z",
      },
      usage: [],
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(isFeatureEnabled(snapshot, "chat.agent")).toBe(true);
    expect(isFeatureEnabled(snapshot, "exports.bulk")).toBe(false);
  });

  it("blocks metrics that exceed block thresholds", () => {
    const snapshot = resolveEntitlements({
      plan: {
        id: "plan-starter",
        slug: "starter",
        name: "Starter",
        features: [],
        thresholds: [{ metricKey: "ai.tokens", limit: 100, window: "month", action: "block" }],
      },
      subscription: {
        planId: "plan-starter",
        status: "active",
      },
      usage: [{ metricKey: "ai.tokens", value: 125, window: "month" }],
    });

    expect(isThresholdBlocked(snapshot, "ai.tokens")).toBe(true);
    expect(snapshot.thresholds[0]?.remaining).toBe(0);
  });

  it("does not grant features for inactive subscriptions", () => {
    const snapshot = resolveEntitlements({
      plan: {
        id: "plan-scale",
        slug: "scale",
        name: "Scale",
        features: [{ key: "mcp.write_tools", enabled: true }],
        thresholds: [],
      },
      subscription: {
        planId: "plan-scale",
        status: "past_due",
      },
      usage: [],
    });

    expect(isFeatureEnabled(snapshot, "mcp.write_tools")).toBe(false);
  });
});
