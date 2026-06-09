import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const accountMocks = vi.hoisted(() => ({
  createMagicLinkService: vi.fn(),
  getAppDatabase: vi.fn(),
  magicLinkGenerate: vi.fn(),
  magicLinkVerify: vi.fn(),
  query: vi.fn(),
  transaction: vi.fn(),
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

import {
  type AccountFlowError,
  inviteTenantMember,
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
    accountMocks.transaction.mockImplementation(async (callback) =>
      callback({
        query: accountMocks.query,
        upsert: accountMocks.upsert,
      }),
    );
    accountMocks.createMagicLinkService.mockResolvedValue({
      generate: accountMocks.magicLinkGenerate,
      verify: accountMocks.magicLinkVerify,
    });
    accountMocks.upsert.mockResolvedValue({});
    accountMocks.magicLinkGenerate.mockResolvedValue({
      token: "signed-token",
      expiresAt: new Date("2026-06-08T12:10:00.000Z"),
    });
    accountMocks.magicLinkVerify.mockResolvedValue({
      email: "member@example.com",
      nonce: "nonce-1",
    });
  });

  it("creates a tenant, owner user, membership, and starter subscription", async () => {
    accountMocks.query.mockImplementation(async (sql: string, ..._values: unknown[]) => {
      if (sql.includes("FROM users") && sql.includes("lower(email)")) {
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
    });

    const result = await onboardTenant({
      email: " Founder@Example.COM ",
      tenantName: " Acme Labs ",
    });

    expect(result).toMatchObject({
      userEmail: "founder@example.com",
      tenantSlug: "acme-labs",
      tenantLabel: "Acme Labs",
    });
    expect(accountMocks.upsert).toHaveBeenCalledWith(
      "tenants",
      ["slug", "context", "_meta_type"],
      expect.objectContaining({ slug: "acme-labs", name: "Acme Labs" }),
    );
    expect(accountMocks.upsert).toHaveBeenCalledWith(
      "users",
      ["slug", "context"],
      expect.objectContaining({ email: "founder@example.com", status: "active" }),
    );
    expect(accountMocks.upsert).toHaveBeenCalledWith(
      "memberships",
      ["slug", "context"],
      expect.objectContaining({ role_id: ownerRoleId, status: "active" }),
    );
    expect(accountMocks.upsert).toHaveBeenCalledWith(
      "_smrt_tenant_subscriptions",
      ["tenant_id"],
      expect.objectContaining({ plan_id: starterPlanId, status: "active" }),
    );
    expect(accountMocks.transaction).toHaveBeenCalledOnce();
  });

  it("rejects signup for an existing active user", async () => {
    accountMocks.query.mockResolvedValueOnce({
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
      if (sql.includes("FROM users") && sql.includes("lower(email)")) {
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
      if (sql.includes("FROM users") && sql.includes("lower(email)")) {
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
  });

  it("invites a new member by creating a user and active membership", async () => {
    accountMocks.query.mockImplementation(async (sql: string, ...values: unknown[]) => {
      if (sql.includes("FROM tenants") && sql.includes("id = ?")) {
        return { rows: [{ id: values[0], slug: "acme", name: "Acme" }] };
      }
      if (sql.includes("FROM users") && sql.includes("lower(email)")) {
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
  });
});
