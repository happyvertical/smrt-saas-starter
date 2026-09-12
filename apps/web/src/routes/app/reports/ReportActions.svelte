<script lang="ts">
  import { onDestroy } from "svelte";

  let {
    tenantId,
    query = {},
  }: {
    tenantId: string;
    query?: {
      page?: number;
      pageSize?: number;
      sort?: "id" | "metric_key" | "window_start" | "quantity";
      direction?: "asc" | "desc";
      metricKey?: string;
    };
  } = $props();

  let status = $state("");
  let busy = $state(false);
  let controller: AbortController | undefined;

  async function exportReport(format: "csv" | "json") {
    try {
      const result = await command("/api/reports/activity/export", {
        phase: "apply",
        format,
        query,
      });
      const downloadUrl = readString(result, "downloadUrl");
      if (!downloadUrl) throw new Error("The export response did not include a download URL");
      status = `${format.toUpperCase()} export ready`;
      window.location.assign(downloadUrl);
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      if (!status) {
        status = cause instanceof Error ? cause.message : "Report export failed";
      }
    }
  }

  async function command(path: string, body: Record<string, unknown>) {
    controller?.abort();
    const activeController = new AbortController();
    controller = activeController;
    const requestedTenant = tenantId;
    busy = true;
    status = "";
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: activeController.signal,
      });
      const result = (await response.json()) as Record<string, unknown>;
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Report action failed");
      if (tenantId !== requestedTenant) throw new Error("The active tenant changed before the report action completed");
      return result;
    } catch (cause) {
      if (!activeController.signal.aborted) {
        status = cause instanceof Error ? cause.message : "Report action failed";
      }
      throw cause;
    } finally {
      if (controller === activeController) {
        controller = undefined;
        busy = false;
      }
    }
  }

  function readString(value: Record<string, unknown>, ...path: string[]) {
    let current: unknown = value;
    for (const segment of path) {
      if (!current || typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
    return typeof current === "string" ? current : undefined;
  }

  onDestroy(() => controller?.abort());
</script>

<div class="report-actions" aria-busy={busy}>
  <button type="button" disabled={busy} onclick={() => void exportReport("csv")}>Export CSV</button>
  <button type="button" disabled={busy} onclick={() => void exportReport("json")}>Export JSON</button>
  <span role="status" aria-live="polite">{status}</span>
</div>

<style>
  .report-actions {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  button {
    min-height: 2.25rem;
    padding: 0 0.8rem;
  }
</style>
