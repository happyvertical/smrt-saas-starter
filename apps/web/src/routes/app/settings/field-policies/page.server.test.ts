import { error } from "@sveltejs/kit";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn() }));

vi.mock("$lib/server/authz", () => ({
  requirePermission: mocks.requirePermission,
  starterPermissions: { fieldPolicyManage: "fields.policy.manage" },
}));

import { load } from "./+page.server";

describe("legacy field-policy redirect", () => {
  it("authorizes before redirecting to signup-form fields", async () => {
    mocks.requirePermission.mockResolvedValue({ tenantId: "tenant-a" });

    await expect(
      load({
        locals: {},
        url: new URL("https://starter.test/app/settings/field-policies?selected=key"),
      } as Parameters<typeof load>[0]),
    ).rejects.toMatchObject({
      status: 308,
      location: "/app/settings/signup-form-fields?selected=key",
    });

    expect(mocks.requirePermission).toHaveBeenCalledWith({}, "fields.policy.manage");
  });

  it("does not redirect a denied caller", async () => {
    mocks.requirePermission.mockImplementationOnce(() => {
      throw error(403, "Forbidden");
    });

    await expect(
      load({
        locals: {},
        url: new URL("https://starter.test/app/settings/field-policies"),
      } as Parameters<typeof load>[0]),
    ).rejects.toMatchObject({ status: 403 });
  });
});
