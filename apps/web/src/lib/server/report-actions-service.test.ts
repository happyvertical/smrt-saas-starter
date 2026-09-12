import { beforeEach, describe, expect, it, vi } from "vitest";

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const profileA = "33333333-3333-4333-8333-333333333333";
const profileB = "44444444-4444-4444-8444-444444444444";
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
vi.mock("@happyvertical/smrt-reports", () => ({
  applyReportExport: mocks.applyExport,
  createReportExportPageRequest: vi.fn((_descriptor, request, offset) => ({
    ...request,
    page: { offset, limit: request.read.page.limit },
  })),
  createReportExportRequest: mocks.createRequest,
  createReportExportSnapshot: mocks.createSnapshot,
  getReportLifecycle: mocks.getLifecycle,
  previewReportExport: mocks.previewExport,
  reportDefinitionFingerprint: mocks.reportDefinitionFingerprint,
  validateReportExportArtifact: mocks.validateArtifact,
  validateReportExportExecution: mocks.validateExecution,
}));
vi.mock("@happyvertical/smrt-saas-objects", () => ({
  TenantActivityReport: class TenantActivityReport {},
}));
vi.mock("@happyvertical/smrt-tenancy", () => ({ withSystemContext: mocks.withSystemContext }));
vi.mock("$lib/server/activity-report", () => ({
  createTenantActivityReportRequest: mocks.createRequestInput,
  executeTenantActivityReportRequest: mocks.executeRows,
  getTenantActivityReportDescriptor: mocks.getDescriptor,
  queryTenantActivityReportRows: mocks.queryRows,
}));
vi.mock("$lib/server/authz", () => ({
  requirePermission: mocks.requirePermission,
  starterPermissions: { reportExport: "reports.export", reportRefresh: "reports.refresh" },
}));
vi.mock("$lib/server/db", () => ({ getAppDatabase: mocks.getAppDatabase }));
vi.mock("$lib/server/tenant-context", () => ({ withActiveTenant: mocks.withActiveTenant }));

import { downloadActivityReportExport, executeActivityReportExport } from "./report-actions";

const descriptor = { resourceId: "starter:TenantActivityReport#current" };
const database = {
  transaction: vi.fn(
    async (callback: (tx: typeof database) => unknown) => await callback(database),
  ),
  query: vi.fn(),
};

let membership = { tenantId: tenantA, profileId: profileA };
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

function exportRequest(snapshot: any) {
  return {
    execution: "stream",
    format: "csv",
    rowCount: 1,
    truncated: false,
    limits: { maxRows: 1000, maxBytes: 5 * 1024 * 1024, deadlineMs: 10_000 },
    read: { page: { limit: 1 } },
    snapshot,
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
  beforeEach(() => {
    vi.clearAllMocks();
    membership = { tenantId: tenantA, profileId: profileA };
    stored = undefined;
    database.query.mockResolvedValue(undefined);
    mocks.requirePermission.mockImplementation(async () => membership);
    mocks.getAppDatabase.mockResolvedValue(database);
    mocks.withActiveTenant.mockImplementation(
      async (_tenantId: string, callback: () => unknown) => await callback(),
    );
    mocks.withSystemContext.mockImplementation(async (callback: () => unknown) => await callback());
    mocks.getDescriptor.mockResolvedValue(descriptor);
    mocks.createRequestInput.mockReturnValue({ query: "tenant activity" });
    mocks.queryRows.mockResolvedValue({
      queryFingerprint: "query-v1",
      freshness: { asOf },
      reportLifecycle: { snapshot: { asOf } },
    });
    mocks.reportDefinitionFingerprint.mockReturnValue("definition-v1");
    mocks.createSnapshot.mockImplementation(
      (_descriptor: unknown, _input: unknown, result: any, options: { id: string }) => ({
        resourceId: descriptor.resourceId,
        definitionFingerprint: "definition-v1",
        queryFingerprint: result.queryFingerprint,
        snapshot: { asOf: result.reportLifecycle.snapshot.asOf },
        total: { value: 1 },
        binding: { id: options.id },
      }),
    );
    mocks.createRequest.mockImplementation((_descriptor: unknown, snapshot: any) =>
      exportRequest(snapshot),
    );
    mocks.getLifecycle.mockResolvedValue({ asOf });
    mocks.validateExecution.mockImplementation(
      async (_descriptor: unknown, request: any, host: any) => {
        await host.authorize({ requiredPermission: "reports.export" });
        await host.assertSnapshot(snapshotContext(request));
        return request;
      },
    );
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
    mocks.createAssetRuntime.mockResolvedValue({
      storeSourceAsset: vi.fn(async (_name: string, bytes: Buffer, options: any) => {
        stored = { metadata: options.metadata, bytes };
        return { id: "asset-1" };
      }),
    });
    mocks.profileCollectionCreate.mockResolvedValue({ get: mocks.profileGet });
    mocks.auditCollectionCreate.mockResolvedValue({ record: mocks.auditRecord });
    mocks.profileGet.mockResolvedValue({ id: profileA });
    mocks.auditRecord.mockResolvedValue(undefined);
  });

  it("rechecks export permission at apply and inside the render transaction", async () => {
    await executeActivityReportExport({} as never, { phase: "apply", format: "csv" });

    expect(mocks.requirePermission).toHaveBeenCalledTimes(3);
    expect(mocks.requirePermission).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      "reports.export",
      tenantA,
    );
    expect(mocks.requirePermission).toHaveBeenNthCalledWith(
      3,
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

  it("rejects before rows or storage when lifecycle changes after query", async () => {
    mocks.getLifecycle.mockResolvedValueOnce({ asOf: "2026-09-10T12:01:00.000Z" });

    await expect(
      executeActivityReportExport({} as never, { phase: "apply", format: "csv" }),
    ).rejects.toThrow("materialization changed before export");

    expect(mocks.executeRows).not.toHaveBeenCalled();
    expect(mocks.createAssetRuntime).not.toHaveBeenCalled();
  });

  it.each([
    ["another tenant", () => ({ tenantId: tenantB, profileId: profileA })],
    ["another principal", () => ({ tenantId: tenantA, profileId: profileB })],
  ])("rejects a snapshot binding fixed for %s", async (_label, nextMembership) => {
    await executeActivityReportExport({} as never, { phase: "preview", format: "csv" }).catch(
      () => undefined,
    );
    const bindingForFirstCaller = mocks.createSnapshot.mock.results.at(-1)?.value.binding.id;
    membership = nextMembership();
    mocks.applyExport.mockImplementationOnce(
      async (_descriptor: unknown, request: any, host: any) => {
        await host.authorize({ requiredPermission: "reports.export" });
        await host.assertSnapshot(snapshotContext(request, bindingForFirstCaller));
        return { execution: "stream", request };
      },
    );

    await expect(
      executeActivityReportExport({} as never, { phase: "apply", format: "csv" }),
    ).rejects.toThrow("snapshot binding is invalid");
    expect(mocks.executeRows).not.toHaveBeenCalled();
    expect(mocks.createAssetRuntime).not.toHaveBeenCalled();
  });

  it.each([
    ["a different tenant", () => ({ tenantId: tenantB, profileId: profileA }), "denied"],
    ["a different principal", () => ({ tenantId: tenantA, profileId: profileB }), "denied"],
    ["tampered metadata", () => ({ tenantId: tenantA, profileId: profileA }), "metadata"],
    ["tampered content", () => ({ tenantId: tenantA, profileId: profileA }), "content"],
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
