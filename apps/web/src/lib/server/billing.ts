import {
  type CheckoutSessionRequest,
  type CustomerPortalRequest,
  requireStripeBillingProvider,
  type StripeBillingProvider,
} from "@happyvertical/smrt-saas-objects";

let provider: StripeBillingProvider | null = null;

export function setStripeBillingProvider(nextProvider: StripeBillingProvider): void {
  provider = nextProvider;
}

export async function createCheckoutSession(request: CheckoutSessionRequest) {
  return await requireStripeBillingProvider(provider).createCheckoutSession(request);
}

export async function createCustomerPortalSession(request: CustomerPortalRequest) {
  return await requireStripeBillingProvider(provider).createCustomerPortalSession(request);
}

export async function verifyBillingWebhook(payload: string, signature: string) {
  return await requireStripeBillingProvider(provider).verifyWebhook(payload, signature);
}
