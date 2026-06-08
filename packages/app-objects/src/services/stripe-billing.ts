import {
  type AccountingProvider,
  getAccountingProvider,
  type StripeAccountingProvider,
  type StripeOptions,
  type StripeSubscriptionStatusResult,
  type WebhookEvent,
} from "@happyvertical/accounting";

export interface CheckoutSessionRequest {
  tenantId: string;
  planId: string;
  stripePriceId: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  customerExternalId?: string;
}

export interface CheckoutSessionResult {
  id: string;
  url: string;
}

export interface CustomerPortalRequest {
  stripeCustomerId: string;
  returnUrl: string;
}

export interface CustomerPortalResult {
  url: string;
}

export interface StripeBillingProvider {
  createCheckoutSession(request: CheckoutSessionRequest): Promise<CheckoutSessionResult>;
  createCustomerPortalSession(request: CustomerPortalRequest): Promise<CustomerPortalResult>;
  retrieveSubscriptionStatus(stripeSubscriptionId: string): Promise<StripeSubscriptionStatusResult>;
  listCustomerSubscriptions(stripeCustomerId: string): Promise<StripeSubscriptionStatusResult[]>;
  verifyWebhook(payload: string, signature: string): Promise<StripeWebhookEvent>;
}

export type StripeSubscriptionStatusSummary = StripeSubscriptionStatusResult;

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface StripeBillingProviderOptions extends Omit<StripeOptions, "secretKey" | "type"> {
  secretKey: string;
}

export async function createSdkStripeBillingProvider(
  options: StripeBillingProviderOptions,
): Promise<StripeBillingProvider> {
  const provider = await getAccountingProvider({
    type: "stripe",
    ...options,
  });

  if (!isStripeAccountingProvider(provider)) {
    throw new Error("Configured accounting provider is not a Stripe billing provider.");
  }

  return createStripeBillingProvider(provider, {
    webhookSecret: options.webhookSecret,
  });
}

export function createStripeBillingProvider(
  provider: StripeAccountingProvider,
  options: Pick<StripeBillingProviderOptions, "webhookSecret"> = {},
): StripeBillingProvider {
  return {
    async createCheckoutSession(request) {
      const session = await provider.billing.createCheckoutSession({
        mode: "subscription",
        successUrl: request.successUrl,
        cancelUrl: request.cancelUrl,
        customerEmail: request.customerEmail,
        customerExternalId: request.customerExternalId,
        clientReferenceId: request.tenantId,
        lineItems: [{ price: request.stripePriceId, quantity: 1 }],
        metadata: {
          tenantId: request.tenantId,
          planId: request.planId,
        },
      });

      return {
        id: session.externalId,
        url: session.url ?? "",
      };
    },

    async createCustomerPortalSession(request) {
      const session = await provider.billing.createCustomerPortalSession({
        customerExternalId: request.stripeCustomerId,
        returnUrl: request.returnUrl,
      });

      return {
        url: session.url,
      };
    },

    async retrieveSubscriptionStatus(stripeSubscriptionId) {
      return await provider.billing.retrieveSubscriptionStatus(stripeSubscriptionId);
    },

    async listCustomerSubscriptions(stripeCustomerId) {
      return await provider.billing.listCustomerSubscriptions(stripeCustomerId);
    },

    async verifyWebhook(payload, signature) {
      if (!options.webhookSecret) {
        throw new Error("Stripe webhook secret is not configured.");
      }

      const verified = provider.webhooks.verify(payload, signature, options.webhookSecret);
      if (!verified) {
        throw new Error("Stripe webhook signature verification failed.");
      }

      const event = provider.webhooks.parse(payload);

      return {
        id: readWebhookEventId(payload) ?? event.resourceId ?? "",
        type: event.type,
        data: serializeWebhookEvent(event),
      };
    },
  };
}

export function requireStripeBillingProvider(
  provider: StripeBillingProvider | null | undefined,
): StripeBillingProvider {
  if (!provider) {
    throw new Error("Stripe billing provider is not configured.");
  }

  return provider;
}

function isStripeAccountingProvider(
  provider: AccountingProvider,
): provider is StripeAccountingProvider {
  return provider.type === "stripe" && "billing" in provider;
}

function readWebhookEventId(payload: string): string | null {
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (isRecord(parsed) && typeof parsed.id === "string") {
      return parsed.id;
    }
  } catch {
    return null;
  }

  return null;
}

function serializeWebhookEvent(event: WebhookEvent): Record<string, unknown> {
  return {
    provider: event.provider,
    timestamp: event.timestamp.toISOString(),
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    payload: event.payload,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
