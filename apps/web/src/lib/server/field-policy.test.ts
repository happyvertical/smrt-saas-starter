import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  collectionCreate: vi.fn(),
  collectionGet: vi.fn(),
  createCollection: vi.fn(),
  getAppDatabase: vi.fn(),
  requireTenantMembership: vi.fn(),
  withTenant: vi.fn(async (_context: unknown, run: () => Promise<unknown>) => await run()),
}));

vi.mock("@happyvertical/smrt-fields", () => ({
  buildFieldPolicySettingsCatalog: vi.fn(),
  FieldPolicyCollection: { create: mocks.createCollection },
  resolveFieldPolicy: vi.fn(),
}));

vi.mock("@happyvertical/smrt-tenancy", () => ({
  withTenant: mocks.withTenant,
}));

vi.mock("$lib/server/authz", () => ({
  requireTenantMembership: mocks.requireTenantMembership,
}));

vi.mock("$lib/server/db", () => ({
  getAppDatabase: mocks.getAppDatabase,
}));

import {
  createFieldPolicy,
  deleteFieldPolicy,
  fieldPolicyActionResponse,
  loadFieldPolicyAudit,
  loadFieldPolicyEditorState,
  parseFieldPolicyMutation,
  resolveFieldPolicyBatch,
  updateFieldPolicy,
} from "$lib/server/field-policy";

const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

describe("starter field-policy transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAppDatabase.mockResolvedValue({ driver: "test" });
    mocks.requireTenantMembership.mockResolvedValue({
      tenantId,
      userId,
      permissions: ["fields.policy.personalize"],
    });
    mocks.createCollection.mockResolvedValue({
      create: mocks.collectionCreate,
      get: mocks.collectionGet,
    });
    mocks.collectionCreate.mockResolvedValue({ id: "policy-1" });
  });

  it("accepts only editable policy fields and discards forged ownership", () => {
    expect(
      parseFieldPolicyMutation({
        objectRef: "@happyvertical/smrt-saas-web:StarterAppSetting",
        fieldName: "value",
        scopeType: "user",
        defaultValue: "open",
        visibility: "advanced",
        tenantId: "forged-tenant",
        userId: "forged-user",
        updatedBy: "forged-updater",
        id: "forged-id",
      }),
    ).toEqual({
      objectRef: "@happyvertical/smrt-saas-web:StarterAppSetting",
      fieldName: "value",
      scopeType: "user",
      defaultValue: "open",
      displayOrder: null,
      help: null,
      label: null,
      locked: null,
      visibility: "advanced",
    });
  });

  it("creates through the verified membership context", async () => {
    const input = parseFieldPolicyMutation({
      objectRef: "@happyvertical/smrt-saas-web:StarterAppSetting",
      fieldName: "value",
      scopeType: "user",
    });

    await expect(createFieldPolicy({ tenantId } as App.Locals, input)).resolves.toEqual({
      id: "policy-1",
    });

    expect(mocks.requireTenantMembership).toHaveBeenCalledWith({ tenantId }, tenantId);
    expect(mocks.withTenant).toHaveBeenCalledWith(
      {
        tenantId,
        userId,
        permissions: new Set(["fields.policy.personalize"]),
      },
      expect.any(Function),
    );
    expect(mocks.createCollection).toHaveBeenCalledWith({ db: { driver: "test" } });
    expect(mocks.collectionCreate).toHaveBeenCalledWith(input);
  });

  it("preserves modeled 4xx action denials without promoting server failures", async () => {
    const denied = fieldPolicyActionResponse({
      ok: false,
      status: 403,
      code: "permission_denied",
      message: "Field-policy access denied.",
    });
    const failed = fieldPolicyActionResponse({ ok: false, status: 500, message: "private" });

    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({ code: "permission_denied" });
    expect(failed.status).toBe(200);
  });

  it("rejects malformed editable values", () => {
    expect(() =>
      parseFieldPolicyMutation({
        objectRef: "@happyvertical/smrt-saas-web:StarterAppSetting",
        fieldName: "value",
        scopeType: "user",
        displayOrder: Number.NaN,
      }),
    ).toThrowError(
      expect.objectContaining({
        status: 400,
        body: { message: "displayOrder must be a finite number or null." },
      }),
    );
  });

  it("rejects policy access outside the adopted object allowlist", async () => {
    expect(() =>
      parseFieldPolicyMutation({
        objectRef: "@happyvertical/smrt-users:User",
        fieldName: "email",
        scopeType: "user",
      }),
    ).toThrowError(
      expect.objectContaining({
        status: 404,
        body: { message: "Field-policy object is not exposed by this starter." },
      }),
    );

    expect(mocks.requireTenantMembership).not.toHaveBeenCalled();
    expect(mocks.createCollection).not.toHaveBeenCalled();

    await expect(
      loadFieldPolicyEditorState({ tenantId } as App.Locals, "@happyvertical/smrt-users:User"),
    ).rejects.toMatchObject({
      status: 404,
      body: { message: "Field-policy object is not exposed by this starter." },
    });
    expect(mocks.requireTenantMembership).not.toHaveBeenCalled();

    await expect(
      resolveFieldPolicyBatch({ tenantId } as App.Locals, ["@happyvertical/smrt-users:User"]),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      loadFieldPolicyAudit({ tenantId } as App.Locals, {
        objectRefs: ["@happyvertical/smrt-users:User"],
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(mocks.requireTenantMembership).not.toHaveBeenCalled();

    mocks.collectionGet.mockResolvedValue({
      objectRef: "@happyvertical/smrt-users:User",
      save: vi.fn(),
      delete: vi.fn(),
    });
    const allowedInput = parseFieldPolicyMutation({
      objectRef: "@happyvertical/smrt-saas-web:StarterAppSetting",
      fieldName: "value",
      scopeType: "tenant",
    });
    await expect(
      updateFieldPolicy({ tenantId } as App.Locals, "foreign-policy", allowedInput),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      deleteFieldPolicy({ tenantId } as App.Locals, "foreign-policy"),
    ).rejects.toMatchObject({ status: 404 });
  });
});
