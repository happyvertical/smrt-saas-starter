<script lang="ts">
  import { SubscriptionSummary, UsageThresholds } from "@happyvertical/smrt-subscriptions/svelte";

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

  <SubscriptionSummary
    resolution={data.snapshot}
    periodEnd={data.periodEnd}
    periodDisposition="renews"
  />
  <UsageThresholds evaluations={data.snapshot.thresholdEvaluations} />
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
