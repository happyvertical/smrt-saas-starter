import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, createHmac } from "node:crypto";
import { type ExecuteAsPrincipalOptions, executeAsPrincipal } from "@happyvertical/smrt-agents";
import {
  createDataSurfaceActionAdapter,
  createJobsDataSurfaceBackgroundQueue,
  createSqlDataSurfaceActionStateStore,
  type DataSurfaceActionStateStore,
  type DataSurfaceBackgroundActionEnvelope,
  type DataSurfaceIdempotencyReservation,
  type DataSurfaceServerActionRequest,
  registerDataSurfaceBackgroundActionHandler,
} from "@happyvertical/smrt-agents/server";
import { withTenant } from "@happyvertical/smrt-tenancy";
import type { DataSurfaceActionResult, DataSurfaceDescriptor } from "@happyvertical/smrt-types";
import { registerPermissionDefinitions } from "@happyvertical/smrt-users";
import type { DatabaseInterface } from "@happyvertical/sql";
import {
  type ActivityReportOperationQuery,
  captureActivityReportSnapshot,
  normalizeActivityReportOperationQuery,
} from "./report-operations.js";

export const REPORT_OPERATION_HANDLER_ID = "smrt-saas-starter.report-operation.v1";
export interface ReportOperationPrincipal {
  userId: string;
  tenantId: string;
  profileId: string;
}
export interface ReportOperationRow extends Record<string, unknown> {
  id: string;
  tenant_id: string;
  requester_user_id: string;
  requester_profile_id: string;
  kind: string;
  status: string;
  request: unknown;
  payload_fingerprint: string;
  approved_fingerprint: string | null;
  decided_by_user_id: string | null;
  snapshot: unknown;
  execution_evidence: unknown;
}
export function parseReportOperationJson<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}
export function reportOperationPayloadFingerprint(
  row: Pick<ReportOperationRow, "id" | "tenant_id" | "requester_user_id" | "kind">,
  query: ActivityReportOperationQuery,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: 1,
        id: row.id,
        tenantId: row.tenant_id,
        owner: row.requester_user_id,
        kind: row.kind,
        query: normalizeActivityReportOperationQuery(query),
      }),
    )
    .digest("hex");
}
export async function authorizeReportOperationPrincipal(
  db: DatabaseInterface,
  principal: ReportOperationPrincipal,
): Promise<void> {
  const result = await db.query(
    `SELECT users.profile_id FROM memberships
    INNER JOIN users ON users.id = memberships.user_id
    INNER JOIN profiles ON profiles.id = users.profile_id
    INNER JOIN tenants ON tenants.id = memberships.tenant_id
    INNER JOIN roles ON roles.id = memberships.role_id
    WHERE memberships.user_id = ? AND memberships.tenant_id = ?
      AND memberships.status = 'active' AND users.status = 'active' AND tenants.status = 'active'
      AND profiles.tenant_id IS NULL AND profiles._meta_type = '@happyvertical/smrt-profiles:Person'
      AND profiles.email_key IS NOT NULL AND users.email_key = profiles.email_key
      AND roles.slug IN ('owner', 'admin')
      AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.email_key = users.email_key AND p.id <> users.profile_id)
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.profile_id = users.profile_id AND u.id <> users.id)
    LIMIT 1`,
    principal.userId,
    principal.tenantId,
  );
  if ((result.rows[0] as { profile_id?: string } | undefined)?.profile_id !== principal.profileId)
    throw new Error("Report operation authority denied");
}
export async function withLockedReportOperation<T>(
  db: DatabaseInterface,
  id: string,
  principal: ReportOperationPrincipal,
  fn: (tx: DatabaseInterface, row: ReportOperationRow) => Promise<T>,
): Promise<T> {
  if (typeof db.transaction !== "function")
    throw new Error("Report operations require PostgreSQL transactions");
  return db.transaction(async (tx) => {
    const result = await tx.query(
      "SELECT * FROM starter_report_operations WHERE id = ? AND tenant_id = ? AND requester_user_id = ? FOR UPDATE",
      id,
      principal.tenantId,
      principal.userId,
    );
    const row = result.rows[0] as ReportOperationRow | undefined;
    if (!row || row.requester_profile_id !== principal.profileId)
      throw new Error("Report operation not found");
    await authorizeReportOperationPrincipal(tx, principal);
    return fn(tx, row);
  });
}
export function reportOperationSigningKey(): string {
  const key = process.env.REPORT_REFRESH_SIGNING_KEY?.trim();
  if (!key || Buffer.byteLength(key) < 32)
    throw new Error("REPORT_REFRESH_SIGNING_KEY requires at least 32 bytes");
  return createHmac("sha256", key).update(REPORT_OPERATION_HANDLER_ID).digest("hex");
}
interface ExecutionEvidence {
  key: string;
  requestFingerprint: string;
  reservedAt: number;
  result: DataSurfaceActionResult;
  payloadFingerprint: string;
}
interface ExecutionScope {
  envelope: DataSurfaceBackgroundActionEnvelope;
  reservation?: DataSurfaceIdempotencyReservation & { key: string };
}
const identity = { surfaceId: "starter.report-operations", kind: "report" as const };
const actionDescriptor = {
  id: "capture",
  label: "Prepare report view",
  selectionScopes: ["explicit-ids" as const],
  requiresConfirmation: false,
};
const demoDescriptor = {
  ...actionDescriptor,
  id: "capture-demo",
  label: "Approval demonstration",
  requiresConfirmation: true,
};
const descriptor: DataSurfaceDescriptor = {
  version: 1,
  identity,
  schemaVersion: 1,
  label: "Report operations",
  rowKey: "id",
  columns: [],
  query: { modes: ["rows"], projectableColumnIds: [] },
  controls: [],
  actions: [actionDescriptor, demoDescriptor],
  limits: { maxQueryRows: 1, maxQueryBytes: 16384, maxSelectionSize: 1 },
};

