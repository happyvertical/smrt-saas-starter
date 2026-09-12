import { createHash, randomUUID } from "node:crypto";
import { type Asset, createAssetRuntime, serveAsset } from "@happyvertical/smrt-assets";
import { AuditLogCollection, ProfileCollection } from "@happyvertical/smrt-profiles";
import {
  applyReportExport,
  createReportExportPageRequest,
  createReportExportRequest,
  createReportExportSnapshot,
  getReportLifecycle,
  previewReportExport,
  type ReportExportActionContext,
  type ReportExportActionHost,
  type ReportExportArtifact,
  type ReportExportFormat,
  type ReportExportRequest,
  type ReportExportSnapshotContext,
  reportDefinitionFingerprint,
  validateReportExportArtifact,
  validateReportExportExecution,
} from "@happyvertical/smrt-reports";
import { TenantActivityReport } from "@happyvertical/smrt-saas-objects";
import { withSystemContext } from "@happyvertical/smrt-tenancy";
import {
  createTenantActivityReportRequest,
  executeTenantActivityReportRequest,
  getTenantActivityReportDescriptor,
  queryTenantActivityReportRows,
  type TenantActivityReportQuery,
} from "$lib/server/activity-report";
import { requirePermission, starterPermissions } from "$lib/server/authz";
import { getAppDatabase } from "$lib/server/db";
import { withActiveTenant } from "$lib/server/tenant-context";

type ReportRequestLocals = Parameters<typeof requirePermission>[0];
type AppDatabase = Awaited<ReturnType<typeof getAppDatabase>>;

const EXPORT_SCHEMA = "starter-report-export:v1";
const FIELD_POLICY = "activity-v1:id,metric_key,window_start,quantity";
const EXPORT_MAX_ROWS = 1_000;
const EXPORT_MAX_BYTES = 5 * 1024 * 1024;
const EXPORT_DEADLINE_MS = 10_000;
const EXPORT_TTL_MS = 24 * 60 * 60 * 1_000;

export class ReportActionInputError extends Error {}

export interface ActivityReportActionInput {
  phase: "preview" | "apply";
  format?: ReportExportFormat;
  query?: TenantActivityReportQuery;
}

export interface ActivityReportExportResult {
  phase: "preview" | "apply";
  execution: "stream";
  format: ReportExportFormat;
  rowCount: number;
  truncated: boolean;
  asOf: string;
  artifactId?: string;
  downloadUrl?: string;
  byteCount?: number;
  expiresAt?: string;
}

interface StoredExportMetadata {
  schema: typeof EXPORT_SCHEMA;
  tenantId: string;
  ownerProfileId: string;
  fieldPolicy: typeof FIELD_POLICY;
  artifact: ReportExportArtifact;
  contentSha256: string;
}

