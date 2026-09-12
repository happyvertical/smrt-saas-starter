import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  requireTenantMembership: vi.fn(),
  switchSessionTenant: vi.fn(),
  getSmrtConfig: vi.fn(() => ({ db: { type: "postgres", url: "postgres://test" } })),
}));

vi.mock("@happyvertical/smrt-users/sveltekit", () => ({
  switchSessionTenant: routeMocks.switchSessionTenant,
}));

vi.mock("$lib/server/authz", () => ({
  requireTenantMembership: routeMocks.requireTenantMembership,
}));

vi.mock("$lib/server/smrt", () => ({
  getSmrtConfig: routeMocks.getSmrtConfig,
}));

import { POST } from "./+server";

const tenantId = "11111111-1111-4111-8111-111111111111";

describe("/api/tenant/switch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.requireTenantMembership.mockResolvedValue({
      tenantId,
      tenantLabel: "Demo Tenant",
      roleSlug: "owner",
    });
    routeMocks.switchSessionTenant.mockResolvedValue(true);
  });

  it("rejects invalid JSON bodies before checking memberships", async () => {
    const request = new Request("http://localhost/api/tenant/switch", {
      method: "POST",
      body: "{",
      headers: { "content-type": "application/json" },
    });

    await expect(POST(event({ request }))).rejects.toMatchObject({
      status: 400,
      body: { message: "Invalid JSON body" },
    });
    expect(routeMocks.requireTenantMembership).not.toHaveBeenCalled();
  });

  it("requires a UUID tenant id", async () => {
    const request = new Request("http://localhost/api/tenant/switch", {
      method: "POST",
      body: new URLSearchParams({ tenantId: "demo", returnTo: "/app/usage" }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });

    await expect(POST(event({ request }))).rejects.toMatchObject({
      status: 400,
      body: { message: "Missing tenant id" },
    });
  });

  it("sets the tenant cookie, switches the session, and redirects to an app path", async () => {
    const cookies = cookieJar();
    const request = new Request("http://localhost/api/tenant/switch", {
      method: "POST",
      body: new URLSearchParams({ tenantId, returnTo: "/app/usage" }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });

    await expect(
      POST(event({ request, cookies, locals: { sessionId: "session-1" } })),
    ).rejects.toMatchObject({
      status: 303,
      location: "/app/usage",
    });
    expect(cookies.set).toHaveBeenCalledWith(
      "smrt_starter_tenant_id",
      tenantId,
      expect.objectContaining({ httpOnly: true, path: "/", sameSite: "lax" }),
    );
    expect(routeMocks.switchSessionTenant).toHaveBeenCalledWith(
      expect.objectContaining({ request }),
      tenantId,
      { db: { type: "postgres", url: "postgres://test" } },
    );
  });

  it("returns JSON for API callers", async () => {
    const request = new Request("http://localhost/api/tenant/switch", {
      method: "POST",
      body: JSON.stringify({ tenantId, returnTo: "https://example.com" }),
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
    });

    const response = await POST(event({ request }));

    await expect(response.json()).resolves.toEqual({
      tenantId,
      tenantLabel: "Demo Tenant",
      role: "owner",
    });
  });

  it("does not set a tenant cookie when the membership check denies the switch", async () => {
    routeMocks.requireTenantMembership.mockRejectedValue({
      status: 403,
      body: { message: "Denied" },
    });
    const cookies = cookieJar();
    const request = new Request("http://localhost/api/tenant/switch", {
      method: "POST",
      body: JSON.stringify({ tenantId, returnTo: "/app" }),
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
    });

    await expect(POST(event({ request, cookies }))).rejects.toMatchObject({ status: 403 });
    expect(cookies.set).not.toHaveBeenCalled();
    expect(routeMocks.switchSessionTenant).not.toHaveBeenCalled();
  });
});

function event({
  request,
  cookies = cookieJar(),
  locals = {},
}: {
  request: Request;
  cookies?: ReturnType<typeof cookieJar>;
  locals?: Record<string, unknown>;
}) {
  return {
    request,
    cookies,
    locals: { tenantId, ...locals },
    url: new URL(request.url),
  } as unknown as Parameters<typeof POST>[0];
}

function cookieJar() {
  return {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  };
}
