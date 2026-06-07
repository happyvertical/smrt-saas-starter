import {
  type CheckoutSessionRequest,
  type CustomerPortalRequest,
  createSdkStripeBillingProvider,
  requireStripeBillingProvider,
  type StripeBillingProvider,
} from "@happyvertical/smrt-saas-objects";

let provider: StripeBillingProvider | null = null;
let providerPromise: Promise<StripeBillingProvider | null> | null = null;

export function setStripeBillingProvider(nextProvider: StripeBillingProvider | null): void {
  provider = nextProvider;
  providerPromise = null;
}

export async function createCheckoutSession(request: CheckoutSessionRequest) {
  return await (await getStripeBillingProvider()).createCheckoutSession(request);
}

export async function createCustomerPortalSession(request: CustomerPortalRequest) {
  return await (await getStripeBillingProvider()).createCustomerPortalSession(request);
}

export async function verifyBillingWebhook(payload: string, signature: string) {
  return await (await getStripeBillingProvider()).verifyWebhook(payload, signature);
}

async function getStripeBillingProvider(): Promise<StripeBillingProvider> {
  if (provider) {
    return provider;
  }

  providerPromise ??= createProviderFromEnvironment();
  provider = await providerPromise;

  return requireStripeBillingProvider(provider);
}

async function createProviderFromEnvironment(): Promise<StripeBillingProvider | null> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return null;
  }

  return createSdkStripeBillingProvider({
    secretKey,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    webhookTolerance: readWebhookTolerance(),
  });
}

function readWebhookTolerance(): number | undefined {
  const value = process.env.STRIPE_WEBHOOK_TOLERANCE;
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}
