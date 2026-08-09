import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enableTenancy: vi.fn(),
  createSvelteKitHandle: vi.fn(
    () => async (input: { event: unknown; resolve: (event: unknown) => unknown }) =>
      input.resolve(input.event),
  ),
  createSessionHandler: vi.fn(
    () => async (input: { event: unknown; resolve: (event: unknown) => unknown }) =>
      input.resolve(input.event),
  ),
  getCurrentTenant: vi.fn(),
  loadBearerSessionContext: vi.fn(),
  parseBearerToken: vi.fn(),
  requirePermission: vi.fn(),
  requireSuperUser: vi.fn(),
  resolveMembershipContext: vi.fn(),
  ensureUserProfile: vi.fn(),
  loadStarterConfig: vi.fn(),
  resolveTenant: vi.fn(),
  withTenant: vi.fn(async (_context: unknown, run: () => Promise<unknown>) => await run()),
}));

vi.mock("@happyvertical/smrt-tenancy", () => ({
  enableTenancy: mocks.enableTenancy,
  getCurrentTenant: mocks.getCurrentTenant,
  createSvelteKitHandle: mocks.createSvelteKitHandle,
  withTenant: mocks.withTenant,
}));

vi.mock("@happyvertical/smrt-users/sveltekit", () => ({
  createSessionHandler: mocks.createSessionHandler,
  loadBearerSessionContext: mocks.loadBearerSessionContext,
  parseBearerToken: mocks.parseBearerToken,
}));

vi.mock("@sveltejs/kit/hooks", () => ({
  sequence:
    (
      ...handles: Array<
        (input: { event: unknown; resolve: (event: unknown) => unknown }) => unknown
      >
    ) =>
    async (input: { event: unknown; resolve: (event: unknown) => unknown }) => {
      const dispatch = async (index: number, event: unknown): Promise<unknown> => {
        const next = handles[index];
        return next
          ? next({ event, resolve: (nextEvent) => dispatch(index + 1, nextEvent) })
          : input.resolve(event);
      };
      return dispatch(0, input.event);
    },
}));

vi.mock("$lib/server/authz", () => ({
  requirePermission: mocks.requirePermission,
  resolveMembershipContext: mocks.resolveMembershipContext,
  starterPermissions: { settingsManage: "tenant.settings.manage" },
}));

vi.mock("$lib/server/super-users", () => ({
  requireSuperUser: mocks.requireSuperUser,
}));

vi.mock("$lib/server/profile-identity", () => ({
  ensureUserProfile: mocks.ensureUserProfile,
}));

vi.mock("$lib/server/smrt", () => ({
  getSmrtConfig: () => ({}),
}));

vi.mock("$lib/server/smrt-register", () => ({}));

vi.mock("$lib/server/starter-config", () => ({
  loadStarterConfig: mocks.loadStarterConfig,
}));

vi.mock("$lib/server/tenancy", () => ({
  resolveTenant: mocks.resolveTenant,
}));

import { starterData } from "$lib/server/starter-data";
import { handle } from "./hooks.server";

const startupCallOrder = {
  config: mocks.loadStarterConfig.mock.invocationCallOrder[0],
  session: mocks.createSessionHandler.mock.invocationCallOrder[0],
};

const userId = "11111111-1111-4111-8111-111111111111";

