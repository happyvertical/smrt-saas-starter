import type {
  StripeAccountingProvider,
  StripeCheckoutSessionInput,
  StripeCustomerPortalSessionInput,
  WebhookEvent,
} from "@happyvertical/accounting";
import { describe, expect, it, vi } from "vitest";
import { createStripeBillingProvider } from "../services/stripe-billing.js";

describe("createStripeBillingProvider", () => {
  it("creates subscription checkout sessions through the SDK provider", async () => {
    const checkoutInputs: StripeCheckoutSessionInput[] = [];
    const provider = fakeStripeProvider({
      billing: {
        createCheckoutSession: async (input) => {
          checkoutInputs.push(input);
          return {
            externalId: "cs_test",
            url: "https://checkout.stripe.test/session",
          };
        },
      },
    });

    const billing = createStripeBillingProvider(provider);
    await expect(
      billing.createCheckoutSession({
        tenantId: "tenant-1",
        planId: "plan-growth",
        stripePriceId: "price_growth",
        customerEmail: "owner@example.com",
        successUrl: "https://starter.test/success",
        cancelUrl: "https://starter.test/cancel",
        customerExternalId: "cus_existing",
      }),
    ).resolves.toEqual({
      id: "cs_test",
      url: "https://checkout.stripe.test/session",
    });

    const checkoutInput = checkoutInputs.at(0);
    expect(checkoutInput).toBeDefined();
    expect(checkoutInput).toMatchObject({
      mode: "subscription",
      successUrl: "https://starter.test/success",
      cancelUrl: "https://starter.test/cancel",
      customerEmail: "owner@example.com",
      customerExternalId: "cus_existing",
      clientReferenceId: "tenant-1",
      metadata: {
        tenantId: "tenant-1",
        planId: "plan-growth",
      },
    });
    expect(checkoutInput?.lineItems).toEqual([{ price: "price_growth", quantity: 1 }]);
  });

  it("creates customer portal sessions through the SDK provider", async () => {
    const portalInputs: StripeCustomerPortalSessionInput[] = [];
    const provider = fakeStripeProvider({
      billing: {
        createCustomerPortalSession: async (input) => {
          portalInputs.push(input);
          return {
            externalId: "bps_test",
            url: "https://billing.stripe.test/session",
          };
        },
      },
    });

    const billing = createStripeBillingProvider(provider);
    await expect(
      billing.createCustomerPortalSession({
        stripeCustomerId: "cus_test",
        returnUrl: "https://starter.test/app/billing",
      }),
    ).resolves.toEqual({
      url: "https://billing.stripe.test/session",
    });

    const portalInput = portalInputs.at(0);
    expect(portalInput).toBeDefined();
    expect(portalInput).toEqual({
      customerExternalId: "cus_test",
      returnUrl: "https://starter.test/app/billing",
    });
  });

  it("retrieves and lists Stripe subscription statuses through the SDK provider", async () => {
    const provider = fakeStripeProvider({
      billing: {
        retrieveSubscriptionStatus: async (externalId) => ({
          externalId,
          status: "active",
          customerExternalId: "cus_test",
          currentPeriodStart: new Date("2026-06-01T00:00:00.000Z"),
          currentPeriodEnd: new Date("2026-07-01T00:00:00.000Z"),
          cancelAtPeriodEnd: false,
        }),
        listCustomerSubscriptions: async (customerExternalId) => [
          {
            externalId: "sub_test",
            status: "trialing",
            customerExternalId,
            cancelAtPeriodEnd: false,
          },
        ],
      },
    });

    const billing = createStripeBillingProvider(provider);

    await expect(billing.retrieveSubscriptionStatus("sub_test")).resolves.toMatchObject({
      externalId: "sub_test",
      status: "active",
      customerExternalId: "cus_test",
    });
    await expect(billing.listCustomerSubscriptions("cus_test")).resolves.toEqual([
      {
        externalId: "sub_test",
        status: "trialing",
        customerExternalId: "cus_test",
        cancelAtPeriodEnd: false,
      },
    ]);
  });

  it("verifies and normalizes Stripe webhook events", async () => {
    const payload = JSON.stringify({
      id: "evt_test",
      type: "customer.updated",
      data: { object: { id: "cus_test" } },
    });
    const event: WebhookEvent = {
      type: "customer.updated",
      provider: "stripe",
      timestamp: new Date("2026-06-07T00:00:00.000Z"),
      payload: { object: { id: "cus_test" } },
      resourceType: "customer",
      resourceId: "cus_test",
    };
    const verify = vi.fn(() => true);
    const parse = vi.fn(() => event);
    const provider = fakeStripeProvider({
      webhooks: {
        verify,
        parse,
      },
    });

    const billing = createStripeBillingProvider(provider, {
      webhookSecret: "whsec_test",
    });

    await expect(billing.verifyWebhook(payload, "sig_test")).resolves.toEqual({
      id: "evt_test",
      type: "customer.updated",
      data: {
        provider: "stripe",
        timestamp: "2026-06-07T00:00:00.000Z",
        resourceType: "customer",
        resourceId: "cus_test",
        payload: { object: { id: "cus_test" } },
      },
    });
    expect(verify).toHaveBeenCalledWith(payload, "sig_test", "whsec_test");
    expect(parse).toHaveBeenCalledWith(payload);
  });

  it("rejects failed Stripe webhook verification", async () => {
    const provider = fakeStripeProvider({
      webhooks: {
        verify: vi.fn(() => false),
        parse: vi.fn(() => {
          throw new Error("parse should not be called");
        }),
      },
    });

    const billing = createStripeBillingProvider(provider, {
      webhookSecret: "whsec_test",
    });

    await expect(billing.verifyWebhook("{}", "sig_bad")).rejects.toThrow(
      "Stripe webhook signature verification failed",
    );
  });
});

function fakeStripeProvider(
  overrides: {
    billing?: Partial<StripeAccountingProvider["billing"]>;
    webhooks?: Partial<StripeAccountingProvider["webhooks"]>;
  } = {},
): StripeAccountingProvider {
  return {
    type: "stripe",
    billing: {
      async createCheckoutSession() {
        throw new Error("createCheckoutSession not implemented in fake provider");
      },
      async createCustomerPortalSession() {
        throw new Error("createCustomerPortalSession not implemented in fake provider");
      },
      async retrieveSubscriptionStatus() {
        throw new Error("retrieveSubscriptionStatus not implemented in fake provider");
      },
      async listCustomerSubscriptions() {
        throw new Error("listCustomerSubscriptions not implemented in fake provider");
      },
      ...overrides.billing,
    },
    webhooks: {
      verify() {
        throw new Error("verify not implemented in fake provider");
      },
      parse() {
        throw new Error("parse not implemented in fake provider");
      },
      ...overrides.webhooks,
    },
  } as unknown as StripeAccountingProvider;
}
