import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  isStripeBillingConfigured: vi.fn(),
  getStripeCustomerId: vi.fn(),
  getStripePriceId: vi.fn(),
  createCheckoutSession: vi.fn(),
}));

vi.mock("$lib/server/authz", () => ({
  requirePermission: mocks.requirePermission,
  starterPermissions: { billingManage: "tenant.billing.manage" },
}));
vi.mock("$lib/server/billing", () => ({
  isStripeBillingConfigured: mocks.isStripeBillingConfigured,
  createCheckoutSession: mocks.createCheckoutSession,
}));
vi.mock("$lib/server/subscriptions", () => ({
  getStripeCustomerId: mocks.getStripeCustomerId,
  getStripePriceId: mocks.getStripePriceId,
}));

import { GET } from "./+server";

describe("/api/billing/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({
      tenantId: "tenant-a",
      userEmail: "owner@example.test",
    });
    mocks.isStripeBillingConfigured.mockReturnValue(true);
    mocks.getStripePriceId.mockResolvedValue("price_growth");
    mocks.getStripeCustomerId.mockResolvedValue("cus_fixture");
    mocks.createCheckoutSession.mockResolvedValue({ url: "https://billing.example.test/checkout" });
  });

  it("returns a prepared checkout continuation only after billing authorization", async () => {
    const response = await GET(
      event("http://localhost/api/billing/checkout?format=json&planId=growth"),
    );

    await expect(response.json()).resolves.toEqual({
      checkoutUrl: "https://billing.example.test/checkout",
      continuationRequired: true,
    });
    expect(mocks.getStripePriceId).toHaveBeenCalledWith("growth");
    expect(mocks.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-a",
        planId: "growth",
        stripePriceId: "price_growth",
      }),
    );
  });

  it("does not create a provider session when tenant authorization is denied", async () => {
    mocks.requirePermission.mockRejectedValue({ status: 403 });

    await expect(
      GET(event("http://localhost/api/billing/checkout?format=json&planId=growth")),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.getStripePriceId).not.toHaveBeenCalled();
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });
});

function event(url: string) {
  return { locals: {}, url: new URL(url) } as Parameters<typeof GET>[0];
}
