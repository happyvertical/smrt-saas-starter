import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTenantCustomizationOverview: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("$lib/server/authz", () => ({
  requirePermission: mocks.requirePermission,
  starterPermissions: {
    fieldPolicyManage: "fields.policy.manage",
    settingsRead: "tenant.settings.read",
  },
}));

vi.mock("$lib/server/experience", () => ({
  getTenantCustomizationOverview: mocks.getTenantCustomizationOverview,
}));

import { load } from "./+layout.server";

describe("settings layout load", () => {
  it("renders the effective tenant settings heading", async () => {
    mocks.requirePermission.mockResolvedValue({
      tenantId: "tenant-a",
      permissions: ["tenant.settings.read"],
    });
    mocks.getTenantCustomizationOverview.mockResolvedValue({
      languages: [
        {
          key: "starter.settings.heading",
          locale: "en",
          previewText: "Acme workspace",
        },
      ],
    });

    await expect(load({ locals: {} } as Parameters<typeof load>[0])).resolves.toEqual({
      canConfigureSignupForm: false,
      settingsHeading: "Acme workspace",
    });
  });

  it("keeps the default heading when no override is available", async () => {
    mocks.requirePermission.mockResolvedValue({
      tenantId: "tenant-a",
      permissions: ["fields.policy.manage"],
    });
    mocks.getTenantCustomizationOverview.mockResolvedValue({ languages: [] });

    await expect(load({ locals: {} } as Parameters<typeof load>[0])).resolves.toEqual({
      canConfigureSignupForm: true,
      settingsHeading: "Tenant configuration",
    });
  });
});
