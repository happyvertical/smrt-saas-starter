export type ReportOperationKind = "prepare" | "approval-demo";

export type ReportOperation = {
  id: string;
  kind: ReportOperationKind;
  status:
    | "awaiting_approval"
    | "queued"
    | "running"
    | "committed"
    | "cancelled"
    | "declined"
    | "failed"
    | "recovery_required";
  payloadFingerprint: string;
  query: Required<ReportQuery>;
  createdAt: string;
  jobId?: string | null;
  decidedAt?: string | null;
  errorCode?: string | null;
  snapshot?: ReportSnapshot | null;
};

export type ReportQuery = {
  page?: number;
  pageSize?: number;
  sort?: "id" | "metric_key" | "window_start" | "quantity";
  direction?: "asc" | "desc";
  metricKey?: string;
};

export type ReportSnapshot = {
  rows: Array<{ id: string; metric_key: string; window_start: string; quantity: number }>;
  total: number;
  query: ReportQuery;
};

export interface OperationToolOptions {
  tenantId: string;
  currentTenantId: () => string;
  currentQuery: ReportQuery;
  fetch: typeof globalThis.fetch;
  showOperation?: (operation: ReportOperation) => void | Promise<void>;
  acknowledge: (message: string) => void | Promise<void>;
  signal?: AbortSignal;
}

type ToolInput = {
  action?: unknown;
  id?: unknown;
  kind?: unknown;
  requestId?: unknown;
  query?: unknown;
};
const cancelled = () => JSON.stringify({ ok: false, reason: "cancelled" });
const response = (value: Record<string, unknown>) => JSON.stringify(value);

export async function executeOperationTool(
  input: unknown,
  options: OperationToolOptions,
): Promise<string> {
  if (options.signal?.aborted) return cancelled();
  if (!input || typeof input !== "object" || Array.isArray(input))
    return response({ ok: false, reason: "invalid_request" });
  const command = input as ToolInput;
  const action = command.action;
  if (action !== "submit" && action !== "status" && action !== "cancel")
    return response({ ok: false, reason: "invalid_request" });
  const requestedTenant = options.tenantId;
  const id = typeof command.id === "string" ? command.id : "";
  let path = "/api/reports/operations";
  let init: RequestInit = {
    credentials: "same-origin",
    headers: { accept: "application/json" },
    signal: options.signal,
  };
  if (action === "submit") {
    if (
      (command.kind !== "prepare" && command.kind !== "approval-demo") ||
      typeof command.requestId !== "string" ||
      !command.requestId
    ) {
      return response({ ok: false, reason: "invalid_request" });
    }
    const query =
      command.query === undefined ? options.currentQuery : parseReportQuery(command.query);
    if (!query) return response({ ok: false, reason: "invalid_request" });
    path = "/api/reports/operations";
    init = {
      ...init,
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        kind: command.kind,
        requestId: command.requestId,
        query,
      }),
    };
  } else {
    if (!id) return response({ ok: false, reason: "invalid_request" });
    path = `/api/reports/operations/${encodeURIComponent(id)}${action === "cancel" ? "/cancel" : ""}`;
    if (action === "cancel") init = { ...init, method: "POST" };
  }
  let result: { operation?: ReportOperation };
  try {
    const http = await options.fetch(path, init);
    if (!http.ok)
      return response({
        ok: false,
        reason:
          http.status === 403
            ? "forbidden"
            : action === "status"
              ? "status_failed"
              : "operation_failed",
      });
    result = (await http.json()) as { operation?: ReportOperation };
  } catch (error) {
    if (options.signal?.aborted) return cancelled();
    throw error;
  }
  if (options.signal?.aborted || options.currentTenantId() !== requestedTenant) return cancelled();
  if (
    !result.operation ||
    typeof result.operation.id !== "string" ||
    typeof result.operation.status !== "string"
  )
    return response({ ok: false, reason: "invalid_response" });
  await options.showOperation?.(result.operation);
  if (options.signal?.aborted || options.currentTenantId() !== requestedTenant) return cancelled();
  await options.acknowledge(`Operation ${result.operation.id} is ${result.operation.status}.`);
  return response({ ok: true, acknowledgement: "visible_operation", operation: result.operation });
}

function parseReportQuery(value: unknown): ReportQuery | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const query = value as Record<string, unknown>;
  if (
    Object.keys(query).some(
      (key) => !["page", "pageSize", "sort", "direction", "metricKey"].includes(key),
    )
  )
    return undefined;
  const result: ReportQuery = {};
  if (query.page !== undefined) {
    if (
      typeof query.page !== "number" ||
      !Number.isSafeInteger(query.page) ||
      query.page < 1 ||
      query.page > 10_000
    )
      return undefined;
    result.page = query.page;
  }
  if (query.pageSize !== undefined) {
    if (
      typeof query.pageSize !== "number" ||
      !Number.isSafeInteger(query.pageSize) ||
      query.pageSize < 1 ||
      query.pageSize > 100
    )
      return undefined;
    result.pageSize = query.pageSize;
  }
  if (
    query.sort === "id" ||
    query.sort === "metric_key" ||
    query.sort === "window_start" ||
    query.sort === "quantity"
  ) {
    result.sort = query.sort;
  } else if (query.sort !== undefined) return undefined;
  if (query.direction === "asc" || query.direction === "desc") {
    result.direction = query.direction;
  } else if (query.direction !== undefined) return undefined;
  if (query.metricKey !== undefined) {
    if (typeof query.metricKey !== "string" || query.metricKey.length > 120) return undefined;
    result.metricKey = query.metricKey;
  }
  return result;
}