// The public Jobs helper registers its callback process-wide. HTTP requests
// share one callback and reference-count its lifetime; only worker startup
// installs the executor that this callback may invoke.
type ReportOperationExecutor = (
  envelope: DataSurfaceBackgroundActionEnvelope,
) => Promise<DataSurfaceActionResult>;
interface ReportOperationRuntimeRegistry {
  registrations: Set<object>;
  executor?: ReportOperationExecutor;
  dispatch: ReportOperationExecutor;
}
// Vite SSR and native Node can evaluate this host module independently while
// sharing the framework's process-global handler registry. Share callback
// identity across those module copies as well as concurrent HTTP requests.
const registryKey = Symbol.for("smrt-saas-starter.report-operation-runtime.v1");
const globalRegistry = globalThis as unknown as {
  [key: symbol]: ReportOperationRuntimeRegistry | undefined;
};
globalRegistry[registryKey] ??= {
  registrations: new Set<object>(),
  async dispatch(envelope) {
    const executor = globalRegistry[registryKey]?.executor;
    if (!executor) throw new Error("Report operation worker is not registered");
    return executor(envelope);
  },
};
const sharedRuntime = globalRegistry[registryKey];
const runtimeRegistrations = sharedRuntime.registrations;
const dispatchReportOperation = sharedRuntime.dispatch;

