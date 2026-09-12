<script lang="ts">
  import { useWebMcpTool } from "@happyvertical/smrt-svelte";
  import { goto } from "$app/navigation";

  let { tenantId }: { tenantId: string } = $props();
  let acknowledgement = $state("");

  useWebMcpTool(() => ({
    name: "tenant_activity_report_query",
    description: "Query the visible tenant activity report table with server paging, sorting, and an optional activity filter.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        page: { type: "integer", minimum: 1 },
        pageSize: { type: "integer", minimum: 1, maximum: 100 },
        sort: { type: "string", enum: ["id", "metric_key", "window_start", "quantity"] },
        direction: { type: "string", enum: ["asc", "desc"] },
        metricKey: { type: "string", maxLength: 120 },
      },
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    execute: async (input) => {
      const requestTenantId = tenantId;
      const response = await fetch("/api/mcp/call", {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ name: "tenant.activity-report.query", input }),
      });
      if (!response.ok) return JSON.stringify({ ok: false, reason: response.status === 403 ? "forbidden" : "query_failed" });
      const result = await response.json() as { structuredContent?: { report?: { page?: unknown; pageSize?: unknown; total?: unknown; query?: Record<string, unknown> } } };
      if (tenantId !== requestTenantId) return JSON.stringify({ ok: false, reason: "stale_tenant" });
      const report = result.structuredContent?.report;
      if (!report || typeof report.page !== "number" || typeof report.pageSize !== "number" || !report.query || Array.isArray(report.query)) {
        return JSON.stringify({ ok: false, reason: "invalid_response" });
      }
      const url = new URL("/app/reports", window.location.origin);
      for (const key of ["page", "pageSize", "sort", "direction", "metricKey"] as const) {
        const value = report.query[key];
        if (typeof value === "string" || typeof value === "number") url.searchParams.set(key, String(value));
      }
      await goto(`${url.pathname}?${url.searchParams.toString()}`);
      acknowledgement = `Visible activity table updated: ${report.total ?? 0} rows.`;
      return JSON.stringify({ ok: true, acknowledgement: "visible_table", report });
    },
  }));
</script>

<p class="sr-only" aria-live="polite" aria-atomic="true" data-report-webmcp-ack>{acknowledgement}</p>

<style>
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
</style>
