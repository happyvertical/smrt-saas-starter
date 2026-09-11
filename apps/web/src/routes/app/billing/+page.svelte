<script lang="ts">
  import {
    PlanPicker,
    type PlanPickerPlan,
    SubscriptionSummary,
    UsageThresholds,
  } from "@happyvertical/smrt-subscriptions/svelte";
  import { submitPlanSelection } from "$lib/billing-plan-selection";

  let { data } = $props();

  function choosePlan(plan: PlanPickerPlan) {
    submitPlanSelection(plan, data.currentPlan.planKey, submitCheckout);
  }

  function submitCheckout(planId: string) {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "?/checkout";
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "planId";
    input.value = planId;
    form.append(input);
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

  <SubscriptionSummary
    resolution={data.snapshot}
    periodEnd={data.periodEnd}
    periodDisposition="renews"
  />
  <UsageThresholds evaluations={data.snapshot.thresholdEvaluations} />

  {#if data.billingPortalAvailable}
    <form method="POST" action="?/portal">
      <button type="submit">Manage billing</button>
    </form>
  {/if}

  <PlanPicker
    plans={data.plans}
    selectedPlanKey={data.currentPlan.planKey}
    onSelect={choosePlan}
  />
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
