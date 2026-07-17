import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const accountMocks = vi.hoisted(() => ({
  createMagicLinkService: vi.fn(),
  getAppDatabase: vi.fn(),
  magicLinkGenerate: vi.fn(),
  magicLinkVerify: vi.fn(),
  ensureUserProfile: vi.fn(),
  ensureUserProfileInTransaction: vi.fn(),
  query: vi.fn(),
  transaction: vi.fn(),
  txQuery: vi.fn(),
  txUpsert: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@happyvertical/smrt-users", () => ({
  MagicLinkError: class MagicLinkError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "MagicLinkError";
    }
  },
  MagicLinkService: {
    create: accountMocks.createMagicLinkService,
  },
}));

vi.mock("$lib/server/db", () => ({
  getAppDatabase: accountMocks.getAppDatabase,
}));

vi.mock("$lib/server/profile-identity", () => ({
  ensureUserProfile: accountMocks.ensureUserProfile,
  ensureUserProfileInTransaction: accountMocks.ensureUserProfileInTransaction,
}));

import {
  type AccountFlowError,
  generateWelcomeMagicLink,
  inviteTenantMember,
  listTenants,
  onboardTenant,
  requestSignInLink,
  signInWithEmail,
  verifySignInLink,
} from "$lib/server/accounts";

const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const ownerRoleId = "33333333-3333-4333-8333-333333333333";
const memberRoleId = "44444444-4444-4444-8444-444444444444";
const starterPlanId = "55555555-5555-4555-8555-555555555555";
const transactionDb = {
  query: accountMocks.txQuery,
  upsert: accountMocks.txUpsert,
};

