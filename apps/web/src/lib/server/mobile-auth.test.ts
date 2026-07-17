import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mobileAuthMocks = vi.hoisted(() => ({
  exchangeCode: vi.fn(),
  getAuth: vi.fn(),
  getAuthorizationUrl: vi.fn(),
  getBillingOverview: vi.fn(),
  getProfile: vi.fn(),
  getSmrtConfig: vi.fn(() => ({ db: { type: "postgres", url: "postgres://test" } })),
  loadSessionContext: vi.fn(),
  resolveMembershipContext: vi.fn(),
  sessionServiceCreate: vi.fn(),
  signInWithEmail: vi.fn(),
  createSession: vi.fn(),
  destroySession: vi.fn(),
  validateToken: vi.fn(),
}));

vi.mock("@happyvertical/auth", () => ({
  getAuth: mobileAuthMocks.getAuth,
}));

vi.mock("@happyvertical/smrt-users", () => ({
  SessionService: {
    create: mobileAuthMocks.sessionServiceCreate,
  },
}));

vi.mock("$lib/server/accounts", () => ({
  AccountFlowError: class AccountFlowError extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
      this.name = "AccountFlowError";
    }
  },
  signInWithEmail: mobileAuthMocks.signInWithEmail,
}));

vi.mock("$lib/server/authz", () => ({
  resolveMembershipContext: mobileAuthMocks.resolveMembershipContext,
}));

vi.mock("$lib/server/smrt", () => ({
  getSmrtConfig: mobileAuthMocks.getSmrtConfig,
}));

vi.mock("$lib/server/subscriptions", () => ({
  getBillingOverview: mobileAuthMocks.getBillingOverview,
}));

import {
  completeMobileAuth,
  getMobileSessionBootstrap,
  listMobileAuthProviders,
  resetMobileAuthStateForTests,
  startMobileAuth,
} from "$lib/server/mobile-auth";

const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