describe("starter request bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadStarterConfig.mockResolvedValue(undefined);
    mocks.getCurrentTenant.mockReturnValue(null);
    mocks.parseBearerToken.mockReturnValue(null);
    mocks.requirePermission.mockResolvedValue(undefined);
    mocks.requireSuperUser.mockReturnValue(undefined);
    mocks.resolveMembershipContext.mockResolvedValue(null);
    mocks.ensureUserProfile.mockResolvedValue({
      profileId: "22222222-2222-4222-8222-222222222222",
      created: false,
      repairedDanglingLink: false,
    });
  });

  it("loads config during module startup before auth handles are constructed", () => {
    expect(startupCallOrder.config).toBeDefined();
    expect(startupCallOrder.config).toBeLessThan(startupCallOrder.session);
  });

  it("reconciles an authenticated user identity before membership resolution", async () => {
    const locals = { user: { id: userId, email: "Person@Example.com" } };
    await handle({
      event: {
        locals,
        request: new Request("http://localhost/app"),
        url: new URL("http://localhost/app"),
      },
      resolve: async () => new Response("ok"),
    } as unknown as Parameters<typeof handle>[0]);

    expect(mocks.ensureUserProfile).toHaveBeenCalledWith({
      userId,
      email: "Person@Example.com",
    });
    expect(mocks.ensureUserProfile.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.resolveMembershipContext.mock.invocationCallOrder[0],
    );
  });

  it("does not lock an already Profile-backed user on every request", async () => {
    await handle({
      event: {
        locals: {
          user: {
            id: userId,
            email: "Person@Example.com",
            profileId: "22222222-2222-4222-8222-222222222222",
          },
        },
        request: new Request("http://localhost/app"),
        url: new URL("http://localhost/app"),
      },
      resolve: async () => new Response("ok"),
    } as unknown as Parameters<typeof handle>[0]);

    expect(mocks.ensureUserProfile).not.toHaveBeenCalled();
    expect(mocks.resolveMembershipContext).toHaveBeenCalledOnce();
  });

  it("reconciles the seeded Profile for dev-auth fallback requests", async () => {
    const locals: Record<string, unknown> = { user: null };
    mocks.resolveMembershipContext.mockResolvedValue({
      tenantId: starterData.demoTenant.id,
      userId: starterData.demoTenant.ownerUser.id,
      userEmail: starterData.demoTenant.ownerUser.email,
      profileId: "22222222-2222-4222-8222-222222222222",
      permissions: ["tenant.settings.manage"],
      devFallback: true,
    });
    await handle({
      event: {
        locals,
        request: new Request("http://localhost/app"),
        url: new URL("http://localhost/app"),
      },
      resolve: async () => new Response("ok"),
    } as unknown as Parameters<typeof handle>[0]);

    expect(mocks.ensureUserProfile).toHaveBeenCalledWith({
      userId: starterData.demoTenant.ownerUser.id,
      email: starterData.demoTenant.ownerUser.email,
      name: starterData.demoTenant.ownerProfile.name,
    });
    expect(locals.user).toEqual({
      id: starterData.demoTenant.ownerUser.id,
      email: starterData.demoTenant.ownerUser.email,
      profileId: "22222222-2222-4222-8222-222222222222",
    });
    expect(locals.permissions).toEqual(["tenant.settings.manage"]);
  });

  it("protects generated starter-setting CRUD with the existing admin capability", async () => {
    const locals = { user: { id: userId, email: "Person@Example.com" } };
    mocks.requirePermission.mockResolvedValue({
      tenantId: starterData.demoTenant.id,
      userId,
      permissions: ["tenant.settings.manage"],
    });
    await handle({
      event: {
        locals,
        request: new Request("http://localhost/api/generated/starterappsettings"),
        url: new URL("http://localhost/api/generated/starterappsettings"),
      },
      resolve: async () => new Response("ok"),
    } as unknown as Parameters<typeof handle>[0]);

    expect(mocks.resolveMembershipContext).toHaveBeenCalledOnce();
    expect(mocks.requireSuperUser).toHaveBeenCalledWith(locals);
    expect(mocks.requirePermission).toHaveBeenCalledWith(locals, "tenant.settings.manage");
    expect(mocks.withTenant).toHaveBeenCalledWith(
      {
        tenantId: starterData.demoTenant.id,
        userId,
        permissions: new Set(["tenant.settings.manage"]),
      },
      expect.any(Function),
    );
  });

  it("protects generated starter-setting item updates with the same capability", async () => {
    const locals = { user: { id: userId, email: "Person@Example.com" } };
    mocks.requirePermission.mockResolvedValue({
      tenantId: starterData.demoTenant.id,
      userId,
      permissions: ["tenant.settings.manage"],
    });
    await handle({
      event: {
        locals,
        request: new Request(`http://localhost/api/generated/starterappsettings/${userId}`),
        url: new URL(`http://localhost/api/generated/starterappsettings/${userId}`),
      },
      resolve: async () => new Response("ok"),
    } as unknown as Parameters<typeof handle>[0]);

    expect(mocks.requireSuperUser).toHaveBeenCalledWith(locals);
    expect(mocks.requirePermission).toHaveBeenCalledWith(locals, "tenant.settings.manage");
  });

  it("disables the generated sync write path", async () => {
    const resolve = vi.fn(async () => new Response("unexpected"));
    const response = await handle({
      event: {
        locals: { user: { id: userId, email: "Person@Example.com" } },
        request: new Request("http://localhost/api/generated/sync/apply", { method: "POST" }),
        url: new URL("http://localhost/api/generated/sync/apply"),
      },
      resolve,
    } as unknown as Parameters<typeof handle>[0]);

    expect(response.status).toBe(404);
    expect(resolve).not.toHaveBeenCalled();
    expect(mocks.requireSuperUser).not.toHaveBeenCalled();
  });
});
