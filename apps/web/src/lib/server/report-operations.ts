import { randomUUID } from "node:crypto";
import { SmrtJobCollection } from "@happyvertical/smrt-jobs";
import {
  type ActivityReportOperationQuery,
  createReportOperationRuntime,
  normalizeActivityReportOperationQuery,
  parseReportOperationJson,
  type ReportOperation,
  ReportOperationCollection,
  type ReportOperationKind,
  type ReportOperationStatus,
  reportOperationPayloadFingerprint,
  withLockedReportOperation,
} from "@happyvertical/smrt-saas-objects";
import { withTenant } from "@happyvertical/smrt-tenancy";
import { SessionService } from "@happyvertical/smrt-users";
import { error } from "@sveltejs/kit";
import {
  requirePermission,
  type StarterMembershipContext,
  starterPermissions,
} from "$lib/server/authz";
import { getAppDatabase } from "$lib/server/db";

export interface ReportOperationDto {
  id: string;
  kind: ReportOperationKind;
  status: ReportOperationStatus;
  payloadFingerprint: string;
  query: Required<ActivityReportOperationQuery>;
  createdAt: string;
  jobId: string | null;
  decidedAt: string | null;
  errorCode: string | null;
  snapshot?: unknown;
}

export interface CreateReportOperationInput {
  kind: ReportOperationKind;
  requestId: string;
  query?: ActivityReportOperationQuery;
}

export async function listReportOperations(locals: App.Locals): Promise<ReportOperationDto[]> {
  const membership = await requirePermission(locals, starterPermissions.usageRead);
  return await withOwnerOperations(membership, async (collection) =>
    Promise.all(
      (
        await collection.list({
          where: { requesterUserId: membership.userId },
          orderBy: "created_at DESC",
          limit: 100,
        })
      ).map((operation) => currentDto(operation, membership)),
    ),
  );
}

export async function getReportOperation(
  locals: App.Locals,
  id: string,
): Promise<ReportOperationDto> {
  const membership = await requirePermission(locals, starterPermissions.usageRead);
  return currentDto(await requireOwnedOperation(membership, id), membership);
}

export async function createReportOperation(
  locals: App.Locals,
  input: CreateReportOperationInput,
): Promise<ReportOperationDto> {
  if (
    !input ||
    typeof input !== "object" ||
    Object.keys(input).some((key) => !["kind", "requestId", "query"].includes(key))
  )
    throw error(400, "Operation input is invalid");
  if (input.kind !== "prepare" && input.kind !== "approval-demo")
    throw error(400, "Operation kind is invalid");
  if (!isRequestId(input.requestId)) throw error(400, "requestId is invalid");
  const membership = await requirePermission(locals, starterPermissions.reportRefresh);
  let query: Required<ActivityReportOperationQuery>;
  try {
    query = normalizeActivityReportOperationQuery(input.query);
  } catch {
    throw error(400, "Report query is invalid");
  }
  const db = await getAppDatabase();
  if (typeof db.transaction !== "function")
    throw new Error("Report operations require PostgreSQL transactions");
  // Serialize stable submission IDs, including concurrent retries, before insert.
  const operation = await db.transaction(async (tx) => {
    await tx.query(
      "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))",
      `${membership.tenantId}:${input.requestId}`,
    );
    return withTenant({ tenantId: membership.tenantId }, async () => {
      const collection = await ReportOperationCollection.create({ db: tx });
      const existing = (
        await collection.list({ where: { requestId: input.requestId }, limit: 1 })
      )[0];
      if (existing) {
        const storedQuery = parseReportOperationJson<{ query: ActivityReportOperationQuery }>(
          existing.request,
        ).query;
        if (
          existing.requesterUserId !== membership.userId ||
          existing.kind !== input.kind ||
          JSON.stringify(normalizeActivityReportOperationQuery(storedQuery)) !==
            JSON.stringify(query)
        )
          throw error(409, "requestId conflicts with another operation");
        return existing;
      }
      const id = randomUUID();
      return collection.create({
        id,
        slug: `report-operation-${id}`,
        tenantId: membership.tenantId,
        kind: input.kind,
        status: input.kind === "approval-demo" ? "awaiting_approval" : "queued",
        requesterUserId: membership.userId,
        requesterProfileId: membership.profileId,
        requestId: input.requestId,
        payloadFingerprint: reportOperationPayloadFingerprint(
          {
            id,
            tenant_id: membership.tenantId,
            requester_user_id: membership.userId,
            kind: input.kind,
          },
          query,
        ),
        request: JSON.stringify({ query }),
      });
    });
  });
  if (operation.status === "queued" && !operation.jobId)
    await enqueueOperation(operation, membership);

  return toDto(operation);
}

export async function cancelReportOperation(
  locals: App.Locals,
  id: string,
): Promise<ReportOperationDto> {
  const membership = await requirePermission(locals, starterPermissions.reportRefresh);
  const db = await getAppDatabase();
  await withLockedReportOperation(db, id, membership, async (tx, row) => {
    if (["committed", "cancelled", "declined"].includes(row.status)) return;
    if (row.job_id) {
      const job = await (await SmrtJobCollection.create({ db: tx })).get(String(row.job_id));
      if (job && ["failed", "completed"].includes(job.status))
        throw error(409, "Operation outcome requires reconciliation");
    }
    if (["running", "recovery_required"].includes(row.status))
      throw error(409, "Operation outcome requires reconciliation");
    await tx.query(
      "UPDATE starter_report_operations SET status = 'cancelled', updated_at = ? WHERE id = ?",
      new Date().toISOString(),
      id,
    );
  });
  return toDto(await requireOwnedOperation(membership, id));
}

