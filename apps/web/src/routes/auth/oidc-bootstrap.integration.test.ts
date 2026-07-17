import { clearCache } from "@happyvertical/smrt-config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bootstrapKey = Symbol.for("@happyvertical/smrt-saas-starter/config-bootstrap");

describe("production OIDC config integration", () => {
  beforeEach(() => {
    clearCache();
    delete (globalThis as Record<symbol, unknown>)[bootstrapKey];
    vi.resetModules();
    vi.stubEnv("HAPPYVERTICAL_IDP_ISSUER", "https://idp.example.test/oauth2/openid/starter");
    vi.stubEnv("OIDC_CLIENT_ID", "starter-client");
    vi.stubEnv("OIDC_CLIENT_SECRET", "starter-secret");
  });

  afterEach(() => {
    clearCache();
    delete (globalThis as Record<symbol, unknown>)[bootstrapKey];
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("enters the real login handler with the configured provider registry", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        issuer: "https://idp.example.test/oauth2/openid/starter",
        authorization_endpoint: "https://idp.example.test/authorize",
        token_endpoint: "https://idp.example.test/token",
        jwks_uri: "https://idp.example.test/jwks",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const cookies: Array<{ name: string; value: string }> = [];
    const { GET } = await import("./[provider]/login/+server");

    const response = await GET({
      params: { provider: "happyvertical" },
      request: new Request("http://localhost:5173/auth/happyvertical/login"),
      url: new URL("http://localhost:5173/auth/happyvertical/login"),
      cookies: {
        get: () => undefined,
        set: (name: string, value: string) => cookies.push({ name, value }),
      },
    } as unknown as Parameters<typeof GET>[0]);

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe("https://idp.example.test/authorize");
    expect(location.searchParams.get("client_id")).toBe("starter-client");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "http://localhost:5173/auth/happyvertical/callback",
    );
    expect(cookies).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://idp.example.test/oauth2/openid/starter/.well-known/openid-configuration",
      expect.objectContaining({ headers: { accept: "application/json" } }),
    );
  });
});
