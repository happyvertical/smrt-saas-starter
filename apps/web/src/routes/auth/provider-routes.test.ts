import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const oidcCallback = vi.fn(async () => new Response(null, { status: 303 }));
  return {
    oidcCallback,
    createOidcCallbackHandler: vi.fn(() => oidcCallback),
    createOidcLoginHandler: vi.fn(() => vi.fn()),
    getSmrtConfig: vi.fn(() => ({})),
    loadStarterConfig: vi.fn(async () => undefined),
  };
});

vi.mock("@happyvertical/smrt-users/sveltekit", () => ({
  createOidcCallbackHandler: mocks.createOidcCallbackHandler,
  createOidcLoginHandler: mocks.createOidcLoginHandler,
}));
vi.mock("$lib/server/smrt", () => ({ getSmrtConfig: mocks.getSmrtConfig }));
vi.mock("$lib/server/starter-config", () => ({ loadStarterConfig: mocks.loadStarterConfig }));

describe("production OIDC route bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
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

    await GET({} as Parameters<typeof GET>[0]);
    expect(mocks.oidcCallback).toHaveBeenCalledOnce();
  });
});
