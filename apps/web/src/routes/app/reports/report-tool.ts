type ReportResponse = {
  structuredContent?: {
    report?: {
      page?: unknown;
      pageSize?: unknown;
      total?: unknown;
      query?: Record<string, unknown>;
    };
  };
};

export interface ReportToolOptions {
  tenantId: string;
  currentTenantId: () => string;
  fetch: typeof globalThis.fetch;
  goto: (url: string) => Promise<void>;
  acknowledge: (message: string) => void;
  signal?: AbortSignal;
}

const cancelled = () => JSON.stringify({ ok: false, reason: "cancelled" });

export async function executeReportTool(
  input: unknown,
  options: ReportToolOptions,
): Promise<string> {
  if (options.signal?.aborted) return cancelled();
  const requestTenantId = options.tenantId;
  let response: Response;
  try {
    response = await options.fetch("/api/mcp/call", {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ name: "tenant.activity-report.query", input }),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) return cancelled();
    throw error;
  }
  if (!response.ok) {
    return JSON.stringify({
      ok: false,
      reason: response.status === 403 ? "forbidden" : "query_failed",
    });
  }
  const result = (await response.json()) as ReportResponse;
  if (options.signal?.aborted || options.currentTenantId() !== requestTenantId) return cancelled();
  const report = result.structuredContent?.report;
  if (
    !report ||
    typeof report.page !== "number" ||
    typeof report.pageSize !== "number" ||
    !report.query ||
    Array.isArray(report.query)
  ) {
    return JSON.stringify({ ok: false, reason: "invalid_response" });
  }
  const url = new URL("/app/reports", window.location.origin);
  for (const key of ["page", "pageSize", "sort", "direction", "metricKey"] as const) {
    const value = report.query[key];
    if (typeof value === "string" || typeof value === "number")
      url.searchParams.set(key, String(value));
  }
  if (options.signal?.aborted || options.currentTenantId() !== requestTenantId) return cancelled();
  await options.goto(`${url.pathname}?${url.searchParams.toString()}`);
  if (options.signal?.aborted || options.currentTenantId() !== requestTenantId) return cancelled();
  options.acknowledge(`Visible activity table updated: ${report.total ?? 0} rows.`);
  return JSON.stringify({ ok: true, acknowledgement: "visible_table", report });
}
