import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  isStripeBillingConfigured: vi.fn(),
  getStripeCustomerId: vi.fn(),
  createCustomerPortalSession: vi.fn(),
}));

vi.mock("$lib/server/authz", () => ({
  requirePermission: mocks.requirePermission,
  starterPermissions: { billingManage: "tenant.billing.manage" },
}));
vi.mock("$lib/server/billing", () => ({
  isStripeBillingConfigured: mocks.isStripeBillingConfigured,
  createCustomerPortalSession: mocks.createCustomerPortalSession,
}));
vi.mock("$lib/server/subscriptions", () => ({ getStripeCustomerId: mocks.getStripeCustomerId }));

import { GET } from "./+server";

describe("/api/billing/portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ tenantId: "tenant-a" });
    mocks.isStripeBillingConfigured.mockReturnValue(true);
    mocks.getStripeCustomerId.mockResolvedValue("cus_fixture");
    mocks.createCustomerPortalSession.mockResolvedValue({
      url: "https://billing.example.test/portal",
    });
  });

  it("returns a prepared provider continuation only after billing authorization", async () => {
    const response = await GET(event("http://localhost/api/billing/portal?format=json"));

    await expect(response.json()).resolves.toEqual({
      portalUrl: "https://billing.example.test/portal",
      continuationRequired: true,
    });
    expect(mocks.getStripeCustomerId).toHaveBeenCalledWith("tenant-a");
    expect(mocks.createCustomerPortalSession).toHaveBeenCalledWith(
      expect.objectContaining({ stripeCustomerId: "cus_fixture" }),
    );
  });

  it("does not create a provider session when tenant authorization is denied", async () => {
    mocks.requirePermission.mockRejectedValue({ status: 403 });

    await expect(
      GET(event("http://localhost/api/billing/portal?format=json")),
    ).rejects.toMatchObject({
      status: 403,
    });
    expect(mocks.getStripeCustomerId).not.toHaveBeenCalled();
    expect(mocks.createCustomerPortalSession).not.toHaveBeenCalled();
  });
});

function event(url: string) {
  return { locals: {}, url: new URL(url) } as Parameters<typeof GET>[0];
}
