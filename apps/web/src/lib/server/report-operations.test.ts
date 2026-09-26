import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class NotFoundError extends Error {}
  return {
    NotFoundError,
    getAppDatabase: vi.fn(),
    requirePermission: vi.fn(),
    loadSessionContext: vi.fn(),
    withLockedReportOperation: vi.fn(),
  };
});

vi.mock("$lib/server/db", () => ({ getAppDatabase: mocks.getAppDatabase }));
vi.mock("$lib/server/authz", () => ({
  requirePermission: mocks.requirePermission,
  starterPermissions: { reportRefresh: "report.refresh", usageRead: "usage.read" },
}));
vi.mock("@happyvertical/smrt-users", () => ({
  SessionService: class {
    async initialize() {}
    loadSessionContext = mocks.loadSessionContext;
  },
}));
vi.mock("@happyvertical/smrt-tenancy", () => ({ withTenant: vi.fn() }));
vi.mock("@happyvertical/smrt-jobs", () => ({ SmrtJobCollection: {} }));
vi.mock("@happyvertical/smrt-saas-objects", () => ({
  ReportOperationNotFoundError: mocks.NotFoundError,
  withLockedReportOperation: mocks.withLockedReportOperation,
  ReportOperationCollection: {},
  createReportOperationRuntime: vi.fn(),
  normalizeActivityReportOperationQuery: vi.fn(),
  parseReportOperationJson: vi.fn(),
  reportOperationPayloadFingerprint: vi.fn(),
}));

import { decideReportOperation } from "./report-operations";

describe("report operation decisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAppDatabase.mockResolvedValue({});
    mocks.requirePermission.mockResolvedValue({
      userId: "user-1",
      tenantId: "tenant-1",
      profileId: "profile-1",
      devFallback: false,
    });
    mocks.loadSessionContext.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("maps a missing or foreign locked operation to a bounded 404 after human and membership gates", async () => {
    mocks.withLockedReportOperation.mockRejectedValue(
      new mocks.NotFoundError("Report operation not found"),
    );

    await expect(
      decideReportOperation(
        { sessionId: "real-session" } as App.Locals,
        "missing-operation",
        "approve",
        "exact-payload-fingerprint",
        "real-session",
      ),
    ).rejects.toMatchObject({ status: 404, body: { message: "Report operation not found" } });
    expect(mocks.requirePermission).toHaveBeenCalledOnce();
    expect(mocks.loadSessionContext).toHaveBeenCalledWith("real-session");
  });

  it("rejects a malformed ID after the session and membership gates without querying PostgreSQL", async () => {
    await expect(
      decideReportOperation(
        { sessionId: "real-session" } as App.Locals,
        "not-a-uuid",
        "approve",
        "fingerprint",
        "real-session",
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(mocks.requirePermission).toHaveBeenCalledOnce();
    expect(mocks.loadSessionContext).toHaveBeenCalledWith("real-session");
    expect(mocks.withLockedReportOperation).not.toHaveBeenCalled();
  });
});
