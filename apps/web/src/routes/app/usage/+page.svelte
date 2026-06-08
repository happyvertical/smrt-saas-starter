<script lang="ts">
  let { data } = $props();

  function formatDate(value: string) {
    return new Date(value).toLocaleDateString();
  }

  function formatQuantity(value: number) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function meterWidth(ratio: number) {
    if (!Number.isFinite(ratio)) {
      return 100;
    }
    return Math.max(0, Math.min(100, ratio * 100));
  }
</script>

<svelte:head>
  <title>Usage | SMRT SaaS Starter</title>
</svelte:head>

<section class="page">
  <header>
    <p>Usage</p>
    <h1>Tenant metrics</h1>
    <span>{data.planName} plan through {formatDate(data.periodEnd)}</span>
  </header>

  <section class="thresholds" aria-label="Usage thresholds">
    {#each data.thresholds as threshold}
      <article class={`threshold ${threshold.state}`}>
        <div>
          <p>{threshold.enforcement}</p>
          <h2>{threshold.label}</h2>
        </div>
        <strong>{formatQuantity(threshold.used)} / {formatQuantity(threshold.limit)}</strong>
        <div class="meter" aria-label={`${threshold.label} quota`}>
          <span style={`width: ${meterWidth(threshold.ratio)}%`}></span>
        </div>
        <footer>
          <span>{threshold.state}</span>
          <span>{formatQuantity(threshold.remaining)} {threshold.unit} left</span>
        </footer>
      </article>
    {/each}
  </section>

  <div class="table">
    <div class="row header">
      <span>Metric</span>
      <span>Window</span>
      <span>Value</span>
    </div>
    {#each data.summaries as summary}
      <div class="row">
        <span>{summary.label}</span>
        <span>{formatDate(summary.windowStart)}</span>
        <strong>{formatQuantity(summary.quantity)} {summary.unit}</strong>
      </div>
    {/each}
  </div>
</section>

<style>
  .page {
    padding: clamp(1rem, 3vw, 2rem);
    max-width: 1040px;
  }

  header p,
  h1,
  header span {
    margin: 0;
  }

  header {
    margin-bottom: 1.5rem;
  }

  header span {
    display: block;
    margin-top: 0.4rem;
    color: var(--smrt-color-on-surface-variant, #5e6470);
  }

  .thresholds {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 0.9rem;
    margin-bottom: 1.25rem;
  }

  .threshold {
    display: grid;
    gap: 0.8rem;
    border: 1px solid var(--smrt-color-outline, #d7dce2);
    border-radius: 8px;
    padding: 1rem;
    background: var(--smrt-color-surface, #fff);
  }

  .threshold.warn {
    border-color: #c8861a;
  }

  .threshold.blocked {
    border-color: #b3261e;
  }

  .threshold p,
  .threshold h2,
  .threshold footer {
    margin: 0;
  }

  .threshold p,
  .threshold footer {
    color: var(--smrt-color-on-surface-variant, #5e6470);
    font-size: 0.82rem;
  }

  .threshold h2 {
    margin-top: 0.2rem;
    font-size: 1rem;
  }

  .threshold strong {
    font-size: 1.2rem;
  }

  .threshold footer {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
    text-transform: capitalize;
  }

  .meter {
    height: 0.5rem;
    overflow: hidden;
    border-radius: 999px;
    background: var(--smrt-color-surface-container, #eef1f4);
  }

  .meter span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--smrt-color-primary, #1d6f8f);
  }

  .warn .meter span {
    background: #c8861a;
  }

  .blocked .meter span {
    background: #b3261e;
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
