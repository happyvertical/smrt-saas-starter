<script lang="ts">
  
  import { DataTable, type DataTableColumn } from "@happyvertical/smrt-ui/data";
import { onDestroy, onMount } from "svelte";
  import type { ReportOperation, ReportOperationKind, ReportQuery } from "./operation-tool";

  let { tenantId, actualSession, query }: { tenantId: string; actualSession: boolean; query: ReportQuery } = $props();
  let operations = $state<ReportOperation[]>([]);
  let message = $state("");
  let busy = $state(false);
  let controller: AbortController | undefined;
  let creationRequestIds = $state<Partial<Record<ReportOperationKind, string>>>({});
  let displayedTenantId: string | undefined;
  type SnapshotRow = NonNullable<ReportOperation["snapshot"]>["rows"][number];
  const snapshotColumns: DataTableColumn<SnapshotRow>[] = [
    { id: "id", label: "ID", accessor: "id", sortable: false, filterable: false, searchable: false },
    { id: "metric_key", label: "Activity", accessor: "metric_key", sortable: false, filterable: false, searchable: false },
    { id: "window_start", label: "Window", accessor: "window_start", sortable: false, filterable: false, searchable: false },
    { id: "quantity", label: "Count", accessor: "quantity", sortable: false, filterable: false, searchable: false, align: "right" },
  ];

  onMount(() => {
    const receiveOperation = (event: Event) => {
      const operation = (event as CustomEvent<unknown>).detail;
      if (isOperation(operation)) { replace(operation); message = `Operation ${statusLabel(operation.status)}.`; }
    };
    window.addEventListener("report-operation-updated", receiveOperation);
    void refresh();
    return () => window.removeEventListener("report-operation-updated", receiveOperation);
  });
  onDestroy(() => controller?.abort());

  $effect(() => {
    if (displayedTenantId === undefined) {
      displayedTenantId = tenantId;
      return;
    }
    if (tenantId === displayedTenantId) return;
    displayedTenantId = tenantId;
    controller?.abort();
    operations = [];
    message = "";
    void refresh();
  });

  function requestId() {
    return crypto.randomUUID?.() ?? `report-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function refresh() {
    await command(async (signal) => {
      const response = await fetch("/api/reports/operations", { credentials: "same-origin", headers: { accept: "application/json" }, signal });
      const body = await response.json() as { operations?: ReportOperation[]; error?: string };
      if (!response.ok || !Array.isArray(body.operations)) throw new Error(body.error ?? "Could not load report operations");
      return () => { operations = body.operations!; message = "Operations updated."; };
    });
  }

  async function create(kind: ReportOperationKind) {
    const stableRequestId = creationRequestIds[kind] ?? requestId();
    if (!creationRequestIds[kind]) creationRequestIds = { ...creationRequestIds, [kind]: stableRequestId };
    await command(async (signal) => {
      const response = await fetch("/api/reports/operations", { method: "POST", credentials: "same-origin", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ kind, query, requestId: stableRequestId }), signal });
      const body = await response.json() as { operation?: ReportOperation; error?: string };
      if (!response.ok || !body.operation) throw new Error(body.error ?? "Could not start the operation");
      return () => { creationRequestIds = { ...creationRequestIds, [kind]: undefined }; replace(body.operation!); message = kind === "prepare" ? "Report preparation started." : "Approval demonstration is awaiting a human decision."; };
    });
  }

  async function cancel(id: string) {
    await command(async (signal) => {
      const response = await fetch(`/api/reports/operations/${encodeURIComponent(id)}/cancel`, { method: "POST", credentials: "same-origin", headers: { accept: "application/json" }, signal });
      const body = await response.json() as { operation?: ReportOperation; error?: string };
      if (!response.ok || !body.operation) throw new Error(body.error ?? "Could not cancel the operation");
      return () => { replace(body.operation!); message = `Operation ${statusLabel(body.operation!.status)}.`; };
    });
  }

  async function decide(event: SubmitEvent, operation: ReportOperation) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    await command(async (signal) => {
      const response = await fetch(form.action, { method: "POST", credentials: "same-origin", headers: { accept: "application/json" }, body: new FormData(form, event.submitter as HTMLElement | null), signal });
      const body = await response.json() as { operation?: ReportOperation; error?: string };
      if (!response.ok || !body.operation) throw new Error(body.error ?? "The decision was not accepted");
      return () => { replace(body.operation!); message = `Human decision recorded: ${statusLabel(body.operation!.status)}.`; };
    });
  }

  async function command(execute: (signal: AbortSignal) => Promise<() => void>) {
    controller?.abort();
    const active = new AbortController(); controller = active; busy = true; message = "";
    const requestedTenant = tenantId;
    try { const apply = await execute(active.signal); if (active.signal.aborted || tenantId !== requestedTenant) return; apply(); }
    catch (error) { if (!active.signal.aborted) message = error instanceof Error ? error.message : "Operation failed"; }
    finally { if (controller === active) { controller = undefined; busy = false; } }
  }

  function replace(operation: ReportOperation) { operations = [operation, ...operations.filter((item) => item.id !== operation.id)]; }
  function pending(operation: ReportOperation) { return operation.status === "awaiting_approval" || operation.status === "queued" || operation.status === "running"; }
  function statusLabel(status: ReportOperation["status"]) {
    return status === "awaiting_approval" ? "Waiting for approval" : status === "queued" ? "Queued" : status === "running" ? "Preparing" : status === "committed" ? "Prepared" : status === "cancelled" ? "Cancelled" : status === "declined" ? "Declined" : status === "recovery_required" ? "Needs attention" : "Failed";
  }
  function proposal(operation: ReportOperation) {
    const query = operation.query;
    const activity = query.metricKey ? `Activity: ${query.metricKey}.` : "All activity.";
    const sort = query.sort === "window_start" ? "date" : query.sort === "metric_key" ? "activity" : query.sort === "quantity" ? "count" : "ID";
    return `${activity} Sorted by ${sort}, ${query.direction === "asc" ? "ascending" : "descending"}. Page ${query.page}, up to ${query.pageSize} rows.`;
  }
  function isOperation(value: unknown): value is ReportOperation { return Boolean(value && typeof value === "object" && typeof (value as ReportOperation).id === "string" && typeof (value as ReportOperation).status === "string"); }
</script>

<section class="operations" aria-labelledby="report-operations-heading" aria-busy={busy}>
  <header><h2 id="report-operations-heading">Report operations</h2><p>Prepare the current report view, or request the separate synthetic approval demonstration.</p></header>
  <div class="actions">
    <button type="button" disabled={busy} onclick={() => void create("prepare")}>Prepare current report</button>
    <button type="button" disabled={busy} onclick={() => void create("approval-demo")}>Start synthetic approval demo</button>
    <button type="button" disabled={busy} onclick={() => void refresh()}>Refresh operations</button>
  </div>
  <p role="status" aria-live="polite">{message}</p>
  {#if operations.length}
    <ul>
      {#each operations as operation (operation.id)}
        <li data-report-operation-id={operation.id}>
          <div><strong>{operation.kind === "approval-demo" ? "Synthetic approval demo" : "Prepared report"}</strong><span data-report-operation-status={operation.status}>{statusLabel(operation.status)}</span></div>
          {#if operation.snapshot}
            <details>
              <summary>View prepared report</summary>
              <p>Saved page: {operation.snapshot.rows.length} rows. Matching report rows: {operation.snapshot.total}.</p>
              <DataTable data={operation.snapshot.rows} columns={snapshotColumns} rowKey="id" />
            </details>
          {/if}
          {#if pending(operation)}<button type="button" disabled={busy} onclick={() => void cancel(operation.id)}>Cancel</button>{/if}
          {#if operation.kind === "approval-demo" && operation.status === "awaiting_approval"}
            <p class="proposal"><strong>Proposal</strong> {proposal(operation)} Approving captures this report view when it runs. This synthetic demonstration has no real financial action.</p>
            {#if actualSession}
              <form action={`/api/reports/operations/${encodeURIComponent(operation.id)}/decision`} method="POST" onsubmit={(event) => void decide(event, operation)}>
                <input type="hidden" name="payloadFingerprint" value={operation.payloadFingerprint} />
                <button type="submit" name="decision" value="approve" disabled={busy}>Approve demo</button>
                <button type="submit" name="decision" value="decline" disabled={busy}>Decline demo</button>
              </form>
            {:else}
              <p><a href="/login">Sign in to approve demo</a></p>
            {/if}
          {/if}
          {#if operation.kind === "approval-demo" && operation.status === "queued" && !operation.jobId && actualSession}
            <p>This approval was recorded but was not queued. Resume the approved demo while signed in as the approving person.</p>
            <form action={`/api/reports/operations/${encodeURIComponent(operation.id)}/decision`} method="POST" onsubmit={(event) => void decide(event, operation)}>
              <input type="hidden" name="payloadFingerprint" value={operation.payloadFingerprint} />
              <button type="submit" name="decision" value="approve" disabled={busy}>Resume approved demo</button>
            </form>
          {/if}
        </li>
      {/each}
    </ul>
  {:else}<p>No report operations yet.</p>{/if}
</section>

<style>
  .operations { border: 1px solid var(--smrt-color-outline-variant, #c4c7c5); border-radius: .5rem; margin: 1rem 0; padding: 1rem; }
  header, header h2, header p { margin: 0; } header { display: grid; gap: .35rem; } .actions, form, li > div { display: flex; align-items: center; flex-wrap: wrap; gap: .65rem; } .actions { margin-top: .8rem; } button { min-height: 2.25rem; padding: 0 .8rem; } ul { display: grid; gap: .75rem; list-style: none; padding: 0; } li { border-top: 1px solid var(--smrt-color-outline-variant, #c4c7c5); padding-top: .75rem; } li > div span { color: var(--smrt-color-on-surface-variant, #5e6470); }
</style>
