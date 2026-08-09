import { beforeEach, describe, expect, it, vi } from "vitest";

const authzMocks = vi.hoisted(() => ({
  getAppDatabase: vi.fn(),
  query: vi.fn(),
}));

vi.mock("$lib/server/db", () => ({
  getAppDatabase: authzMocks.getAppDatabase,
}));

import { requirePermission, resolveMembershipContext, starterPermissions } from "$lib/server/authz";
import { DEMO_TENANT_ID, starterData } from "$lib/server/starter-data";

const memberUserId = "11111111-1111-4111-8111-111111111111";
const profileId = "22222222-2222-4222-8222-222222222222";
const tenantId = DEMO_TENANT_ID;

describe("starter authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SMRT_STARTER_DEV_AUTH;
    authzMocks.getAppDatabase.mockResolvedValue({ query: authzMocks.query });
    authzMocks.query.mockResolvedValue({
      rows: [membershipRow({ roleSlug: "owner", roleName: "Owner" })],
    });
  });

  it("uses the seeded demo owner as a non-production fallback", async () => {
    const membership = await resolveMembershipContext({ tenantId, user: null });

    expect(membership).toMatchObject({
      tenantId,
      roleSlug: "owner",
      userEmail: starterData.demoTenant.ownerUser.email,
      profileId,
      devFallback: true,
    });
    expect(membership?.permissions).toContain(starterPermissions.billingManage);
    expect(authzMocks.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM memberships"),
      starterData.demoTenant.ownerUser.id,
    );
  });

  it("resolves real user memberships and starter role permissions", async () => {
    authzMocks.query.mockResolvedValueOnce({
      rows: [membershipRow({ userId: memberUserId, roleSlug: "member", roleName: "Member" })],
    });

    const membership = await resolveMembershipContext({
      tenantId,
      user: { id: memberUserId, email: "member@example.com" },
      permissions: ["smrt.session.permission"],
    });

    expect(membership).toMatchObject({
      userId: memberUserId,
      userEmail: "member@example.com",
      profileId,
      roleSlug: "member",
      devFallback: false,
    });
    expect(membership?.permissions).toEqual(
      expect.arrayContaining([
        "smrt.session.permission",
        starterPermissions.mcpCall,
        starterPermissions.settingsRead,
        starterPermissions.fieldPolicyPersonalize,
      ]),
    );
    expect(membership?.permissions).not.toContain(starterPermissions.billingManage);
    const membershipSql = authzMocks.query.mock.calls[0]?.[0];
    expect(membershipSql).toContain("INNER JOIN profiles ON profiles.id = users.profile_id");
    expect(membershipSql).toContain("profiles._meta_type = '@happyvertical/smrt-profiles:Person'");
    expect(membershipSql).toContain("profiles.email_key = users.email_key");
    expect(membershipSql).toContain("FROM profiles AS other_profiles");
    expect(membershipSql).toContain("NOT EXISTS");
  });

  it("fails closed when the database rejects a mismatched or competing Profile identity", async () => {
    authzMocks.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      resolveMembershipContext({
        tenantId,
        user: { id: memberUserId, email: "member@example.com" },
      }),
    ).resolves.toBeNull();

    const membershipSql = authzMocks.query.mock.calls[0]?.[0];
    expect(membershipSql).toContain("profiles.email_key IS NOT NULL");
    expect(membershipSql).toContain("users.email_key IS NOT NULL");
    expect(membershipSql).toContain("other_profiles.id <> users.profile_id");
  });

  it("does not trust a raw framework Membership as a validated starter context", async () => {
    authzMocks.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      resolveMembershipContext({
        tenantId,
        user: { id: memberUserId, email: "member@example.com" },
        membership: {
          tenantId,
          userId: memberUserId,
          roleId: "role-1",
          status: "active",
        },
      }),
    ).resolves.toBeNull();

    expect(authzMocks.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM memberships"),
      memberUserId,
    );
  });

  it("blocks role permissions that are not granted", async () => {
    authzMocks.query.mockResolvedValueOnce({
      rows: [membershipRow({ userId: memberUserId, roleSlug: "viewer", roleName: "Viewer" })],
    });

    await expect(
      requirePermission(
        {
          tenantId,
          user: { id: memberUserId, email: "viewer@example.com" },
        },
        starterPermissions.mcpCall,
      ),
    ).rejects.toMatchObject({
      status: 403,
      body: { message: `Missing permission: ${starterPermissions.mcpCall}` },
    });
  });

  it("requires a real identity when the dev fallback is disabled", async () => {
    process.env.SMRT_STARTER_DEV_AUTH = "false";

    await expect(
      requirePermission({ tenantId, user: null }, starterPermissions.appAccess),
    ).rejects.toMatchObject({
      status: 401,
      body: { message: "No active membership for this tenant" },
    });
    expect(authzMocks.query).not.toHaveBeenCalled();
  });
});

function membershipRow({
  userId = starterData.demoTenant.ownerUser.id,
  roleSlug,
  roleName,
}: {
  userId?: string;
  roleSlug: string;
  roleName: string;
}) {
  return {
    membership_id: starterData.demoTenant.ownerMembership.id,
    user_id: userId,
    user_email:
      userId === starterData.demoTenant.ownerUser.id
        ? starterData.demoTenant.ownerUser.email
        : `${roleSlug}@example.com`,
    user_profile_id: profileId,
    tenant_id: tenantId,
    tenant_slug: starterData.demoTenant.slug,
    tenant_name: starterData.demoTenant.name,
    role_id: starterData.roles.find((role) => role.slug === roleSlug)?.id ?? roleSlug,
    role_slug: roleSlug,
    role_name: roleName,
  };
}
