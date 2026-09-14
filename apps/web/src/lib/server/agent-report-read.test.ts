import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createReportDataSurfaceTools: vi.fn(() => [
    ...[
      "data.discover",
      "data.inspect",
      "data.query",
      "reports.query",
      "reports.refresh",
      "reports.export",
    ].map((slug) => ({
      slug,
      aiTool: { function: { description: slug } },
      execute: (...args: unknown[]) => mocks.execute(...args),
    })),
  ]),
  executeAsPrincipal: vi.fn(),
  registerPermissionDefinitions: vi.fn(),
  getTenantActivityReportDescriptor: vi.fn(),
  createTenantActivityReportRequest: vi.fn(),
  getAppDatabase: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@happyvertical/smrt-agents", () => ({
  createReportDataSurfaceTools: mocks.createReportDataSurfaceTools,
  executeAsPrincipal: mocks.executeAsPrincipal,
}));
vi.mock("@happyvertical/smrt-saas-objects", () => ({
  TenantActivityReport: class TenantActivityReport {},
}));
vi.mock("@happyvertical/smrt-users", () => ({
  registerPermissionDefinitions: mocks.registerPermissionDefinitions,
}));
vi.mock("$lib/server/activity-report", () => ({
  activityReportAdapterOptions: { tenantScope: "current" },
  createTenantActivityReportRequest: mocks.createTenantActivityReportRequest,
  getTenantActivityReportDescriptor: mocks.getTenantActivityReportDescriptor,
}));
vi.mock("$lib/server/db", () => ({ getAppDatabase: mocks.getAppDatabase }));

import {
  createTenantActivityReportQueryInput,
  executeTenantActivityReportAgentTool,
  getTenantActivityReportAgentTools,
  TenantActivityReportAgentReadError,
} from "$lib/server/agent-report-read";

const membership = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  permissions: ["tenant.usage.read"],
};

describe("tenant activity report agent read adapter", () => {
  beforeEach(() => {
    mocks.execute.mockClear();
    mocks.executeAsPrincipal.mockClear();
    mocks.getAppDatabase.mockClear();
    mocks.getTenantActivityReportDescriptor.mockClear();
    mocks.createTenantActivityReportRequest.mockClear();
    mocks.getAppDatabase.mockResolvedValue({ query: vi.fn() });
    mocks.executeAsPrincipal.mockImplementation(
      async (_options, callback) => await callback({ context: { tenantId: membership.tenantId } }),
    );
    mocks.execute.mockResolvedValue({ rows: [] });
    mocks.getTenantActivityReportDescriptor.mockResolvedValue({ resourceId: "report-id" });
    mocks.createTenantActivityReportRequest.mockReturnValue({ version: 1, requestId: "request" });
  });

  it("registers the existing usage read permission as the fixed report collection and excludes actions", () => {
    expect(mocks.registerPermissionDefinitions).toHaveBeenCalledWith([
      expect.objectContaining({ slug: "tenant.usage.read", collection: "tenant.usage" }),
    ]);
    expect(getTenantActivityReportAgentTools().map((tool) => tool.slug)).toEqual([
      "data.discover",
      "data.inspect",
      "data.query",
      "reports.query",
    ]);
  });

  it("binds a silent report query to the request membership instead of caller supplied tenant data", async () => {
    await executeTenantActivityReportAgentTool(membership, "reports.query", {
      reportId: "report-id",
      request: { tenantId: "other-tenant" },
      execution: "silent",
    });
    expect(mocks.executeAsPrincipal).toHaveBeenCalledWith(
      expect.objectContaining({
        principal: expect.objectContaining({
          runAsUserId: membership.userId,
          tenantId: membership.tenantId,
        }),
        permissions: ["tenant.usage.read"],
      }),
      expect.any(Function),
    );
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.objectContaining({ execution: "silent" }),
      }),
    );
  });

  it("denies an empty or revoked permission snapshot before opening the report database", async () => {
    await expect(
      executeTenantActivityReportAgentTool({ ...membership, permissions: [] }, "reports.query", {}),
    ).rejects.toBeInstanceOf(TenantActivityReportAgentReadError);
    expect(mocks.getAppDatabase).not.toHaveBeenCalled();
  });

  it("builds a server-owned silent query request", async () => {
    await expect(createTenantActivityReportQueryInput(membership.tenantId)).resolves.toEqual({
      reportId: "report-id",
      request: { version: 1, requestId: "request" },
      execution: "silent",
    });
    expect(mocks.createTenantActivityReportRequest).toHaveBeenCalledWith(membership.tenantId);
  });
});