describe("account onboarding flows", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    accountMocks.getAppDatabase.mockResolvedValue({
      query: accountMocks.query,
      transaction: accountMocks.transaction,
      upsert: accountMocks.upsert,
    });
    accountMocks.transaction.mockImplementation(async (callback) => callback(transactionDb));
    accountMocks.createMagicLinkService.mockResolvedValue({
      generate: accountMocks.magicLinkGenerate,
      verify: accountMocks.magicLinkVerify,
    });
    accountMocks.upsert.mockResolvedValue({});
    accountMocks.txUpsert.mockResolvedValue({});
    accountMocks.magicLinkGenerate.mockResolvedValue({
      token: "signed-token",
      expiresAt: new Date("2026-06-08T12:10:00.000Z"),
    });
    accountMocks.magicLinkVerify.mockResolvedValue({
      email: "member@example.com",
      nonce: "nonce-1",
    });
    accountMocks.ensureUserProfile.mockResolvedValue({
      profileId: "66666666-6666-4666-8666-666666666666",
      created: false,
      repairedDanglingLink: false,
    });
    accountMocks.ensureUserProfileInTransaction.mockResolvedValue({
      profileId: "66666666-6666-4666-8666-666666666666",
      created: true,
      repairedDanglingLink: false,
    });
  });

  it("creates a tenant, owner user, membership, and starter subscription", async () => {
    const queryImplementation = async (sql: string, ..._values: unknown[]) => {
      if (sql.includes("FROM users") && sql.includes("email_key =")) {
        return { rows: [] };
      }
      if (sql.includes("FROM tenants") && sql.includes("slug = ?")) {
        return { rows: [] };
      }
      if (sql.includes("FROM roles")) {
        return { rows: [{ id: ownerRoleId, slug: "owner", name: "Owner" }] };
      }
      if (sql.includes("FROM _smrt_subscription_plans")) {
        return { rows: [{ id: starterPlanId, plan_key: "starter" }] };
      }
      return { rows: [] };
    };
    accountMocks.query.mockImplementation(queryImplementation);
    accountMocks.txQuery.mockImplementation(queryImplementation);

    const result = await onboardTenant({
      email: " Founder@Example.COM ",
      tenantName: " Acme Labs ",
    });

    expect(result).toMatchObject({
      userEmail: "founder@example.com",
      tenantSlug: "acme-labs",
      tenantLabel: "Acme Labs",
    });
    expect(accountMocks.txUpsert).toHaveBeenCalledWith(
      "tenants",
      ["slug", "context", "_meta_type"],
      expect.objectContaining({ slug: "acme-labs", name: "Acme Labs" }),
    );
    expect(accountMocks.txUpsert).toHaveBeenCalledWith(
      "users",
      ["slug", "context"],
      expect.objectContaining({ email: "founder@example.com", status: "active" }),
    );
    expect(accountMocks.txUpsert).toHaveBeenCalledWith(
      "memberships",
      ["slug", "context"],
      expect.objectContaining({ role_id: ownerRoleId, status: "active" }),
    );
    expect(accountMocks.txUpsert).toHaveBeenCalledWith(
      "_smrt_tenant_subscriptions",
      ["tenant_id", "subscriber_kind", "subscriber_external_id"],
      expect.objectContaining({
        tenant_id: result.tenantId,
        subscriber_kind: "tenant",
        subscriber_external_id: "",
        plan_id: starterPlanId,
        status: "active",
      }),
    );
    expect(accountMocks.upsert).not.toHaveBeenCalled();
    expect(accountMocks.transaction).toHaveBeenCalledOnce();
    expect(accountMocks.ensureUserProfileInTransaction).toHaveBeenCalledWith(transactionDb, {
      userId: expect.any(String),
      email: "founder@example.com",
    });
  });

  it("rejects signup for an existing active user", async () => {
    accountMocks.txQuery.mockResolvedValueOnce({
      rows: [{ id: userId, email: "founder@example.com" }],
    });

    await expect(
      onboardTenant({ email: "founder@example.com", tenantName: "Acme Labs" }),
    ).rejects.toMatchObject({
      status: 409,
      message: "That email already has an account. Sign in instead.",
    } satisfies Partial<AccountFlowError>);
    expect(accountMocks.upsert).not.toHaveBeenCalled();
  });

  it("signs in an active user with their first active tenant membership", async () => {
    accountMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM users") && sql.includes("email_key =")) {
        return { rows: [{ id: userId, email: "member@example.com" }] };
      }
      if (sql.includes("FROM memberships") && sql.includes("INNER JOIN tenants")) {
        return {
          rows: [
            {
              user_id: userId,
              user_email: "member@example.com",
              tenant_id: tenantId,
              tenant_slug: "acme",
              tenant_name: "Acme",
            },
          ],
        };
      }
      return { rows: [], rowCount: 1 };
    });

    await expect(signInWithEmail(" member@example.com ")).resolves.toEqual({
      userId,
      userEmail: "member@example.com",
      tenantId,
      tenantSlug: "acme",
      tenantLabel: "Acme",
    });
    expect(accountMocks.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE users"),
      expect.any(String),
      expect.any(String),
      userId,
    );
    expect(accountMocks.ensureUserProfile).toHaveBeenCalledWith(
      { userId, email: "member@example.com" },
      { db: expect.anything() },
    );
  });

  it("requests a single-use sign-in link for an active user", async () => {
    accountMocks.query.mockResolvedValueOnce({
      rows: [{ id: userId, email: "member@example.com" }],
    });

    await expect(
      requestSignInLink({
        email: " Member@Example.com ",
        origin: "http://localhost:5173",
        returnTo: "/app/settings",
      }),
    ).resolves.toMatchObject({
      email: "member@example.com",
      verificationUrl:
        "http://localhost:5173/login/verify?token=signed-token&returnTo=%2Fapp%2Fsettings",
    });
    expect(accountMocks.magicLinkGenerate).toHaveBeenCalledWith("member@example.com");
    expect(accountMocks.ensureUserProfile).not.toHaveBeenCalled();
  });

  it("does not look up emails when local magic links are disabled", async () => {
    vi.stubEnv("SMRT_STARTER_AUTH_INLINE_LINKS", "false");

    await expect(
      requestSignInLink({
        email: "member@example.com",
        origin: "http://localhost:5173",
      }),
    ).rejects.toMatchObject({
      status: 501,
      message:
        "Magic link email delivery is not configured. Use HappyVertical IDP or enable local inline links.",
    } satisfies Partial<AccountFlowError>);
    expect(accountMocks.query).not.toHaveBeenCalled();
  });

  it("verifies a sign-in link before creating a session target", async () => {
    accountMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM users") && sql.includes("email_key =")) {
        return { rows: [{ id: userId, email: "member@example.com" }] };
      }
      if (sql.includes("FROM memberships") && sql.includes("INNER JOIN tenants")) {
        return {
          rows: [
            {
              user_id: userId,
              user_email: "member@example.com",
              tenant_id: tenantId,
              tenant_slug: "acme",
              tenant_name: "Acme",
            },
          ],
        };
      }
      return { rows: [], rowCount: 1 };
    });

    await expect(verifySignInLink(" signed-token ")).resolves.toEqual({
      userId,
      userEmail: "member@example.com",
      tenantId,
      tenantSlug: "acme",
      tenantLabel: "Acme",
    });
    expect(accountMocks.magicLinkVerify).toHaveBeenCalledWith("signed-token");
    expect(accountMocks.ensureUserProfile).toHaveBeenCalledWith(
      { userId, email: "member@example.com", reuseExistingProfile: true },
      { db: expect.anything() },
    );
  });

  it("invites a new member by creating a user and active membership", async () => {
    accountMocks.query.mockImplementation(async (sql: string, ...values: unknown[]) => {
      if (sql.includes("FROM tenants") && sql.includes("id = ?")) {
        return { rows: [{ id: values[0], slug: "acme", name: "Acme" }] };
      }
      if (sql.includes("FROM users") && sql.includes("email_key =")) {
        return { rows: [] };
      }
      if (sql.includes("FROM roles")) {
        return { rows: [{ id: memberRoleId, slug: "member", name: "Member" }] };
      }
      return { rows: [] };
    });

    await expect(
      inviteTenantMember({
        tenantId,
        email: " teammate@example.com ",
        roleSlug: "member",
      }),
    ).resolves.toMatchObject({
      action: "created",
      member: {
        email: "teammate@example.com",
        roleSlug: "member",
        status: "active",
      },
    });
    expect(accountMocks.upsert).toHaveBeenCalledWith(
      "users",
      ["slug", "context"],
      expect.objectContaining({ email: "teammate@example.com" }),
    );
    expect(accountMocks.upsert).toHaveBeenCalledWith(
      "memberships",
      ["slug", "context"],
      expect.objectContaining({ tenant_id: tenantId, role_id: memberRoleId }),
    );
    expect(accountMocks.ensureUserProfile).toHaveBeenCalledWith(
      { userId: expect.any(String), email: "teammate@example.com" },
      { db: expect.anything() },
    );
  });

  it("generates a welcome magic link for a graduated user", async () => {
    await expect(
      generateWelcomeMagicLink({ email: " Grad@Example.com ", origin: "http://localhost:5173" }),
    ).resolves.toMatchObject({
      email: "grad@example.com",
      verificationUrl: "http://localhost:5173/login/verify?token=signed-token",
    });
    // Unlike requestSignInLink, it does not require an existing membership row.
    expect(accountMocks.magicLinkGenerate).toHaveBeenCalledWith("grad@example.com");
    expect(accountMocks.query).not.toHaveBeenCalled();
  });

  it("threads a non-default returnTo into the welcome link", async () => {
    await expect(
      generateWelcomeMagicLink({
        email: "grad@example.com",
        origin: "http://localhost:5173",
        returnTo: "/app/settings",
      }),
    ).resolves.toMatchObject({
      verificationUrl:
        "http://localhost:5173/login/verify?token=signed-token&returnTo=%2Fapp%2Fsettings",
    });
  });

  it("returns null when local magic-link delivery is disabled", async () => {
    vi.stubEnv("SMRT_STARTER_AUTH_INLINE_LINKS", "false");
    await expect(
      generateWelcomeMagicLink({ email: "grad@example.com", origin: "http://localhost:5173" }),
    ).resolves.toBeNull();
    expect(accountMocks.magicLinkGenerate).not.toHaveBeenCalled();
  });

  it("lists active tenants mapped to id/slug/name", async () => {
    accountMocks.query.mockResolvedValueOnce({
      rows: [
        { id: "t-1", slug: "acme", name: "Acme" },
        { id: "t-2", slug: "globex", name: "Globex" },
      ],
    });

    await expect(listTenants()).resolves.toEqual([
      { id: "t-1", slug: "acme", name: "Acme" },
      { id: "t-2", slug: "globex", name: "Globex" },
    ]);
    expect(accountMocks.query).toHaveBeenCalledWith(expect.stringContaining("FROM tenants"));
  });
});
