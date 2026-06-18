import type { StripeBillingProvider } from "@happyvertical/smrt-saas-objects";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const billingMocks = vi.hoisted(() => ({
  createSdkStripeBillingProvider: vi.fn(),
}));

vi.mock("@happyvertical/smrt-saas-objects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@happyvertical/smrt-saas-objects")>();
  return {
    ...actual,
    createSdkStripeBillingProvider: billingMocks.createSdkStripeBillingProvider,
  };
});

import { createCheckoutSession, setStripeBillingProvider } from "$lib/server/billing";

function makeProvider(label: string): StripeBillingProvider {
  return {
    createCheckoutSession: vi.fn(async () => ({
      id: `cs_${label}`,
      url: `https://stripe.test/${label}`,
    })),
    createCustomerPortalSession: vi.fn(async () => ({
      url: `https://stripe.test/portal/${label}`,
    })),
    verifyWebhook: vi.fn(async () => ({ id: `evt_${label}`, type: "test", data: {} })),
  } as unknown as StripeBillingProvider;
}

describe("server billing provider memoization", () => {
  beforeEach(() => {
    billingMocks.createSdkStripeBillingProvider.mockReset();
    // No env key by default: env-driven init resolves to null.
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    setStripeBillingProvider(null);
  });

  afterEach(() => {
    setStripeBillingProvider(null);
    vi.unstubAllEnvs();
  });

  it("does not clobber a provider injected while an env-driven init is in flight", async () => {
    // Request A starts env-driven init: no key -> in-flight promise resolves to null.
    const inflight = createCheckoutSession({ tenantId: "t1" } as never).catch((error) => error);

    // While A is awaiting, a provider is injected (test seam / reset path).
    const injected = makeProvider("injected");
    setStripeBillingProvider(injected);

    // Let A's in-flight env promise settle.
    await inflight;

    // A later call must still see the injected provider and must not throw.
    await expect(createCheckoutSession({ tenantId: "t2" } as never)).resolves.toMatchObject({
      id: "cs_injected",
    });
    expect(injected.createCheckoutSession).toHaveBeenCalled();
    // The env-driven SDK factory must never have been used to override the injection.
    expect(billingMocks.createSdkStripeBillingProvider).not.toHaveBeenCalled();
  });

  it("memoizes the env-driven provider on the normal single-flight path", async () => {
    const envProvider = makeProvider("env");
    billingMocks.createSdkStripeBillingProvider.mockResolvedValue(envProvider);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    setStripeBillingProvider(null);

    const [a, b] = await Promise.all([
      createCheckoutSession({ tenantId: "t1" } as never),
      createCheckoutSession({ tenantId: "t2" } as never),
    ]);

    expect(a).toMatchObject({ id: "cs_env" });
    expect(b).toMatchObject({ id: "cs_env" });
    // Single-flight: env factory invoked exactly once for both concurrent callers.
    expect(billingMocks.createSdkStripeBillingProvider).toHaveBeenCalledTimes(1);
  });
});
