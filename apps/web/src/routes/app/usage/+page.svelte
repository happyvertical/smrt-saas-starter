<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>Usage | SMRT SaaS Starter</title>
</svelte:head>

<section class="page">
  <header>
    <p>Usage</p>
    <h1>Tenant metrics</h1>
  </header>

  <div class="table">
    <div class="row header">
      <span>Metric</span>
      <span>Window</span>
      <span>Value</span>
    </div>
    {#each data.summaries as summary}
      <div class="row">
        <span>{summary.metricKey}</span>
        <span>{summary.windowStart}</span>
        <strong>{summary.value.toLocaleString()}</strong>
      </div>
    {/each}
  </div>
</section>

<style>
  .page {
    padding: clamp(1rem, 3vw, 2rem);
    max-width: 900px;
  }

  header p,
  h1 {
    margin: 0;
  }

  header {
    margin-bottom: 1.5rem;
  }

  .table {
    border: 1px solid var(--smrt-color-outline, #d7dce2);
    border-radius: 8px;
    overflow: hidden;
    background: var(--smrt-color-surface, #fff);
  }

  .row {
    display: grid;
    grid-template-columns: 1fr 160px 120px;
    gap: 1rem;
    padding: 0.85rem 1rem;
    border-top: 1px solid var(--smrt-color-outline-variant, #edf0f3);
  }

  .row:first-child {
    border-top: 0;
  }

  .header {
    background: var(--smrt-color-surface-container, #f3f5f7);
    color: var(--smrt-color-on-surface-variant, #5e6470);
    font-size: 0.82rem;
    font-weight: 700;
  }

  @media (max-width: 680px) {
    .row {
      grid-template-columns: 1fr;
    }
  }
</style>
