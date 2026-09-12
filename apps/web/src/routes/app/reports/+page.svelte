<script lang="ts">
  import { DataTable, type DataTableColumn, type SortState } from "@happyvertical/smrt-ui/data";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import ReportWebMcpTool from "./ReportWebMcpTool.svelte";

  let { data } = $props();
  type Row = (typeof data.rows)[number];

  const columns = $derived<DataTableColumn<Row>[]>(
    data.descriptor.dataTable.columns.map((column) => ({
      id: column.id,
      label: column.label,
      accessor: column.accessor,
      sortable: column.sortable,
      filterable: false,
      searchable: false,
      align: column.align,
      role: column.role,
      responsive: column.responsive,
    })),
  );
  const sort = $derived<SortState>({ columnId: page.url.searchParams.get("sort") ?? "window_start", direction: page.url.searchParams.get("direction") === "asc" ? "asc" : "desc" });
  let pendingUpdate: Record<string, string | number | undefined> | undefined;
  let navigationScheduled = false;
  let clientReady = $state(false);

  onMount(() => {
    clientReady = true;
  });

  function update(values: Record<string, string | number | undefined>) {
    pendingUpdate = { ...pendingUpdate, ...values };
    if (navigationScheduled) return;
    navigationScheduled = true;
    queueMicrotask(() => {
      const next = pendingUpdate;
      pendingUpdate = undefined;
      navigationScheduled = false;
      if (!next) return;
      navigate(next);
    });
  }

  function navigate(values: Record<string, string | number | undefined>) {
    const url = new URL(page.url);
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || value === "") url.searchParams.delete(key);
      else url.searchParams.set(key, String(value));
    }
    goto(`${url.pathname}?${url.searchParams.toString()}`);
  }

  function onSortChange(next: SortState) {
    // DataTable emits its page reset immediately after a sort change. Queue
    // both callbacks into one URL update so the page event cannot overwrite
    // the new sort using the stale route state.
    update({ page: 1, sort: next.columnId ?? undefined, direction: next.direction ?? undefined });
  }

  function onPageChange(next: number) {
    update({ page: next });
  }
</script>

<svelte:head><title>Activity reports | SMRT SaaS Starter</title></svelte:head>

<section class="page" data-client-ready={clientReady} data-report-total={data.total}>
  <ReportWebMcpTool tenantId={data.tenantId} />
  <header>
    <p>Reports</p>
    <h1>Tenant activity reports</h1>
    <span>Aggregate synthetic activity for the active tenant.</span>
  </header>

  <form class="filters" onsubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); update({ page: 1, metricKey: String(form.get("metricKey") ?? "") }); }}>
    <label>Activity <input name="metricKey" value={page.url.searchParams.get("metricKey") ?? ""} maxlength="120" /></label>
    <button type="submit">Filter</button>
    <a href="/app/reports">Clear</a>
  </form>

  <DataTable
    data={data.rows}
    {columns}
    rowKey="id"
    sortable
    {sort}
    manualSorting
    onSortChange={onSortChange}
    page={data.page}
    pageSize={data.pageSize}
    manualPagination
    totalRows={data.total}
    {onPageChange}
  />
</section>

<style>
  .page { padding: clamp(1rem, 3vw, 2rem); max-width: 1040px; }
  header p, h1, header span { margin: 0; }
  header { display: grid; gap: .4rem; margin-bottom: 1.5rem; }
  header span { color: var(--smrt-color-on-surface-variant, #5e6470); }
  .filters { display: flex; align-items: end; gap: .75rem; margin-bottom: 1rem; }
  .filters label { display: grid; gap: .3rem; }
  .filters input { min-height: 2.25rem; }
  .filters button, .filters a { min-height: 2.25rem; padding: 0 .8rem; }
</style>