/** Browser-only route supplies a verified session id; this function never trusts a client actor. */
export async function decideReportOperation(
  locals: App.Locals,
  id: string,
  decision: "approve" | "decline",
  payloadFingerprint: string,
  sessionId: string | null | undefined,
): Promise<ReportOperationDto> {
  if (!sessionId || sessionId !== locals.sessionId)
    throw error(401, "A signed-in browser session is required");
  const membership = await requirePermission(locals, starterPermissions.reportRefresh);
  if (membership.devFallback) throw error(403, "Demo authentication cannot approve operations");
  const db = await getAppDatabase();
  const sessions = new SessionService({ db });
  await sessions.initialize();
  const session = await sessions.loadSessionContext(sessionId);
  if (!session || session.user.id !== membership.userId)
    throw error(401, "A current signed-in browser session is required");
  if (decision !== "approve" && decision !== "decline") throw error(400, "Decision is invalid");
  await withLockedReportOperation(db, id, membership, async (tx, row) => {
    const query = parseReportOperationJson<{ query: ActivityReportOperationQuery }>(
      row.request,
    ).query;
    if (
      payloadFingerprint !== row.payload_fingerprint ||
      reportOperationPayloadFingerprint(row, query) !== row.payload_fingerprint
    )
      throw error(409, "Approval payload no longer matches");
    if (row.kind !== "approval-demo") throw error(409, "Operation is not awaiting approval");
    if (
      row.status === "queued" &&
      decision === "approve" &&
      !row.job_id &&
      row.approved_fingerprint === row.payload_fingerprint &&
      row.decided_by_user_id === membership.userId
    )
      return;
    if (row.status !== "awaiting_approval") throw error(409, "Operation is not awaiting approval");
    await tx.query(
      "UPDATE starter_report_operations SET status = ?, decided_by_user_id = ?, decided_at = ?, approved_fingerprint = ?, updated_at = ? WHERE id = ?",
      decision === "approve" ? "queued" : "declined",
      membership.userId,
      new Date().toISOString(),
      decision === "approve" ? payloadFingerprint : null,
      new Date().toISOString(),
      id,
    );
  });
  const operation = await requireOwnedOperation(membership, id);
  if (decision === "approve") await enqueueOperation(operation, membership);
  return toDto(operation);
}

async function enqueueOperation(
  operation: ReportOperation,
  membership: StarterMembershipContext,
): Promise<void> {
  const runtime = createReportOperationRuntime({ db: await getAppDatabase() });
  try {
    const result = await runtime.enqueue(operation.id!, membership);
    if (!result.ok) throw error(409, result.reason ?? "Report operation could not be queued");
    operation.jobId =
      typeof result.details?.jobId === "string" ? result.details.jobId : operation.jobId;
  } finally {
    runtime.unregister();
  }
}

async function requireOwnedOperation(
  membership: StarterMembershipContext,
  id: string,
): Promise<ReportOperation> {
  return await withOwnerOperations(membership, async (collection) => {
    const operation = await collection.get(id);
    if (!operation || operation.requesterUserId !== membership.userId)
      throw error(404, "Report operation not found");
    return operation;
  });
}

async function withOwnerOperations<T>(
  membership: StarterMembershipContext,
  callback: (collection: ReportOperationCollection) => Promise<T>,
): Promise<T> {
  const db = await getAppDatabase();
  return await withTenant(
    { tenantId: membership.tenantId },
    async () => await callback(await ReportOperationCollection.create({ db })),
  );
}

async function currentDto(
  operation: ReportOperation,
  membership: StarterMembershipContext,
): Promise<ReportOperationDto> {
  const dto = toDto(operation);
  if (
    operation.status === "committed" &&
    membership.permissions.includes(starterPermissions.reportRefresh)
  ) {
    const runtime = createReportOperationRuntime({ db: await getAppDatabase() });
    try {
      await runtime.reconcile(operation.id!, membership);
    } finally {
      runtime.unregister();
    }
  }
  if (operation.status === "queued" && operation.jobId) {
    const job = await (await SmrtJobCollection.create({ db: await getAppDatabase() })).get(
      operation.jobId,
    );
    if (job?.status === "running") dto.status = "running";
    if (job && ["failed", "completed", "cancelled"].includes(job.status)) {
      dto.status = "recovery_required";
      dto.errorCode = "worker_outcome_requires_reconciliation";
    }
  }
  return dto;
}

function toDto(operation: ReportOperation): ReportOperationDto {
  return {
    id: operation.id ?? "",
    kind: operation.kind,
    status: operation.status,
    payloadFingerprint: operation.payloadFingerprint,
    query: normalizeActivityReportOperationQuery(
      parseReportOperationJson<{ query: ActivityReportOperationQuery }>(operation.request).query,
    ),
    createdAt: operation.created_at?.toISOString?.() ?? new Date().toISOString(),
    jobId: operation.jobId,
    decidedAt: operation.decidedAt?.toISOString() ?? null,
    errorCode: operation.errorCode,
    ...(operation.snapshot ? { snapshot: parseReportOperationJson(operation.snapshot) } : {}),
  };
}

function isRequestId(value: string): boolean {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value);
}
