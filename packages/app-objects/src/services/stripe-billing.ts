export interface CheckoutSessionRequest {
  tenantId: string;
  planId: string;
  stripePriceId: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
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
  verifyWebhook(payload: string, signature: string): Promise<StripeWebhookEvent>;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export function requireStripeBillingProvider(
  provider: StripeBillingProvider | null | undefined,
): StripeBillingProvider {
  if (!provider) {
    throw new Error(
      "Stripe billing provider is not configured. Complete SDK @happyvertical/accounting Stripe support or inject an app adapter.",
    );
  }

  return provider;
}
