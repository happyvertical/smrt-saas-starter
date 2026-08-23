import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const oidcCallback = vi.fn(async () => new Response(null, { status: 303 }));
  const oidcLogin = vi.fn(async () => new Response(null, { status: 303 }));
  return {
    oidcCallback,
    oidcLogin,
    createOidcCallbackHandler: vi.fn(() => oidcCallback),
    createOidcLoginHandler: vi.fn(() => oidcLogin),
    getSmrtConfig: vi.fn(() => ({})),
    isHappyVerticalWebIdpEnabled: vi.fn(() => true),
    loadStarterConfig: vi.fn(async () => undefined),
  };
});

vi.mock("@happyvertical/smrt-users/sveltekit", () => ({
  createOidcCallbackHandler: mocks.createOidcCallbackHandler,
  createOidcLoginHandler: mocks.createOidcLoginHandler,
}));
vi.mock("$lib/server/smrt", () => ({ getSmrtConfig: mocks.getSmrtConfig }));
vi.mock("$lib/server/starter-config", () => ({ loadStarterConfig: mocks.loadStarterConfig }));
vi.mock("$lib/server/identity-providers", () => ({
  isHappyVerticalWebIdpEnabled: mocks.isHappyVerticalWebIdpEnabled,
}));

describe("production OIDC route bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.isHappyVerticalWebIdpEnabled.mockReturnValue(true);
  });

  it("loads starter config before constructing the login handler", async () => {
    await import("./[provider]/login/+server");

    expect(mocks.loadStarterConfig).toHaveBeenCalledOnce();
    expect(mocks.loadStarterConfig.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createOidcLoginHandler.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("loads starter config before constructing the callback handler", async () => {
    const { GET } = await import("./[provider]/callback/+server");

    expect(mocks.loadStarterConfig).toHaveBeenCalledOnce();
    expect(mocks.loadStarterConfig.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createOidcCallbackHandler.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );

    await GET({ params: { provider: "happyvertical" } } as Parameters<typeof GET>[0]);
    expect(mocks.oidcCallback).toHaveBeenCalledOnce();
  });

  it("does not start a disabled HappyVertical IdP flow", async () => {
    mocks.isHappyVerticalWebIdpEnabled.mockReturnValue(false);
    const { GET } = await import("./[provider]/login/+server");

    const response = await GET({
      params: { provider: "happyvertical" },
    } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(404);
    expect(mocks.oidcLogin).not.toHaveBeenCalled();
  });
});
