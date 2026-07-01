import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createService: vi.fn(),
  withSystemContext: vi.fn(),
  generateWelcomeMagicLink: vi.fn(),
  seedDefaultTenantSubscription: vi.fn(),
  getAppDatabase: vi.fn(),
  getSmrtConfig: vi.fn(),
  isSuperUserEmail: vi.fn(),
}));

vi.mock("@happyvertical/smrt-users", () => ({
  AccessRequestError: class AccessRequestError extends Error {},
  AccessRequestStatus: {
    REQUESTED: "requested",
    APPROVED: "approved",
    GRADUATED: "graduated",
    DECLINED: "declined",
    CANCELED: "canceled",
  },
  AccessRequestService: { create: mocks.createService },
}));

vi.mock("@happyvertical/smrt-tenancy", () => ({
  withSystemContext: mocks.withSystemContext,
}));

vi.mock("$lib/server/accounts", () => ({
  generateWelcomeMagicLink: mocks.generateWelcomeMagicLink,
  seedDefaultTenantSubscription: mocks.seedDefaultTenantSubscription,
}));

vi.mock("$lib/server/db", () => ({ getAppDatabase: mocks.getAppDatabase }));
vi.mock("$lib/server/smrt", () => ({ getSmrtConfig: mocks.getSmrtConfig }));
vi.mock("$lib/server/super-users", () => ({ isSuperUserEmail: mocks.isSuperUserEmail }));

import { graduateAccessRequest } from "$lib/server/access-requests";

// Test doubles model the SMRT service loosely; `noExplicitAny` is off in biome.
type AnyRecord = Record<string, any>;

const operator = { userId: "op-1", email: "admin@example.com" };
const origin = "http://localhost:5173";

let capturedCreateOptions: AnyRecord | null = null;
let graduateOpts: AnyRecord | null = null;

function makeGraduate(result: AnyRecord, event?: AnyRecord) {
  return async (_id: string, opts: AnyRecord) => {
    graduateOpts = opts;
    if (event !== undefined) {
      await capturedCreateOptions?.onEvent?.(event);
    }
    return result;
  };
}

let currentGraduate: (id: string, opts: AnyRecord) => Promise<AnyRecord>;

function graduatedEvent(email: string, opts: { withMembership?: boolean } = {}) {
  const withMembership = opts.withMembership ?? true;
  return {
    type: "access-request.graduated",
    accessRequest: { id: "ar", email, status: "graduated" },
    at: new Date("2026-07-01T00:00:00.000Z"),
    user: { email },
    // A tenant graduation attaches a membership; user-only graduation does not.
    ...(withMembership ? { membership: { id: "m-1" }, tenant: { id: "t", slug: "s" } } : {}),
  };
}

