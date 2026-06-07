<script lang="ts">
  import { BillingSummary, PlanPicker } from "@happyvertical/smrt-saas-ui";

  let { data } = $props();

  function choosePlan(plan: { id: string }) {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "?/checkout";
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "planId";
    input.value = plan.id;
    form.append(input);
    document.body.append(form);
    form.requestSubmit();
  }

  function openPortal() {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "?/portal";
    document.body.append(form);
    form.requestSubmit();
  }
</script>

<svelte:head>
  <title>Billing | SMRT SaaS Starter</title>
</svelte:head>

<section class="page">
  <header>
    <p>Billing</p>
    <h1>Plans and subscription</h1>
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
      unit: evaluation.threshold.metricKey.includes("tokens") ? "tokens" : "calls",
      action: evaluation.threshold.enforcement,
    }))}
    onportal={openPortal}
  />

  <PlanPicker plans={data.plans} onselect={choosePlan} />
</section>

<style>
  .page {
    display: grid;
    gap: 1.5rem;
    padding: clamp(1rem, 3vw, 2rem);
    max-width: 1120px;
  }

  header p,
  h1 {
    margin: 0;
  }

  header p {
    color: var(--smrt-color-on-surface-variant, #5e6470);
  }
</style>