export async function executeActivityReportExport(
  locals: ReportRequestLocals,
  input: ActivityReportActionInput,
): Promise<ActivityReportExportResult> {
  if (!input.format) throw new ReportActionInputError("Export format is required");
  const membership = await requirePermission(locals, starterPermissions.reportExport);
  return await withActiveTenant(membership.tenantId, async () => {
    const db = await getAppDatabase();
    const descriptor = await getTenantActivityReportDescriptor();
    const query = input.query ?? {};
    const requestInput = createTenantActivityReportRequest(membership.tenantId, query);
    const result = await queryTenantActivityReportRows(membership.tenantId, query, {
      db,
      lifecycle: true,
      execution: "silent",
    });
    const asOf = result.reportLifecycle?.snapshot.asOf ?? result.freshness.asOf;
    if (!asOf) throw new ReportActionInputError("Refresh the report before exporting it");
    const bindingId = snapshotBindingId({
      tenantId: membership.tenantId,
      profileId: membership.profileId,
      resourceId: descriptor.resourceId,
      definitionFingerprint: reportDefinitionFingerprint(descriptor),
      queryFingerprint: result.queryFingerprint,
      asOf,
    });
    const snapshot = createReportExportSnapshot(descriptor, requestInput, result, {
      id: bindingId,
    });
    const request = createReportExportRequest(descriptor, snapshot, {
      format: input.format,
      limits: {
        maxRows: EXPORT_MAX_ROWS,
        maxBytes: EXPORT_MAX_BYTES,
        deadlineMs: EXPORT_DEADLINE_MS,
        foregroundRowLimit: EXPORT_MAX_ROWS,
      },
    });
    if (request.execution !== "stream") {
      throw new ReportActionInputError(
        `This report exceeds the ${EXPORT_MAX_ROWS}-row foreground export limit`,
      );
    }
    const host = createExportHost(locals, membership.tenantId, membership.profileId, db, request);

    if (input.phase === "preview") {
      await previewReportExport(descriptor, request, host);
      return exportSummary("preview", request);
    }

    const applied = await applyReportExport(descriptor, request, host);
    if (applied.execution !== "stream") {
      throw new Error("Foreground activity export unexpectedly queued");
    }
    const bytes = await renderExportInSnapshot(
      descriptor,
      applied.request,
      host,
      membership.tenantId,
      membership.profileId,
      db,
    );
    const expiresAt = new Date(Date.now() + EXPORT_TTL_MS).toISOString();
    const artifact: ReportExportArtifact = {
      id: randomUUID(),
      request: applied.request,
      progress: {
        state: "completed",
        rowCount: applied.request.rowCount,
        byteCount: bytes.byteLength,
        truncated: applied.request.truncated,
      },
      expiresAt,
    };
    validateReportExportArtifact(descriptor, artifact);
    const runtime = await createReportAssetRuntime(db);
    const asset = await runtime.storeSourceAsset(
      `tenant-activity-${artifact.id}.${input.format}`,
      bytes,
      {
        mimeType: input.format === "csv" ? "text/csv" : "application/json",
        typeSlug: "report-export",
        metadata: {
          schema: EXPORT_SCHEMA,
          tenantId: membership.tenantId,
          ownerProfileId: membership.profileId,
          fieldPolicy: FIELD_POLICY,
          artifact,
          contentSha256: sha256(bytes),
        } satisfies StoredExportMetadata,
      },
    );
    if (!asset.id) throw new Error("Stored report export is missing its asset id");

    return {
      ...exportSummary("apply", applied.request),
      artifactId: asset.id,
      downloadUrl: `/api/reports/activity/exports/${asset.id}`,
      byteCount: bytes.byteLength,
      expiresAt,
    };
  });
}

export async function downloadActivityReportExport(
  locals: ReportRequestLocals,
  assetId: string,
): Promise<Response> {
  const membership = await requirePermission(locals, starterPermissions.reportExport);
  return await withActiveTenant(membership.tenantId, async () => {
    const db = await getAppDatabase();
    const descriptor = await getTenantActivityReportDescriptor();
    const runtime = await createReportAssetRuntime(db);
    let expectedContentSha256: string | undefined;
    const response = await serveAsset({
      runtime,
      asset: assetId,
      tenantId: membership.tenantId,
      disposition: "attachment",
      canAccess: (asset) => {
        const metadata = validateStoredExportAccess(
          asset,
          descriptor,
          membership.tenantId,
          membership.profileId,
        );
        expectedContentSha256 = metadata?.contentSha256;
        return Boolean(metadata);
      },
    });
    if (response.ok) {
      const bytes = Buffer.from(await response.clone().arrayBuffer());
      if (!expectedContentSha256 || sha256(bytes) !== expectedContentSha256) {
        return new Response("Report export is unavailable", { status: 500 });
      }
      await auditReportAction(db, membership.tenantId, membership.profileId, {
        action: "report.export.download",
        resourceId: assetId,
        metadata: { reportClassName: TenantActivityReport.name },
      });
    }
    return response;
  });
}

export function parseActivityReportActionInput(value: unknown): ActivityReportActionInput {
  const input = plainObject(value, "Report action");
  exactKeys(input, ["phase", "format", "query"], "Report action");
  if (input.phase !== "preview" && input.phase !== "apply") {
    throw new ReportActionInputError("Report action phase is invalid");
  }
  if (input.format !== undefined && input.format !== "csv" && input.format !== "json") {
    throw new ReportActionInputError("Report export format is invalid");
  }
  return {
    phase: input.phase,
    ...(input.format ? { format: input.format } : {}),
    ...(input.query === undefined ? {} : { query: parseActivityQuery(input.query) }),
  };
}

