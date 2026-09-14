<script lang="ts">
  import { useWebMcpTool } from "@happyvertical/smrt-svelte";
  import { onDestroy, tick } from "svelte";
  import { goto } from "$app/navigation";
  import { createShellRequestLifetime } from "../../../lib/components/shell-request-lifetime";
  import type { ReportQuery } from "./operation-tool";
  import { executeOperationTool } from "./operation-tool";
  import { executeReportTool } from "./report-tool";

  let { tenantId, query }: { tenantId: string; query: ReportQuery } = $props();
  let acknowledgement = $state("");
  const lifetime = createShellRequestLifetime();
  onDestroy(() => lifetime.dispose());

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
    execute: (input, options) => lifetime.run((signal) => executeReportTool(input, {
      tenantId,
      currentTenantId: () => tenantId,
      fetch,
      goto,
      acknowledge: (message) => { acknowledgement = message; },
      signal,
    }), options?.signal),
  }));

  useWebMcpTool(() => ({
    name: "tenant_activity_report_operation_submit",
    description: "Prepare the visible report view or request the separately labelled synthetic approval demonstration. This cannot approve or decline it.",
    inputSchema: {
      type: "object", additionalProperties: false, required: ["kind", "requestId"],
      properties: {
        kind: { type: "string", enum: ["prepare", "approval-demo"] },
        requestId: { type: "string", minLength: 1 },
        query: { type: "object", additionalProperties: false, properties: {
          page: { type: "integer", minimum: 1 }, pageSize: { type: "integer", minimum: 1, maximum: 100 },
          sort: { type: "string", enum: ["id", "metric_key", "window_start", "quantity"] }, direction: { type: "string", enum: ["asc", "desc"] }, metricKey: { type: "string", maxLength: 120 },
        } },
      },
    },
    annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    execute: (input, options) => lifetime.run((signal) => executeOperationTool({ action: "submit", ...input }, {
      tenantId, currentTenantId: () => tenantId, currentQuery: query, fetch, showOperation: async (operation) => { window.dispatchEvent(new CustomEvent("report-operation-updated", { detail: operation })); await tick(); }, acknowledge: async (message) => { acknowledgement = message; await tick(); }, signal,
    }), options?.signal),
  }));

  useWebMcpTool(() => ({
    name: "tenant_activity_report_operation_status",
    description: "Read the current status and immutable prepared result of one of your report operations.",
    inputSchema: { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string", minLength: 1 } } },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    execute: (input, options) => lifetime.run((signal) => executeOperationTool({ action: "status", ...input }, {
      tenantId, currentTenantId: () => tenantId, currentQuery: query, fetch, showOperation: async (operation) => { window.dispatchEvent(new CustomEvent("report-operation-updated", { detail: operation })); await tick(); }, acknowledge: async (message) => { acknowledgement = message; await tick(); }, signal,
    }), options?.signal),
  }));

  useWebMcpTool(() => ({
    name: "tenant_activity_report_operation_cancel",
    description: "Cancel one of your pending report operations.",
    inputSchema: { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string", minLength: 1 } } },
    annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    execute: (input, options) => lifetime.run((signal) => executeOperationTool({ action: "cancel", ...input }, {
      tenantId, currentTenantId: () => tenantId, currentQuery: query, fetch, showOperation: async (operation) => { window.dispatchEvent(new CustomEvent("report-operation-updated", { detail: operation })); await tick(); }, acknowledge: async (message) => { acknowledgement = message; await tick(); }, signal,
    }), options?.signal),
  }));
</script>

<p class="sr-only" aria-live="polite" aria-atomic="true" data-report-webmcp-ack>{acknowledgement}</p>

<style>
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
</style>
