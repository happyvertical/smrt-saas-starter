import { createDataQueryFingerprint } from "@happyvertical/smrt-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const profileA = "33333333-3333-4333-8333-333333333333";
const profileB = "44444444-4444-4444-8444-444444444444";
const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const asOf = "2026-09-10T12:00:00.000Z";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getAppDatabase: vi.fn(),
  withActiveTenant: vi.fn(),
  withSystemContext: vi.fn(),
  getDescriptor: vi.fn(),
  createRequestInput: vi.fn(),
  queryRows: vi.fn(),
  executeRows: vi.fn(),
  createSnapshot: vi.fn(),
  createRequest: vi.fn(),
  applyExport: vi.fn(),
  previewExport: vi.fn(),
  validateExecution: vi.fn(),
  validateArtifact: vi.fn(),
  getLifecycle: vi.fn(),
  reportDefinitionFingerprint: vi.fn(),
  createAssetRuntime: vi.fn(),
  storeSourceAsset: vi.fn(),
  serveAsset: vi.fn(),
  profileCollectionCreate: vi.fn(),
  auditCollectionCreate: vi.fn(),
  profileGet: vi.fn(),
  auditRecord: vi.fn(),
}));

vi.mock("@happyvertical/smrt-assets", () => ({
  createAssetRuntime: mocks.createAssetRuntime,
  serveAsset: mocks.serveAsset,
}));
vi.mock("@happyvertical/smrt-profiles", () => ({
  ProfileCollection: { create: mocks.profileCollectionCreate },
  AuditLogCollection: { create: mocks.auditCollectionCreate },
}));
vi.mock("@happyvertical/smrt-reports", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@happyvertical/smrt-reports")>()),
  applyReportExport: mocks.applyExport,
  getReportLifecycle: mocks.getLifecycle,
  previewReportExport: mocks.previewExport,
  validateReportExportArtifact: mocks.validateArtifact,
}));
vi.mock(
  "@happyvertical/smrt-saas-objects",
  async (importOriginal) =>
    await importOriginal<typeof import("@happyvertical/smrt-saas-objects")>(),
);
vi.mock("@happyvertical/smrt-tenancy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@happyvertical/smrt-tenancy")>()),
  withSystemContext: mocks.withSystemContext,
}));
vi.mock("$lib/server/activity-report", async (importOriginal) => ({
  ...(await importOriginal<typeof import("$lib/server/activity-report")>()),
  executeTenantActivityReportRequest: mocks.executeRows,
  queryTenantActivityReportRows: mocks.queryRows,
}));
vi.mock("$lib/server/authz", () => ({
  requirePermission: mocks.requirePermission,
  starterPermissions: { reportExport: "reports.export", reportRefresh: "reports.refresh" },
}));
vi.mock("$lib/server/db", () => ({ getAppDatabase: mocks.getAppDatabase }));
vi.mock("$lib/server/tenant-context", () => ({ withActiveTenant: mocks.withActiveTenant }));

import { downloadActivityReportExport, executeActivityReportExport } from "./report-actions";

let descriptor: Awaited<
  ReturnType<typeof import("$lib/server/activity-report")["getTenantActivityReportDescriptor"]>
>;
const database = {
  transaction: vi.fn(
    async (callback: (tx: typeof database) => unknown) => await callback(database),
  ),
  query: vi.fn(),
};

let membership: { userId: string; tenantId: string; profileId: string } | null = {
  userId: userA,
  tenantId: tenantA,
  profileId: profileA,
};
let stored: { metadata: Record<string, unknown>; bytes: Buffer } | undefined;

function snapshotContext(request: any, bindingId = request.snapshot.binding.id) {
  const snapshot = request.snapshot;
  return {
    requiredPermission: "reports.export",
    resourceId: snapshot.resourceId,
    definitionFingerprint: snapshot.definitionFingerprint,
    queryFingerprint: snapshot.queryFingerprint,
    asOf: snapshot.snapshot.asOf,
    bindingId,
  };
}

function storedAsset(metadata: Record<string, unknown>) {
  return { getMetadata: () => metadata };
}

async function createStoredExport() {
  await executeActivityReportExport({} as never, { phase: "apply", format: "csv" });
  if (!stored) throw new Error("Expected export to be stored");
  return stored;
}

