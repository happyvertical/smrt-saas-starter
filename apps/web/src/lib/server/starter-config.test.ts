import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setConfig: vi.fn(),
}));

vi.mock("@happyvertical/smrt-config", () => ({
  setConfig: mocks.setConfig,
}));

const bootstrapKey = Symbol.for("@happyvertical/smrt-saas-starter/config-bootstrap");

describe("starter SMRT config bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as Record<symbol, unknown>)[bootstrapKey];
    vi.resetModules();
  });

  it("registers production OIDC providers before auth handlers resolve config", async () => {
    const { loadStarterConfig } = await import("$lib/server/starter-config");
    await loadStarterConfig();

    expect(mocks.setConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        packages: expect.objectContaining({
          users: expect.objectContaining({
            auth: expect.objectContaining({
              oidc: expect.objectContaining({
                defaultProvider: "happyvertical",
                providers: expect.objectContaining({
                  happyvertical: expect.objectContaining({
                    issuer: process.env.HAPPYVERTICAL_IDP_ISSUER,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    );
  });

  it("remains idempotent across module re-evaluation", async () => {
    const first = await import("$lib/server/starter-config");
    await first.loadStarterConfig();
    vi.resetModules();
    const reloaded = await import("$lib/server/starter-config");
    await reloaded.loadStarterConfig();

    expect(mocks.setConfig).toHaveBeenCalledOnce();
  });
});
