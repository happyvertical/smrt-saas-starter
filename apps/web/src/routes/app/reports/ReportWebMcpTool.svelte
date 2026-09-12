<script lang="ts">
  import { useWebMcpTool } from "@happyvertical/smrt-svelte";
  import { onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { createShellRequestLifetime } from "../../../lib/components/shell-request-lifetime";
  import { executeReportTool } from "./report-tool";

  let { tenantId }: { tenantId: string } = $props();
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
</script>

<p class="sr-only" aria-live="polite" aria-atomic="true" data-report-webmcp-ack>{acknowledgement}</p>

<style>
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
</style>