function createExportHost(
  locals: ReportRequestLocals,
  tenantId: string,
  profileId: string,
  db: AppDatabase,
  request: ReportExportRequest,
): ReportExportActionHost {
  return {
    authorize: async (context) => {
      assertExportContext(context);
      await requirePermission(locals, starterPermissions.reportExport, tenantId);
    },
    assertSnapshot: async (context) => {
      await assertCurrentSnapshot(db, tenantId, profileId, request, context);
    },
    audit: async (context) => {
      await auditReportAction(db, tenantId, profileId, {
        action: `report.export.${context.phase}`,
        resourceId: context.resourceId,
        metadata: { format: request.format, queryFingerprint: context.queryFingerprint },
      });
    },
  };
}

async function assertCurrentSnapshot(
  db: AppDatabase,
  tenantId: string,
  profileId: string,
  request: ReportExportRequest,
  context: ReportExportSnapshotContext,
) {
  const lifecycle = await withActiveTenant(tenantId, async () =>
    getReportLifecycle(TenantActivityReport, { db }),
  );
  if (!lifecycle.asOf || lifecycle.asOf !== context.asOf) {
    throw new ReportActionInputError("The report materialization changed before export");
  }
  const expected = snapshotBindingId({
    tenantId,
    profileId,
    resourceId: context.resourceId,
    definitionFingerprint: context.definitionFingerprint,
    queryFingerprint: context.queryFingerprint,
    asOf: context.asOf,
  });
  if (context.bindingId !== expected || request.snapshot.binding.id !== expected) {
    throw new ReportActionInputError("The report export snapshot binding is invalid");
  }
}

async function renderExportInSnapshot(
  descriptor: Awaited<ReturnType<typeof getTenantActivityReportDescriptor>>,
  request: ReportExportRequest,
  host: ReportExportActionHost,
  tenantId: string,
  profileId: string,
  db: AppDatabase,
): Promise<Buffer> {
  if (!db.transaction) throw new Error("Report export requires transactional database reads");
  return await db.transaction(async (tx) => {
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const txHost: ReportExportActionHost = {
      ...host,
      assertSnapshot: async (context) => {
        await assertCurrentSnapshot(tx, tenantId, profileId, request, context);
      },
    };
    const verified = await validateReportExportExecution(descriptor, request, txHost);
    const startedAt = Date.now();
    const rows: Array<Record<string, unknown>> = [];
    for (let offset = 0; offset < verified.rowCount; offset += verified.read.page.limit) {
      if (Date.now() - startedAt > verified.limits.deadlineMs) {
        throw new ReportActionInputError("Report export exceeded its foreground deadline");
      }
      const pageRequest = createReportExportPageRequest(descriptor, verified, offset);
      const page = await executeTenantActivityReportRequest(tenantId, pageRequest, {
        db: tx,
        execution: "silent",
      });
      rows.push(...page.rows.map(projectExportRow));
    }
    const bytes = serializeExport(verified.format, rows, verified);
    if (bytes.byteLength > verified.limits.maxBytes) {
      throw new ReportActionInputError("Report export exceeds its byte limit");
    }
    return bytes;
  });
}

function projectExportRow(row: Record<string, unknown>) {
  return {
    id: requiredString(row.id, "id"),
    metric_key: requiredString(row.metric_key, "metric_key"),
    window_start: requiredIsoString(row.window_start),
    quantity: requiredNumber(row.quantity),
  };
}

function serializeExport(
  format: ReportExportFormat,
  rows: Array<Record<string, unknown>>,
  request: ReportExportRequest,
): Buffer {
  if (format === "json") {
    return Buffer.from(
      `${JSON.stringify({ rows, total: request.snapshot.total.value, truncated: request.truncated, asOf: request.snapshot.snapshot.asOf })}\n`,
    );
  }
  const lines = ["id,metric_key,window_start,quantity"];
  for (const row of rows) {
    lines.push([row.id, row.metric_key, row.window_start, row.quantity].map(csvCell).join(","));
  }
  return Buffer.from(`${lines.join("\n")}\n`);
}

function validateStoredExportAccess(
  asset: Asset,
  descriptor: Awaited<ReturnType<typeof getTenantActivityReportDescriptor>>,
  tenantId: string,
  profileId: string,
): StoredExportMetadata | null {
  try {
    const metadata = parseStoredExportMetadata(asset.getMetadata());
    if (metadata.tenantId !== tenantId || metadata.ownerProfileId !== profileId) return null;
    const artifact = validateReportExportArtifact(descriptor, metadata.artifact);
    const snapshot = artifact.request.snapshot;
    if (
      snapshot.binding.id !==
      snapshotBindingId({
        tenantId,
        profileId,
        resourceId: snapshot.resourceId,
        definitionFingerprint: snapshot.definitionFingerprint,
        queryFingerprint: snapshot.queryFingerprint,
        asOf: snapshot.snapshot.asOf,
      })
    )
      return null;
    return metadata;
  } catch {
    return null;
  }
}