describe("mobile auth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-08T00:00:00.000Z"));
    vi.clearAllMocks();
    resetMobileAuthStateForTests();
    configureHappyVerticalProvider();
    mobileAuthMocks.getAuth.mockResolvedValue({
      exchangeCode: mobileAuthMocks.exchangeCode,
      getAuthorizationUrl: mobileAuthMocks.getAuthorizationUrl,
      getProfile: mobileAuthMocks.getProfile,
      validateToken: mobileAuthMocks.validateToken,
    });
    mobileAuthMocks.validateToken.mockResolvedValue(null);
    mobileAuthMocks.sessionServiceCreate.mockResolvedValue({
      createSession: mobileAuthMocks.createSession,
      loadSessionContext: mobileAuthMocks.loadSessionContext,
      destroySession: mobileAuthMocks.destroySession,
    });
    mobileAuthMocks.createSession.mockResolvedValue("session-1");
    mobileAuthMocks.signInWithEmail.mockResolvedValue({
      userId,
      userEmail: "owner@example.com",
      tenantId,
      tenantSlug: "acme",
      tenantLabel: "Acme",
    });
    mobileAuthMocks.resolveMembershipContext.mockResolvedValue(membership());
    mobileAuthMocks.getBillingOverview.mockResolvedValue({
      currentPlan: { name: "Growth" },
      snapshot: {
        status: "active",
        featureKeys: ["app.access", "chat.agent"],
        thresholdEvaluations: [
          {
            threshold: {
              metricKey: "mcp.calls",
              label: "MCP calls",
              limit: 100,
              enforcement: "warn",
            },
            usage: { quantity: 12 },
            state: "ok",
            allowed: true,
            remaining: 88,
          },
        ],
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("lists the configured HappyVertical provider without exposing secrets", () => {
    expect(listMobileAuthProviders()).toEqual([
      {
        id: "happyvertical",
        label: "HappyVertical IDP",
        type: "kanidm",
        supportsPkce: true,
      },
    ]);
  });

  it("starts an OIDC PKCE flow through the SDK auth provider", async () => {
    mobileAuthMocks.getAuthorizationUrl.mockResolvedValue({
      url: "https://idp.example.test/oauth2/authorize",
      state: "state-1",
      codeVerifier: "verifier-1",
      nonce: "nonce-1",
    });

    await expect(
      startMobileAuth({
        redirectUri: "smrtstarter://auth/callback",
        loginHint: "owner@example.com",
      }),
    ).resolves.toEqual({
      providerId: "happyvertical",
      authorizationUrl: "https://idp.example.test/oauth2/authorize",
      state: "state-1",
      codeVerifier: "verifier-1",
      nonce: "nonce-1",
      redirectUri: "smrtstarter://auth/callback",
    });
    expect(mobileAuthMocks.getAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "kanidm",
        serverUrl: "https://idp.example.test",
        clientId: "mobile-client",
        redirectUri: "smrtstarter://auth/callback",
      }),
    );
    expect(mobileAuthMocks.getAuthorizationUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: ["openid", "profile", "email"],
        loginHint: "owner@example.com",
      }),
    );
  });

  it("rejects a redirect URI that uses a dangerous scheme", async () => {
    await expect(
      startMobileAuth({ redirectUri: "javascript:alert(document.cookie)" }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Mobile redirect URI uses an unsupported scheme",
    });
    expect(mobileAuthMocks.getAuth).not.toHaveBeenCalled();
  });

  it("rejects a non-loopback http redirect URI", async () => {
    await expect(
      startMobileAuth({ redirectUri: "http://attacker.example.com/callback" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(mobileAuthMocks.getAuth).not.toHaveBeenCalled();
  });

  it("allows an http loopback redirect URI for native clients", async () => {
    mobileAuthMocks.getAuthorizationUrl.mockResolvedValue({
      url: "https://idp.example.test/oauth2/authorize",
      state: "state-1",
    });

    await expect(
      startMobileAuth({ redirectUri: "http://127.0.0.1:8765/callback" }),
    ).resolves.toMatchObject({ redirectUri: "http://127.0.0.1:8765/callback" });
  });

  it("enforces a configured redirect URI allow list", async () => {
    vi.stubEnv("MOBILE_AUTH_ALLOWED_REDIRECT_URIS", "smrtstarter://auth/callback");
    mobileAuthMocks.getAuthorizationUrl.mockResolvedValue({
      url: "https://idp.example.test/oauth2/authorize",
      state: "state-1",
    });

    await expect(
      startMobileAuth({ redirectUri: "smrtstarter://auth/callback" }),
    ).resolves.toMatchObject({ redirectUri: "smrtstarter://auth/callback" });

    await expect(
      startMobileAuth({ redirectUri: "smrtstarter://attacker/callback" }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Mobile redirect URI is not allowed for this provider",
    });
  });

  it("exchanges an authorization code for a smrt-users bearer session", async () => {
    mobileAuthMocks.exchangeCode.mockResolvedValue({
      accessToken: "provider-access-token",
      tokenType: "Bearer",
      expiresIn: 3600,
      userId: "external-user",
    });
    mobileAuthMocks.getProfile.mockResolvedValue({
      id: "external-user",
      email: "Owner@Example.com",
      emailVerified: true,
    });

    await expect(
      completeMobileAuth({
        request: {
          code: "code-1",
          state: "state-1",
          codeVerifier: "verifier-1",
          redirectUri: "smrtstarter://auth/callback",
        },
        userAgent: "ios-test",
        ipAddress: "127.0.0.1",
      }),
    ).resolves.toEqual({
      accessToken: "session-1",
      tokenType: "Bearer",
      expiresAt: "2026-07-08T00:00:00.000Z",
      user: {
        id: userId,
        email: "owner@example.com",
        label: "owner@example.com",
      },
      activeTenant: {
        id: tenantId,
        name: "Acme",
        slug: "acme",
        roleSlug: "owner",
        roleLabel: "Owner",
      },
      tenants: [
        {
          id: tenantId,
          name: "Acme",
          slug: "acme",
          roleSlug: "owner",
          roleLabel: "Owner",
        },
      ],
    });
    expect(mobileAuthMocks.signInWithEmail).toHaveBeenCalledWith("owner@example.com", {
      reuseExistingProfile: true,
    });
    expect(mobileAuthMocks.createSession).toHaveBeenCalledWith(userId, tenantId, {
      ttl: 2_592_000,
      userAgent: "ios-test",
      ipAddress: "127.0.0.1",
      data: expect.objectContaining({
        source: "mobile",
        providerId: "happyvertical",
        providerType: "kanidm",
        externalUserId: "external-user",
      }),
    });
  });

  it("rejects provider profiles that explicitly mark email as unverified", async () => {
    mobileAuthMocks.exchangeCode.mockResolvedValue({
      accessToken: "provider-access-token",
      tokenType: "Bearer",
      expiresIn: 3600,
      userId: "external-user",
    });
    mobileAuthMocks.getProfile.mockResolvedValue({
      id: "external-user",
      email: "owner@example.com",
      emailVerified: false,
    });

    await expect(
      completeMobileAuth({
        request: {
          code: "code-1",
          state: "state-1",
          codeVerifier: "verifier-1",
          redirectUri: "smrtstarter://auth/callback",
        },
      }),
    ).rejects.toMatchObject({
      status: 401,
      message: "Mobile auth provider did not verify that email",
    });
    expect(mobileAuthMocks.signInWithEmail).not.toHaveBeenCalled();
    expect(mobileAuthMocks.createSession).not.toHaveBeenCalled();
    expect(mobileAuthMocks.validateToken).not.toHaveBeenCalled();
  });

  it("rejects provider profiles that omit positive email verification", async () => {
    mobileAuthMocks.exchangeCode.mockResolvedValue({
      accessToken: "provider-access-token",
      tokenType: "Bearer",
      expiresIn: 3600,
      userId: "external-user",
    });
    mobileAuthMocks.getProfile.mockResolvedValue({
      id: "external-user",
      email: "owner@example.com",
    });

    await expect(completeMobileAuth({ request: mobileCompleteRequest() })).rejects.toMatchObject({
      status: 401,
      message: "Mobile auth provider did not verify that email",
    });
    expect(mobileAuthMocks.signInWithEmail).not.toHaveBeenCalled();
  });

  it("accepts a profile email when validated token claims verify the same email", async () => {
    mobileAuthMocks.exchangeCode.mockResolvedValue({
      accessToken: "provider-access-token",
      idToken: "provider-id-token",
      tokenType: "Bearer",
      expiresIn: 3600,
      userId: "external-user",
    });
    mobileAuthMocks.getProfile.mockResolvedValue({
      id: "external-user",
      email: "Owner@Example.com",
    });
    mobileAuthMocks.validateToken.mockResolvedValue({
      email: "owner@example.com",
      email_verified: true,
      sub: "external-user",
    });

    await expect(completeMobileAuth({ request: mobileCompleteRequest() })).resolves.toMatchObject({
      accessToken: "session-1",
      user: { email: "owner@example.com" },
    });
    expect(mobileAuthMocks.validateToken).toHaveBeenCalledWith("provider-id-token");
    expect(mobileAuthMocks.signInWithEmail).toHaveBeenCalledWith("owner@example.com", {
      reuseExistingProfile: true,
    });
  });

  it("rejects a verified token email that does not match the unverified profile email", async () => {
    mobileAuthMocks.exchangeCode.mockResolvedValue({
      accessToken: "provider-access-token",
      idToken: "provider-id-token",
      tokenType: "Bearer",
      expiresIn: 3600,
      userId: "external-user",
    });
    mobileAuthMocks.getProfile.mockResolvedValue({
      id: "external-user",
      email: "profile@example.com",
    });
    mobileAuthMocks.validateToken.mockResolvedValue({
      email: "token@example.com",
      email_verified: true,
      sub: "external-user",
    });

    await expect(completeMobileAuth({ request: mobileCompleteRequest() })).rejects.toMatchObject({
      status: 401,
      message: "Mobile auth provider did not verify that email",
    });
    expect(mobileAuthMocks.signInWithEmail).not.toHaveBeenCalled();
    expect(mobileAuthMocks.createSession).not.toHaveBeenCalled();
  });

  it.each([
    false,
    undefined,
  ])("rejects token fallback when email_verified is %s", async (emailVerified) => {
    mobileAuthMocks.exchangeCode.mockResolvedValue({
      accessToken: "provider-access-token",
      idToken: "provider-id-token",
      tokenType: "Bearer",
      expiresIn: 3600,
      userId: "external-user",
    });
    mobileAuthMocks.getProfile.mockResolvedValue({ id: "external-user" });
    mobileAuthMocks.validateToken.mockResolvedValue({
      email: "owner@example.com",
      ...(emailVerified === undefined ? {} : { email_verified: emailVerified }),
      sub: "external-user",
    });

    await expect(completeMobileAuth({ request: mobileCompleteRequest() })).rejects.toMatchObject({
      status: 401,
      message: "Mobile auth provider did not verify that email",
    });
    expect(mobileAuthMocks.signInWithEmail).not.toHaveBeenCalled();
  });

  it("bootstraps tenant dashboard state from a bearer session", async () => {
    mobileAuthMocks.loadSessionContext.mockResolvedValue({
      user: { id: userId, email: "owner@example.com" },
      permissions: [],
      tenantId,
      sessionId: "session-1",
    });

    await expect(getMobileSessionBootstrap("Bearer session-1")).resolves.toEqual({
      user: {
        id: userId,
        email: "owner@example.com",
        label: "owner@example.com",
      },
      activeTenant: {
        id: tenantId,
        name: "Acme",
        slug: "acme",
        roleSlug: "owner",
        roleLabel: "Owner",
      },
      tenants: [
        {
          id: tenantId,
          name: "Acme",
          slug: "acme",
          roleSlug: "owner",
          roleLabel: "Owner",
        },
      ],
      dashboard: {
        tenant: {
          id: tenantId,
          name: "Acme",
          slug: "acme",
          planName: "Growth",
          subscriptionStatus: "active",
        },
        thresholds: [
          {
            metricKey: "mcp.calls",
            label: "MCP calls",
            used: 12,
            limit: 100,
            action: "warn",
            state: "ok",
            allowed: true,
            remaining: 88,
          },
        ],
        enabledFeatures: ["app.access", "chat.agent"],
        language: "en",
      },
    });
  });
});

function configureHappyVerticalProvider() {
  vi.stubEnv("HAPPYVERTICAL_IDP_ISSUER", "https://idp.example.test");
  vi.stubEnv("MOBILE_OIDC_CLIENT_ID", "mobile-client");
  vi.stubEnv("MOBILE_OIDC_CLIENT_SECRET", "mobile-secret");
}

function mobileCompleteRequest() {
  return {
    code: "code-1",
    state: "state-1",
    codeVerifier: "verifier-1",
    redirectUri: "smrtstarter://auth/callback",
  };
}

function membership() {
  return {
    membershipId: "33333333-3333-4333-8333-333333333333",
    userId,
    userEmail: "owner@example.com",
    tenantId,
    tenantSlug: "acme",
    tenantLabel: "Acme",
    roleId: "44444444-4444-4444-8444-444444444444",
    roleSlug: "owner",
    roleLabel: "Owner",
    permissions: ["app.access"],
    availableTenants: [
      {
        tenantId,
        tenantSlug: "acme",
        tenantLabel: "Acme",
        roleId: "44444444-4444-4444-8444-444444444444",
        roleSlug: "owner",
        roleLabel: "Owner",
      },
    ],
    devFallback: false,
  };
}