/** Application host for the released SMRT action, SQL state, and durable jobs APIs. */
export function createReportOperationRuntime(options: {
  db: DatabaseInterface;
  signingKey?: string;
}) {
  const signingKey = options.signingKey ?? reportOperationSigningKey();
  if (Buffer.byteLength(signingKey) < 32)
    throw new Error("Report operation signing key requires at least 32 bytes");
  const registration = {};
  const unregisterPermission = registerPermissionDefinitions([
    {
      slug: "reports.refresh",
      collection: "reports",
      description: "Prepare a tenant report view.",
    },
  ]);
  const { db } = options;
  const execution = new AsyncLocalStorage<ExecutionScope>();
  const state = createSqlDataSurfaceActionStateStore({ db });
  const observedState = new Proxy(state, {
    get(target, property) {
      if (property === "reserveIdempotency")
        return async (key: string, reservation: DataSurfaceIdempotencyReservation) => {
          const result = await target.reserveIdempotency(key, reservation);
          const scope = execution.getStore();
          if (scope && result.status === "reserved" && result.ownerToken === reservation.ownerToken)
            scope.reservation = { ...reservation, key };
          return result;
        };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as DataSurfaceActionStateStore;
  const principalOptions = async (
    principal: ReportOperationPrincipal,
  ): Promise<ExecuteAsPrincipalOptions> => {
    await authorizeReportOperationPrincipal(db, principal);
    return {
      db,
      principal: {
        runAsUserId: principal.userId,
        tenantId: principal.tenantId,
        actsAsProfileId: principal.profileId,
        allowedTools: ["tenant.activity-report.prepare"],
      },
      onBehalfOfUserId: principal.userId,
    };
  };
  const executeDeferred = async (envelope: DataSurfaceBackgroundActionEnvelope) => {
    // Completed framework reservations replay before its deferred resolver runs.
    // Recheck live application authority even for those duplicate deliveries.
    const reference = envelope?.principal;
    if (
      !reference?.tenantId ||
      !reference.actsAsProfileId ||
      reference.onBehalfOfUserId !== reference.runAsUserId ||
      reference.agentClass
    )
      throw new Error("Invalid report principal binding");
    await authorizeReportOperationPrincipal(db, {
      userId: reference.runAsUserId,
      tenantId: reference.tenantId,
      profileId: reference.actsAsProfileId,
    });
    return execution.run({ envelope }, () => adapter.executeDeferred(envelope));
  };
  const queue = createJobsDataSurfaceBackgroundQueue({
    db,
    handlerId: REPORT_OPERATION_HANDLER_ID,
    queue: "reports",
    maxAttempts: 3,
    execute: dispatchReportOperation,
  });
  const adapter = createDataSurfaceActionAdapter({
    async runAsPrincipal(options, fn) {
      const principal = options.principal;
      if (!principal.tenantId || !principal.actsAsProfileId)
        throw new Error("Invalid report principal");
      await authorizeReportOperationPrincipal(db, {
        userId: principal.runAsUserId,
        tenantId: principal.tenantId,
        profileId: principal.actsAsProfileId,
      });
      // Starter owner/admin permission mapping is resolved anew at every entry,
      // including deferred execution; persisted envelopes never carry grants.
      return executeAsPrincipal(
        { ...options, permissions: ["reports.refresh", "tenant.usage.read"] },
        fn,
      );
    },
    state: observedState,
    backgroundQueue: {
      async enqueue(job) {
        const reference = job.envelope.principal;
        const principal = {
          userId: reference.runAsUserId,
          tenantId: reference.tenantId!,
          profileId: reference.actsAsProfileId!,
        };
        return withLockedReportOperation(db, String(job.rowIds[0]), principal, async (tx, row) => {
          if (typeof row.job_id === "string")
            return { jobId: row.job_id, details: { queue: "reports" } };
          if (row.status !== "queued") throw new Error("Report operation is not queued");
          // Job insertion and its application receipt commit together. A caller
          // retry can inspect this durable receipt after a lost submission ack.
          const transactionalQueue = createJobsDataSurfaceBackgroundQueue({
            db: tx,
            handlerId: REPORT_OPERATION_HANDLER_ID,
            queue: "reports",
            maxAttempts: 3,
            execute: dispatchReportOperation,
          });
          const receipt = await transactionalQueue.enqueue(job);
          await tx.query(
            "UPDATE starter_report_operations SET job_id = ? WHERE id = ?",
            receipt.jobId,
            row.id,
          );
          return receipt;
        });
      },
    },
    backgroundHandlerId: REPORT_OPERATION_HANDLER_ID,
    deferredEnvelopeSigningKey: signingKey,
    async resolveDeferredPrincipal(reference) {
      if (
        !reference.tenantId ||
        !reference.actsAsProfileId ||
        reference.onBehalfOfUserId !== reference.runAsUserId ||
        reference.agentClass
      )
        throw new Error("Invalid report principal binding");
      return principalOptions({
        userId: reference.runAsUserId,
        tenantId: reference.tenantId,
        profileId: reference.actsAsProfileId,
      });
    },
    async resolveSurface() {
      const capture = {
        descriptor: actionDescriptor,
        inputSchema: { type: "object" },
        confirmation: "none" as const,
        execution: "background" as const,
        tool: "tenant.activity-report.prepare",
        operation: { id: "reports.refresh", collection: "reports", action: "refresh" },
        validatePayload(payload) {
          return {
            valid: Boolean(
              payload &&
                typeof payload === "object" &&
                !Array.isArray(payload) &&
                Object.keys(payload).length === 1 &&
                typeof payload.fingerprint === "string",
            ),
          };
        },
        async authorize(invocation) {
          const row = await load(invocation.request);
          return (
            row.requester_user_id === invocation.run.context.userId &&
            row.tenant_id === invocation.run.context.tenantId
          );
        },
        async eligible() {
          return { eligible: true };
        },
        async apply(invocation, rowId) {
          const scope = execution.getStore();
          if (!scope?.reservation) throw new Error("Missing durable execution reservation");
          const reference = scope.envelope.principal;
          const principal = {
            userId: reference.runAsUserId,
            tenantId: reference.tenantId!,
            profileId: reference.actsAsProfileId!,
          };
          return withTenant({ tenantId: principal.tenantId }, () =>
            withLockedReportOperation(db, String(rowId), principal, async (tx, row) => {
              validateStoredPayload(row, invocation.request);
              if (["cancelled", "declined"].includes(row.status))
                return { operationStatus: row.status };
              if (row.status === "committed") return { operationStatus: "committed" };
              if (
                row.status !== "queued" ||
                (row.kind === "approval-demo" &&
                  (row.approved_fingerprint !== row.payload_fingerprint ||
                    row.decided_by_user_id !== row.requester_user_id))
              )
                throw new Error("Operation is not approved for execution");
              const query = parseReportOperationJson<{ query: ActivityReportOperationQuery }>(
                row.request,
              ).query;
              const snapshot = await captureActivityReportSnapshot(tx, row.tenant_id, query);
              const result: DataSurfaceActionResult = {
                version: 1,
                requestId: invocation.request.requestId,
                identity,
                actionId: invocation.request.actionId,
                phase: "apply",
                ok: true,
                details: {
                  accepted: 1,
                  skipped: 0,
                  failed: 0,
                  outcomes: [{ operationStatus: "committed", rowId: row.id, status: "accepted" }],
                },
              };
              const evidence: ExecutionEvidence = {
                key: scope.reservation!.key,
                requestFingerprint: scope.reservation!.requestFingerprint,
                reservedAt: scope.reservation!.reservedAt,
                result,
                payloadFingerprint: row.payload_fingerprint,
              };
              await tx.query(
                "UPDATE starter_report_operations SET status = 'committed', snapshot = ?, execution_evidence = ?, error_code = NULL, updated_at = ? WHERE id = ?",
                JSON.stringify(snapshot),
                JSON.stringify(evidence),
                new Date().toISOString(),
                row.id,
              );
              return { operationStatus: "committed" };
            }),
          );
        },
      } satisfies import("@happyvertical/smrt-agents/server").DataSurfaceServerActionDefinition;
      return {
        descriptor,
        revision: 1,
        actions: {
          capture,
          "capture-demo": { ...capture, descriptor: demoDescriptor, confirmation: "required" },
        },
      };
    },
    async resolveSelection(invocation, selection) {
      if (selection.scope !== "explicit-ids" || selection.rowIds.length !== 1)
        throw new Error("Invalid operation selection");
      const row = await load(invocation.request);
      validateStoredPayload(row, invocation.request);
      return { revision: 1, queryFingerprint: row.payload_fingerprint, rowIds: [row.id] };
    },
  });
  async function load(request: DataSurfaceServerActionRequest): Promise<ReportOperationRow> {
    if (request.selection.scope !== "explicit-ids" || request.selection.rowIds.length !== 1)
      throw new Error("Invalid operation selection");
    const result = await db.query(
      "SELECT * FROM starter_report_operations WHERE id = ?",
      request.selection.rowIds[0],
    );
    if (!result.rows[0]) throw new Error("Report operation not found");
    return result.rows[0] as ReportOperationRow;
  }
  runtimeRegistrations.add(registration);
  return {
    adapter,
    state,
    executeDeferred,
    unregister() {
      if (!runtimeRegistrations.delete(registration)) return;
      if (runtimeRegistrations.size === 0) queue.unregister();
      unregisterPermission();
    },
    async enqueue(
      id: string,
      principal: ReportOperationPrincipal,
    ): Promise<DataSurfaceActionResult> {
      const row = await withLockedReportOperation(db, id, principal, async (_tx, row) => row);
      if (row.status !== "queued") throw new Error("Report operation is not queued");
      const request: DataSurfaceServerActionRequest = {
        version: 1,
        requestId: id,
        identity,
        actionId: row.kind === "approval-demo" ? "capture-demo" : "capture",
        phase: "apply",
        expectedRevision: 1,
        idempotencyKey: id,
        selection: { scope: "explicit-ids", rowIds: [id] },
        payload: { fingerprint: row.payload_fingerprint },
      };
      const context = { principal: await principalOptions(principal) };
      if (row.kind === "approval-demo") {
        if (
          row.approved_fingerprint !== row.payload_fingerprint ||
          row.decided_by_user_id !== principal.userId
        )
          throw new Error("Human approval is required");
        const preview = await adapter.preview({ ...request, phase: "preview" }, context);
        if (!preview.ok || !preview.confirmationToken) return preview;
        request.confirmationToken = preview.confirmationToken;
      }
      const result = await adapter.apply(request, context);
      if (result.ok && typeof result.details?.jobId === "string")
        await db.query(
          "UPDATE starter_report_operations SET job_id = ? WHERE id = ? AND tenant_id = ? AND requester_user_id = ?",
          result.details.jobId,
          id,
          principal.tenantId,
          principal.userId,
        );
      return result;
    },
    async reconcile(id: string, principal: ReportOperationPrincipal): Promise<boolean> {
      return withLockedReportOperation(db, id, principal, async (tx, row) => {
        if (row.status !== "committed" || !row.snapshot || !row.execution_evidence) return false;
        const evidence = parseReportOperationJson<ExecutionEvidence>(row.execution_evidence);
        const query = parseReportOperationJson<{ query: ActivityReportOperationQuery }>(
          row.request,
        ).query;
        if (
          evidence.payloadFingerprint !== row.payload_fingerprint ||
          reportOperationPayloadFingerprint(row, query) !== row.payload_fingerprint
        )
          return false;
        const recoveryState = createSqlDataSurfaceActionStateStore({
          db: tx,
          authorizeRecovery: async (request) => {
            await authorizeReportOperationPrincipal(tx, principal);
            return (
              request.requestFingerprint === evidence.requestFingerprint &&
              request.reservedAt === evidence.reservedAt &&
              JSON.stringify(request.result) === JSON.stringify(evidence.result)
            );
          },
        });
        return recoveryState.reconcileIdempotency(evidence.key, {
          requestFingerprint: evidence.requestFingerprint,
          reservedAt: evidence.reservedAt,
          result: evidence.result,
          authorizedBy: principal.userId,
          evidence: `starter-report-operation:${id}:${row.payload_fingerprint}`,
        });
      });
    },
  };
}
function validateStoredPayload(
  row: ReportOperationRow,
  request: DataSurfaceServerActionRequest,
): void {
  const query = parseReportOperationJson<{ query: ActivityReportOperationQuery }>(
    row.request,
  ).query;
  const supplied = request.payload as { fingerprint?: unknown } | undefined;
  if (
    (row.kind === "approval-demo" ? "capture-demo" : "capture") !== request.actionId ||
    reportOperationPayloadFingerprint(row, query) !== row.payload_fingerprint ||
    supplied?.fingerprint !== row.payload_fingerprint
  )
    throw new Error("Report operation payload changed");
}
export function registerWorkerReportOperationRuntime(db: DatabaseInterface): () => void {
  if (sharedRuntime.executor) throw new Error("Report operation worker is already registered");
  const runtime = createReportOperationRuntime({ db });
  registerDataSurfaceBackgroundActionHandler(REPORT_OPERATION_HANDLER_ID, dispatchReportOperation);
  sharedRuntime.executor = runtime.executeDeferred;
  return () => {
    if (sharedRuntime.executor === runtime.executeDeferred) sharedRuntime.executor = undefined;
    runtime.unregister();
  };
}