function parseStoredExportMetadata(value: unknown): StoredExportMetadata {
  const input = plainObject(value, "Stored report export");
  exactKeys(
    input,
    ["schema", "tenantId", "ownerProfileId", "fieldPolicy", "artifact", "contentSha256"],
    "Stored report export",
  );
  if (
    input.schema !== EXPORT_SCHEMA ||
    input.fieldPolicy !== FIELD_POLICY ||
    typeof input.tenantId !== "string" ||
    typeof input.ownerProfileId !== "string" ||
    typeof input.contentSha256 !== "string"
  ) {
    throw new ReportActionInputError("Stored report export metadata is invalid");
  }
  return input as unknown as StoredExportMetadata;
}

async function createReportAssetRuntime(db: AppDatabase) {
  return await createAssetRuntime({
    db,
    storage: process.env.SMRT_STARTER_ASSET_STORAGE_PATH ?? ".runtime/assets",
  });
}

async function auditReportAction(
  db: AppDatabase,
  tenantId: string,
  profileId: string,
  entry: { action: string; resourceId: string; metadata: Record<string, unknown> },
) {
  const profiles = await ProfileCollection.create({ db });
  const profile = await withSystemContext(() => profiles.get({ id: profileId }));
  if (!profile) throw new Error("Report action profile could not be resolved");
  const logs = await AuditLogCollection.create({ db });
  await withActiveTenant(tenantId, async () => {
    await logs.record({
      profile,
      action: entry.action,
      resourceType: "Report",
      resourceId: entry.resourceId,
      source: "web",
      metadata: entry.metadata,
    });
  });
}

function exportSummary(
  phase: "preview" | "apply",
  request: ReportExportRequest,
): ActivityReportExportResult {
  return {
    phase,
    execution: "stream",
    format: request.format,
    rowCount: request.rowCount,
    truncated: request.truncated,
    asOf: request.snapshot.snapshot.asOf,
  };
}

function snapshotBindingId(input: {
  tenantId: string;
  profileId: string;
  resourceId: string;
  definitionFingerprint: string;
  queryFingerprint: string;
  asOf: string;
}) {
  return sha256(Buffer.from(JSON.stringify({ version: 1, fieldPolicy: FIELD_POLICY, ...input })));
}

function assertExportContext(context: ReportExportActionContext) {
  if (context.requiredPermission !== starterPermissions.reportExport) {
    throw new Error("Unexpected report export permission");
  }
}

function parseActivityQuery(value: unknown): TenantActivityReportQuery {
  const query = plainObject(value, "Report query");
  exactKeys(query, ["page", "pageSize", "sort", "direction", "metricKey"], "Report query");
  const result: TenantActivityReportQuery = {};
  if (query.page !== undefined) result.page = positiveInteger(query.page, "page", 10_000);
  if (query.pageSize !== undefined)
    result.pageSize = positiveInteger(query.pageSize, "pageSize", 100);
  if (query.sort !== undefined) {
    if (!["id", "metric_key", "window_start", "quantity"].includes(String(query.sort))) {
      throw new ReportActionInputError("Report query sort is invalid");
    }
    result.sort = query.sort as TenantActivityReportQuery["sort"];
  }
  if (query.direction !== undefined) {
    if (query.direction !== "asc" && query.direction !== "desc") {
      throw new ReportActionInputError("Report query direction is invalid");
    }
    result.direction = query.direction;
  }
  if (query.metricKey !== undefined) {
    if (typeof query.metricKey !== "string" || query.metricKey.trim().length > 120) {
      throw new ReportActionInputError("Report query metricKey is invalid");
    }
    result.metricKey = query.metricKey.trim();
  }
  return result;
}

function plainObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ReportActionInputError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[], label: string) {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new ReportActionInputError(`${label} contains an unsupported field`);
  }
}

function positiveInteger(value: unknown, label: string, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new ReportActionInputError(`Report query ${label} is invalid`);
  }
  return value;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`Report result contained invalid ${field}`);
  return value;
}

function requiredIsoString(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error("Report result contained invalid window_start");
  return date.toISOString();
}

function requiredNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Report result contained invalid quantity");
  }
  return value;
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
