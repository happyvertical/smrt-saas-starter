<script lang="ts">
  import { BillingSummary } from "@happyvertical/smrt-saas-ui";
  import { usageMetricUnit } from "$lib/usage-metrics";

  let { data } = $props();
</script>

<svelte:head>
  <title>Workspace | SMRT SaaS Starter</title>
</svelte:head>

<section class="page">
  <header>
    <p>Workspace</p>
    <h1>Tenant overview</h1>
  </header>

  <BillingSummary
    planName={data.currentPlan.name}
    status={data.snapshot.status}
    periodEnd={data.periodEnd}
    thresholds={data.snapshot.thresholdEvaluations.map((evaluation) => ({
      metricKey: evaluation.threshold.metricKey,
      label: evaluation.threshold.label ?? evaluation.threshold.metricKey,
      used: evaluation.usage.quantity,
      limit: evaluation.threshold.limit,
      unit: usageMetricUnit(evaluation.threshold.metricKey),
      action: evaluation.threshold.enforcement,
    }))}
  />
</section>

<style>
  .page {
    display: grid;
    gap: 1.5rem;
    padding: clamp(1rem, 3vw, 2rem);
    max-width: 960px;
  }

  header p,
  h1 {
    margin: 0;
  }

  header p {
    color: var(--smrt-color-on-surface-variant, #5e6470);
  }

  h1 {
    font-size: 2rem;
    letter-spacing: 0;
  }
</style>
