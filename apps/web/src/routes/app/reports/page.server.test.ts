import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTenantActivityReport: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("$lib/server/activity-report", () => ({
  getTenantActivityReport: mocks.getTenantActivityReport,
}));
vi.mock("$lib/server/authz", () => ({
  requirePermission: mocks.requirePermission,
  starterPermissions: { usageRead: "tenant.usage.read" },
}));

import { load } from "./+page.server";

describe("activity report route", () => {
  it("keeps the public ID column's sort state in the server query", async () => {
    mocks.requirePermission.mockResolvedValue({ tenantId: "tenant-a" });
    mocks.getTenantActivityReport.mockResolvedValue({ rows: [] });

    await load({
      locals: {},
      url: new URL("https://starter.test/app/reports?page=2&sort=id&direction=asc"),
    } as Parameters<typeof load>[0]);

    expect(mocks.getTenantActivityReport).toHaveBeenCalledWith("tenant-a", {
      page: 2,
      sort: "id",
      direction: "asc",
    });
  });
});