describe("activity report export service boundaries", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    membership = { userId: userA, tenantId: tenantA, profileId: profileA };
    descriptor = await (
      await vi.importActual<typeof import("$lib/server/activity-report")>(
        "$lib/server/activity-report",
      )
    ).getTenantActivityReportDescriptor();
    stored = undefined;
    database.query.mockResolvedValue(undefined);
    mocks.requirePermission.mockImplementation(async () => membership);
    mocks.getAppDatabase.mockResolvedValue(database);
    mocks.withActiveTenant.mockImplementation(
      async (_tenantId: string, callback: () => unknown) => await callback(),
    );
    mocks.withSystemContext.mockImplementation(async (callback: () => unknown) => await callback());
    const requestInput = (
      await vi.importActual<typeof import("$lib/server/activity-report")>(
        "$lib/server/activity-report",
      )
    ).createTenantActivityReportRequest(tenantA);
    mocks.queryRows.mockResolvedValue({
      queryFingerprint: createDataQueryFingerprint(requestInput, descriptor.schema),
      identityField: "id",
      total: { kind: "exact", value: 1 },
      freshness: { state: "fresh", asOf },
      truncated: false,
      reportLifecycle: { snapshot: { asOf } },
    });
    mocks.getLifecycle.mockResolvedValue({ asOf });
    mocks.validateArtifact.mockImplementation((_descriptor: unknown, artifact: any) => artifact);
    mocks.executeRows.mockResolvedValue({
      rows: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          metric_key: "api.calls",
          window_start: asOf,
          quantity: 1,
        },
      ],
    });
    mocks.applyExport.mockImplementation(async (_descriptor: unknown, request: any, host: any) => {
      await host.authorize({ requiredPermission: "reports.export" });
      await host.assertSnapshot(snapshotContext(request));
      await host.audit({
        phase: "apply",
        requiredPermission: "reports.export",
        resourceId: descriptor.resourceId,
        queryFingerprint: request.snapshot.queryFingerprint,
      });
      return { execution: "stream", request };
    });
    mocks.storeSourceAsset.mockImplementation(
      async (_name: string, bytes: Buffer, options: any) => {
        stored = { metadata: options.metadata, bytes };
        return { id: "asset-1" };
      },
    );
    mocks.createAssetRuntime.mockResolvedValue({ storeSourceAsset: mocks.storeSourceAsset });
    mocks.profileCollectionCreate.mockResolvedValue({ get: mocks.profileGet });
    mocks.auditCollectionCreate.mockResolvedValue({ record: mocks.auditRecord });
    mocks.profileGet.mockResolvedValue({ id: profileA });
    mocks.auditRecord.mockResolvedValue(undefined);
  });

  it("checks export permission at apply and inside the render transaction", async () => {
    await executeActivityReportExport({} as never, { phase: "apply", format: "csv" });

    expect(mocks.requirePermission).toHaveBeenCalledWith(
      expect.anything(),
      "reports.export",
      tenantA,
    );
    expect(database.query).toHaveBeenCalledWith(
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    expect(mocks.queryRows).toHaveBeenCalledWith(
      tenantA,
      {},
      expect.objectContaining({ db: database, lifecycle: true, execution: "silent" }),
    );
  });

  it("rejects persistence when membership is revoked after the real render validation", async () => {
    let auditCountAtRevocation = -1;
    mocks.requirePermission.mockImplementation(async () => {
      if (!membership) throw new Error("No active membership for this tenant");
      return membership;
    });
    mocks.executeRows.mockImplementationOnce(async () => {
      auditCountAtRevocation = mocks.auditRecord.mock.calls.length;
      membership = null;
      return {
        rows: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            metric_key: "api.calls",
            window_start: asOf,
            quantity: 1,
          },
        ],
      };
    });

    await expect(
      executeActivityReportExport({} as never, { phase: "apply", format: "csv" }),
    ).rejects.toThrow("No active membership");

    expect(mocks.createAssetRuntime).toHaveBeenCalledTimes(1);
    expect(mocks.storeSourceAsset).not.toHaveBeenCalled();
    expect(stored).toBeUndefined();
    expect(mocks.auditRecord).toHaveBeenCalledTimes(auditCountAtRevocation);
  });

  it("rejects persistence when the materialization changes after the real render validation", async () => {
    let auditCountAtMutation = -1;
    mocks.executeRows.mockImplementationOnce(async () => {
      auditCountAtMutation = mocks.auditRecord.mock.calls.length;
      mocks.getLifecycle.mockResolvedValueOnce({ asOf: "2026-09-10T12:01:00.000Z" });
      return {
        rows: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            metric_key: "api.calls",
            window_start: asOf,
            quantity: 1,
          },
        ],
      };
    });

    await expect(
      executeActivityReportExport({} as never, { phase: "apply", format: "csv" }),
    ).rejects.toThrow("materialization changed before export");

    expect(mocks.createAssetRuntime).toHaveBeenCalledTimes(1);
    expect(mocks.storeSourceAsset).not.toHaveBeenCalled();
    expect(stored).toBeUndefined();
    expect(mocks.auditRecord).toHaveBeenCalledTimes(auditCountAtMutation);
  });

  it("bounds a page read by the remaining PostgreSQL deadline and rejects an overdue result", async () => {
    let now = 0;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);
    mocks.executeRows.mockImplementationOnce(async () => {
      now = 10_001;
      return {
        rows: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            metric_key: "api.calls",
            window_start: asOf,
            quantity: 1,
          },
        ],
      };
    });

    try {
      await expect(
        executeActivityReportExport({} as never, { phase: "apply", format: "csv" }),
      ).rejects.toThrow("foreground deadline");
    } finally {
      nowSpy.mockRestore();
    }

    expect(database.query).toHaveBeenCalledWith(
      "SELECT set_config('statement_timeout', $1, true)",
      "10000ms",
    );
    expect(mocks.createAssetRuntime).not.toHaveBeenCalled();
    expect(mocks.storeSourceAsset).not.toHaveBeenCalled();
    expect(stored).toBeUndefined();
    expect(mocks.auditRecord).toHaveBeenCalledTimes(1);
  });

  it("rejects before rows or storage when lifecycle changes after query", async () => {
    mocks.getLifecycle.mockResolvedValueOnce({ asOf: "2026-09-10T12:01:00.000Z" });

    await expect(
      executeActivityReportExport({} as never, { phase: "apply", format: "csv" }),
    ).rejects.toThrow("materialization changed before export");

    expect(mocks.executeRows).not.toHaveBeenCalled();
    expect(mocks.createAssetRuntime).not.toHaveBeenCalled();
  });

  it("rejects a changed principal before the real snapshot render", async () => {
    mocks.applyExport.mockImplementationOnce(
      async (_descriptor: unknown, request: any, host: any) => {
        await host.authorize({ requiredPermission: "reports.export" });
        await host.assertSnapshot(snapshotContext(request));
        membership = { userId: userB, tenantId: tenantA, profileId: profileB };
        return { execution: "stream", request };
      },
    );

    await expect(
      executeActivityReportExport({} as never, { phase: "apply", format: "csv" }),
    ).rejects.toThrow("principal is no longer current");
    expect(mocks.executeRows).not.toHaveBeenCalled();
    expect(mocks.createAssetRuntime).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a different tenant",
      () => ({ userId: userA, tenantId: tenantB, profileId: profileA }),
      "denied",
    ],
    [
      "a different principal",
      () => ({ userId: userB, tenantId: tenantA, profileId: profileB }),
      "denied",
    ],
    [
      "tampered metadata",
      () => ({ userId: userA, tenantId: tenantA, profileId: profileA }),
      "metadata",
    ],
    [
      "tampered content",
      () => ({ userId: userA, tenantId: tenantA, profileId: profileA }),
      "content",
    ],
  ])("denies stored download for %s without auditing", async (_label, nextMembership, tampering) => {
    const exportAsset = await createStoredExport();
    membership = nextMembership();
    mocks.auditRecord.mockClear();
    const metadata =
      tampering === "metadata"
        ? { ...exportAsset.metadata, fieldPolicy: "altered" }
        : exportAsset.metadata;
    mocks.serveAsset.mockImplementationOnce(async ({ canAccess }: any) => {
      if (!canAccess(storedAsset(metadata))) return new Response("forbidden", { status: 403 });
      return new Response(tampering === "content" ? "changed" : new Uint8Array(exportAsset.bytes), {
        status: 200,
      });
    });

    const response = await downloadActivityReportExport({} as never, "asset-1");

    expect(response.ok).toBe(false);
    expect(mocks.auditRecord).not.toHaveBeenCalled();
  });

  it("serves an owner-bound intact export and audits the download", async () => {
    const exportAsset = await createStoredExport();
    mocks.auditRecord.mockClear();
    mocks.serveAsset.mockImplementationOnce(async ({ canAccess }: any) => {
      if (!canAccess(storedAsset(exportAsset.metadata)))
        return new Response("forbidden", { status: 403 });
      return new Response(new Uint8Array(exportAsset.bytes), { status: 200 });
    });

    const response = await downloadActivityReportExport({} as never, "asset-1");

    expect(response.status).toBe(200);
    expect(mocks.auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: "report.export.download", resourceId: "asset-1" }),
    );
  });
});