describe("graduateAccessRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    capturedCreateOptions = null;
    graduateOpts = null;

    mocks.isSuperUserEmail.mockReturnValue(true);
    mocks.getSmrtConfig.mockReturnValue({});
    mocks.getAppDatabase.mockResolvedValue({ query: vi.fn(), upsert: vi.fn() });
    mocks.withSystemContext.mockImplementation((cb: () => unknown) => cb());
    mocks.seedDefaultTenantSubscription.mockResolvedValue(undefined);
    mocks.generateWelcomeMagicLink.mockResolvedValue({
      email: "grad@example.com",
      expiresAt: new Date("2026-07-01T00:10:00.000Z"),
      verificationUrl: "http://localhost:5173/login/verify?token=welcome",
    });
    mocks.createService.mockImplementation(async (options: AnyRecord) => {
      capturedCreateOptions = options;
      return {
        graduateAccessRequest: (id: string, opts: AnyRecord) => currentGraduate(id, opts),
      };
    });
  });

  it("graduates into a new tenant, seeds a subscription, and sends a welcome link", async () => {
    const accessRequest = { id: "ar-1", email: "grad@example.com", status: "graduated" };
    currentGraduate = makeGraduate(
      { accessRequest, tenant: { id: "t-new", slug: "acme" }, user: { email: "grad@example.com" } },
      graduatedEvent("grad@example.com"),
    );

    const summary = await graduateAccessRequest(operator, "ar-1", {
      tenantName: " Acme ",
      origin,
    });

    expect(graduateOpts).toMatchObject({
      by: "op-1",
      allowFromRequested: true,
      tenant: { create: { name: "Acme" } },
    });
    expect(mocks.seedDefaultTenantSubscription).toHaveBeenCalledWith(expect.anything(), {
      id: "t-new",
      slug: "acme",
    });
    expect(mocks.generateWelcomeMagicLink).toHaveBeenCalledWith({
      email: "grad@example.com",
      origin,
    });
    expect(summary).toMatchObject({ id: "ar-1", email: "grad@example.com", status: "graduated" });
  });

  it("graduates into an existing tenant WITHOUT re-seeding a subscription", async () => {
    const accessRequest = { id: "ar-2", email: "grad@example.com", status: "graduated" };
    currentGraduate = makeGraduate(
      {
        accessRequest,
        tenant: { id: "t-existing", slug: "existing" },
        user: { email: "grad@example.com" },
      },
      graduatedEvent("grad@example.com"),
    );

    await graduateAccessRequest(operator, "ar-2", {
      tenant: { tenantId: "t-existing", role: "admin" },
      origin,
    });

    expect(graduateOpts?.tenant).toEqual({ tenantId: "t-existing", role: "admin" });
    expect(mocks.seedDefaultTenantSubscription).not.toHaveBeenCalled();
    expect(mocks.generateWelcomeMagicLink).toHaveBeenCalledWith({
      email: "grad@example.com",
      origin,
    });
  });

  it("defaults the existing-tenant role to the service default when none given", async () => {
    const accessRequest = { id: "ar-3", email: "grad@example.com", status: "graduated" };
    currentGraduate = makeGraduate({ accessRequest, tenant: { id: "t-existing", slug: "x" } });

    await graduateAccessRequest(operator, "ar-3", {
      tenant: { tenantId: "t-existing", role: null },
    });

    expect(graduateOpts?.tenant).toEqual({ tenantId: "t-existing" });
    expect(mocks.seedDefaultTenantSubscription).not.toHaveBeenCalled();
  });

  it("graduates a user only (no tenant) and sends NO welcome link", async () => {
    const accessRequest = { id: "ar-4", email: "grad@example.com", status: "graduated" };
    currentGraduate = makeGraduate(
      { accessRequest, user: { email: "grad@example.com" } },
      graduatedEvent("grad@example.com", { withMembership: false }),
    );

    await graduateAccessRequest(operator, "ar-4", { origin });

    expect(graduateOpts?.tenant).toBe("none");
    expect(mocks.seedDefaultTenantSubscription).not.toHaveBeenCalled();
    // No membership → the user cannot sign in yet, so no magic link is burned.
    expect(mocks.generateWelcomeMagicLink).not.toHaveBeenCalled();
  });

  it("prefers an existing tenant over a new-tenant name", async () => {
    const accessRequest = { id: "ar-5", email: "grad@example.com", status: "graduated" };
    currentGraduate = makeGraduate({
      accessRequest,
      tenant: { id: "t-existing", slug: "existing" },
    });

    await graduateAccessRequest(operator, "ar-5", {
      tenantName: "Ignored New Tenant",
      tenant: { tenantId: "t-existing" },
    });

    expect(graduateOpts?.tenant).toEqual({ tenantId: "t-existing" });
    expect(mocks.seedDefaultTenantSubscription).not.toHaveBeenCalled();
  });

  it("does not fail graduation when the welcome link cannot be sent", async () => {
    const accessRequest = { id: "ar-6", email: "grad@example.com", status: "graduated" };
    mocks.generateWelcomeMagicLink.mockRejectedValue(new Error("mail down"));
    currentGraduate = makeGraduate(
      { accessRequest, tenant: { id: "t-new", slug: "acme" } },
      graduatedEvent("grad@example.com"),
    );

    await expect(
      graduateAccessRequest(operator, "ar-6", { tenantName: "Acme", origin }),
    ).resolves.toMatchObject({ id: "ar-6" });
    expect(mocks.seedDefaultTenantSubscription).toHaveBeenCalled();
  });

  it("skips the welcome link when no origin is provided", async () => {
    const accessRequest = { id: "ar-7", email: "grad@example.com", status: "graduated" };
    currentGraduate = makeGraduate(
      { accessRequest, tenant: { id: "t-new", slug: "acme" } },
      graduatedEvent("grad@example.com"),
    );

    await graduateAccessRequest(operator, "ar-7", { tenantName: "Acme" });

    expect(mocks.generateWelcomeMagicLink).not.toHaveBeenCalled();
  });
});
