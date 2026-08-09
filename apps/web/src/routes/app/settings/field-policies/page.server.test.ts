import { error } from "@sveltejs/kit";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadFieldPolicySettings: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("$lib/server/authz", () => ({
  requirePermission: mocks.requirePermission,
  starterPermissions: { fieldPolicyManage: "fields.policy.manage" },
}));

vi.mock("$lib/server/field-policy", () => ({
  loadFieldPolicySettings: mocks.loadFieldPolicySettings,
}));

import { load } from "./+page.server";

describe("field-policy control-panel load", () => {
  it("rejects a non-manager before loading the catalog", async () => {
    mocks.requirePermission.mockImplementationOnce(() => {
      throw error(403, "Forbidden");
    });

    await expect(
      load({
        locals: {},
        url: new URL("https://starter.test/app/settings/field-policies"),
      } as Parameters<typeof load>[0]),
    ).rejects.toMatchObject({ status: 403 });

    expect(mocks.requirePermission).toHaveBeenCalledWith({}, "fields.policy.manage");
    expect(mocks.loadFieldPolicySettings).not.toHaveBeenCalled();
  });
});
